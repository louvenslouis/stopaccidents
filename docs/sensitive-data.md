# Protection des données sensibles locales

Les brouillons de signalement (texte, coordonnées et photographies encodées)
sont chiffrés avec AES-256-GCM. Chaque enregistrement utilise une nouvelle clé,
un nonce aléatoire de 12 octets et une étiquette d’authentification de 16 octets.
La clé de stockage, qui contient l’identifiant du compte et le type de signalement,
est incluse comme donnée authentifiée : déplacer un brouillon vers un autre
compte ou modifier son contenu provoque une erreur de déchiffrement.

## Mobile

`expo-crypto` effectue le chiffrement. Seul le contenu chiffré est écrit dans le
répertoire de documents. La clé et le nom du fichier sont enregistrés ensemble
dans `expo-secure-store`, avec `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, après l’écriture
du fichier. Une sauvegarde interrompue avant ce commit conserve le brouillon
précédent. Les opérations sur un même brouillon sont sérialisées.

Les anciens fichiers JSON sont migrés à leur prochaine lecture ou sauvegarde,
puis supprimés après le commit. Une erreur de suppression est remontée ; la
suppression logique ne garantit pas l’effacement physique des blocs flash ni des
anciennes sauvegardes du système. Les brouillons jamais rouverts restent dans
leur ancien format jusqu’à leur migration.

## Web

Web Crypto génère une clé AES non exportable pour chaque sauvegarde. IndexedDB
conserve atomiquement cette CryptoKey et le contenu chiffré. La migration des
anciennes chaînes en clair vérifie la valeur courante dans une transaction pour
ne pas écraser une sauvegarde plus récente provenant d’un autre onglet. Aucun
repli en clair n’est prévu si le navigateur refuse la cryptographie ou le stockage.

Cette protection web ne fournit pas l’isolation matérielle du trousseau mobile :
un script exécuté dans la même origine peut utiliser la clé pour déchiffrer les
données. Elle ne protège donc pas contre une XSS ou un profil navigateur compromis.

## Périmètre

Le chiffrement local ci-dessus concerne les brouillons. Les sessions mobiles restent
protégées par le stockage sécurisé existant. Le stockage des sessions web et les
fichiers temporaires des appareils photo ne sont pas modifiés. Le chiffrement
serveur est décrit ci-dessous. Aucun de ces mécanismes ne constitue du chiffrement
de bout en bout ; le backend autorisé peut déchiffrer les données.

## Vérification

`node --test tests/draft-encryption.test.mjs` couvre les données Unicode et les
photos volumineuses, la variation du contenu chiffré, l’altération des données,
le changement de propriétaire, la migration, les écritures concurrentes et les
échecs de commit. Les tests utilisent Web Crypto réel avec des adaptateurs de
stockage simulés ; un test sur appareil reste nécessaire pour valider le trousseau
et l’implémentation native d’Expo.

Référence : https://docs.expo.dev/versions/v57.0.0/sdk/crypto/


# Chiffrement côté Supabase

Migration : `supabase/migrations/20261010175718_encrypt_sensitive_user_data.sql`.

## Données couvertes

- Numéros d’identité, plaques, type et couleur du véhicule dans le profil privé.
- Identifiants explicites des signalements d’accident et de véhicule suspect.
- Photos des pièces d’identité, via les nouvelles RPC de photo chiffrée.
- Adresses et coordonnées domicile/travail.
- Géométrie, libellés, horaires et paramètres des trajets ; leurs bornes géographiques dérivées.
- Dernières coordonnées et précision du partage de position.
- Alias : stockage chiffré avec empreinte HMAC pour l’unicité et les invitations.

Les identifiants de comptes, relations entre proches, consentements, dates,
états de livraison et références aléatoires restent disponibles pour les contrôles
d’accès. Les données publiques des signalements, les photos destinées au public,
les tokens push et les informations de Supabase Auth (dont les e-mails) ne sont
pas couverts par ce chiffrement de champs. La protection native de la plateforme
et les contrôles d’accès continuent de s’appliquer à ces données.

## Algorithme et clés

`pgcrypto.pgp_sym_encrypt` utilise AES-256 dans le format OpenPGP, avec protection
d’intégrité MDC activée, sel aléatoire, S2K itéré et sans compression. Il ne s’agit
pas du mode GCM utilisé pour les brouillons locaux. Chaque contenu inclut son
contexte (compte/enregistrement/champ) et celui-ci est vérifié au déchiffrement.
Une altération, une clé absente ou un contexte incorrect fait échouer la lecture,
sans repli sur une valeur en clair.

Une clé de données aléatoire de 256 bits est générée **dans PostgreSQL** et stockée
dans Supabase Vault, qui la chiffre sous la clé racine du projet gérée séparément.
Une seconde clé indépendante sert aux empreintes HMAC-SHA-256 pour les correspondances
exactes. Aucun secret n’est inscrit dans la migration, le dépôt, une variable
`EXPO_PUBLIC_*`, une réponse API ou un journal applicatif.

Les clés sont refusées à `anon` et `authenticated`. Les primitives génériques
de chiffrement et la table des versions sont aussi refusées à `service_role`.
Cependant, Supabase conserve des droits SQL sur Vault pour son rôle backend
privilégié `service_role` ; ces droits gérés par le fournisseur ne sont pas
révocables par le rôle `postgres` du projet. Ce rôle backend reste donc dans le
périmètre de confiance. Vault ne doit pas être ajouté aux schémas exposés de
l’API et aucune fonction publique ne doit en retourner les secrets. Les wrappers publics utilisent les droits de l’appelant ; les
fonctions métier privées privilégiées vérifient le compte, le propriétaire et/ou
les autorisations existantes du worker. Les fonctions de chiffrement génériques
ne sont jamais des RPC accessibles aux clients.

Le rôle administrateur PostgreSQL et les administrateurs autorisés de Vault
peuvent déchiffrer. Cela protège une copie de la base sans la clé racine, pas un
backend entièrement compromis. Une sauvegarde restaurée nécessite aussi la clé
racine Vault correspondante. Les anciennes sauvegardes/WAL antérieures à cette
migration peuvent encore contenir les anciennes données en clair jusqu’à leur
expiration ; cette migration ne les efface pas.

## Alertes et migration

Les correspondances comparent des HMAC secrets des identifiants normalisés,
avec un domaine distinct par type. Les proches reçoivent l’alerte, jamais le numéro
ou la photo de la pièce d’identité. Les consentements, dates, corrections,
connexions acceptées et contrôles avant envoi restent en vigueur. La rotation de
la clé de données ne change pas la clé des correspondances.

Les lignes existantes sont chiffrées lors de la migration transactionnelle. Les
colonnes historiques ne conservent aucune copie des champs protégés en clair.
Le remplissage initial des identifiants ne déclenche pas de nouvelles alertes.

Le bucket historique `identity-cards` n’accepte plus les lectures et écritures
clientes. La migration refuse de s’appliquer si des fichiers historiques existent :
ils doivent être transférés par une procédure serveur vérifiée avant de recommencer.
Le projet cible ne contenait aucun de ces fichiers lors de la vérification préalable.
Les nouvelles photos sont enregistrées chiffrées dans `private.identity_photo_data`,
avec un maximum de 6 Mio par image et cinq images par compte (dont les envois non
rattachés). Leur suppression n’est possible que si elles ne sont plus référencées.

Les clients doivent utiliser cette version de l’application : `read_saved_places`,
`save_saved_places`, `read_saved_routes`, `save_saved_route`, `save_identity_photo`,
`read_identity_photo`, `delete_identity_photo`. Les anciennes écritures directes
d’adresses/trajets et les URLs signées des pièces d’identité ne sont plus utilisées.
Une nouvelle version mobile doit être distribuée pour ces parcours.

## Rotation administrative

Exécuter uniquement avec un accès administrateur PostgreSQL protégé :

```sql
select private.rotate_user_data_key();
select private.reencrypt_user_data_batch(100);
```

Répéter le second appel jusqu’au retour de `0`. Le paramètre limite le nombre de
lignes **par table**, avec un plafond de cinq photos par appel. Les nouvelles
écritures utilisent immédiatement la nouvelle version ; les anciennes clés restent
présentes pour lire les lignes non encore migrées et les sauvegardes anciennes.
Aucune clé n’est supprimée automatiquement. Ne pas faire tourner la clé racine Vault
avec cette procédure : c’est une opération de restauration/rechiffrement distincte.
La rotation d’une clé HMAC compromise exige une reconstruction coordonnée des index ;
la rotation ordinaire ci-dessus ne prétend pas résoudre ce cas.

## Tests

`tests/server-encryption.test.mjs` vérifie la migration de données existantes,
l’absence de copies en clair, les lectures autorisées, les refus entre comptes,
les droits sur les clés, l’altération, le contexte, la perte de clé, la rotation,
les photos et les adresses. Les suites de profil de sécurité, de position et de
trajets vérifient les alertes et les consentements après chiffrement.

PGlite exécute le véritable `pgcrypto` ; seul Vault est remplacé par un double en
mémoire explicitement limité aux tests. Les droits et le chiffrement Vault doivent
aussi être vérifiés sur le projet Supabase après application.

Références : [pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html),
[Supabase Vault](https://supabase.com/docs/guides/database/vault).

## Vérification du déploiement

Appliquée sur le projet `vqzmzblwmbhmfoikpbhy` le 10 octobre 2026, version de
migration `20261010175718`. Les vérifications SQL ont confirmé le chiffrement des
lignes existantes, leur déchiffrement par les fonctions internes, le chiffrement
des clés dans Vault et le refus d’accès aux clés pour les rôles clients.
Un test transactionnel avec comptes fictifs a vérifié la lecture d’une photo
chiffrée et la création d’une alerte pour un proche sans exposer le numéro ; la
transaction a été annulée et aucun envoi push n’a été déclenché par ce test.

L’analyse de sécurité Supabase ne rapporte pas de nouvelle alerte de niveau
avertissement liée à cette migration. Les trois nouvelles tables privées ont RLS
sans politique publique, volontairement : les clients n’ont aucun privilège sur
ces tables et passent par les fonctions autorisées.
[Explication de cet avis informatif](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
Les avertissements préexistants sur les
[politiques pour sessions anonymes](https://supabase.com/docs/guides/database/database-advisors?queryGroups=lint&lint=0012_auth_allow_anonymous_sign_ins)
et la [protection contre les mots de passe compromis désactivée](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
restent distincts de ce changement.


## Alias et commentaires

La migration `encrypt_user_aliases` déplace le stockage dans
`private.user_alias_data` : seul le texte chiffré AES-256 et une empreinte HMAC
avec un domaine distinct sont persistés. La clé de chiffrement versionnée et la
clé HMAC séparée utilisent le Vault existant. La rotation administrative par lots
couvre également les alias ; elle conserve leur empreinte et leur unicité.

`public.user_aliases` devient une vue `security_invoker` compatible avec les
lectures et modifications de profil existantes. Sa fonction interne ne renvoie
que la ligne du compte connecté. Le déclencheur de modification vérifie le
propriétaire et refuse les comptes invités ; les clients n’ont aucun accès au
stockage privé ni aux fonctions génériques de chiffrement. La vue privée de
projection n’est accessible qu’au backend autorisé.

Les commentaires, réponses, témoignages, classements, invitations, alertes aux
proches et partages de position conservent leurs règles d’accès. Le serveur
déchiffre les alias nécessaires à ces réponses. Les alias affichés publiquement
restent publics : le chiffrement protège le stockage, pas leur visibilité dans
les commentaires. Il n’efface pas les anciennes sauvegardes en clair.
Cette migration d’alias ne nécessite aucun changement d’interface ni nouvelle
version de l’application. `tests/alias-encryption.test.mjs` couvre notamment la
migration, les commentaires et leurs réponses, l’isolation et la rotation.

Appliquée sur Supabase le 10 octobre 2026, migration `20261010183953`.
Les onze alias existants ont été migrés et leur déchiffrement vérifié, sans
exposer leur contenu dans les sorties de diagnostic. Un test transactionnel
sur Supabase a vérifié la lecture/modification du profil, l’isolation entre
comptes, l’unicité, les commentaires et les réponses ; les données fictives
ont été annulées. Aucun nouvel avertissement de sécurité Supabase ; l’avis
informatif RLS sans politique sur `private.user_alias_data` est attendu pour
ce stockage inaccessible aux clients.
