# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

### Supabase

The app uses the Supabase project configured in `.env.local`. For a new checkout,
copy `.env.example` to `.env.local` and replace the placeholder publishable key.

Only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are
allowed in the mobile app. Never add a Supabase secret key to an Expo environment
variable, source file, build profile, or client bundle. Privileged operations must
run in a server or Supabase Edge Function and every exposed table must use Row Level
Security (RLS) with least-privilege policies.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.

## Carte OpenStreetMap

### Météo

Une pastille discrète en haut à droite affiche la température en °C, les conditions
en français, le vent en km/h, le nom court de la zone et la probabilité de pluie
pour chacune des trois prochaines heures. Elle utilise la position connue par
l’application ; déplacer la carte ou rechercher un lieu ne change pas cette
référence. En l’absence de position connue, elle utilise le centre de la carte.
Si aucun nom de zone n’est disponible, la carte l’indique explicitement.
Ce comportement est commun au web et au natif. Les conditions actuelles
proviennent des modèles de [Open-Meteo](https://open-meteo.com/en/docs), dont le
[serveur est open source](https://github.com/open-meteo/open-meteo).
Le lien d’attribution reste visible dans la pastille.

Les coordonnées sont arrondies à deux décimales ; les appels attendent 650 ms après
un changement de zone et sont mis en cache 15 minutes (32 zones maximum en mémoire).
La météo s’actualise pendant la consultation et au retour dans l’application.
Les requêtes sont annulées en quittant la carte ou en arrière-plan. Une erreur,
un délai supérieur à 8 secondes ou des données de plus d’une heure affichent
« Indisponible » ; aucune valeur fictive n’est utilisée.

Aucune clé n’est nécessaire pour l’API publique, réservée à l’usage non commercial
selon les [conditions Open-Meteo](https://open-meteo.com/en/terms).
`EXPO_PUBLIC_WEATHER_URL` permet de choisir un serveur auto-hébergé ou un proxy
compatible `/v1/forecast`. Ne jamais mettre une clé privée dans cette URL publique.

L’onglet Carte affiche les tuiles OpenStreetMap avec Leaflet 1.9.4, avec déplacement,
zoom et attribution visible. La navigation est limitée au rectangle autour d’Haïti
(18, −74.55) à (20.1, −71.6). Le zoom minimum s’adapte à la taille de la carte pour
garder la vue dans cette zone, y compris après redimensionnement. Ce rectangle ne
masque pas les portions de pays voisins à l’intérieur de ses limites.
Le web utilise une iframe avec un document contrôlé par l’application et
iOS/Android utilisent `react-native-webview` (inclus dans Expo Go ; recompiler les
builds de développement existants après installation). Aucune clé API ni permission
de localisation n’est nécessaire. La carte nécessite une connexion Internet ; un
bouton permet aussi de l’ouvrir dans OpenStreetMap.

La fonction `read_map_accidents` renvoie les 500 signalements géolocalisés les plus
récents dans cette zone, y compris les formulaires partiels. Une mention indique
quand cette limite est atteinte. Le flux public conserve les champs du résumé de
l’accueil ; les tables gardent leurs règles RLS et aucun identifiant privé n’est
envoyé à la carte. Les accidents sans coordonnées ou hors zone sont exclus.
Les marqueurs reprennent les couleurs de gravité et ouvrent la fiche existante.
Les marqueurs proches sont regroupés selon le zoom, avec un choix des accidents
et la couleur de la gravité la plus élevée du groupe.
La carte se centre une fois sur le dernier accident ; les actualisations suivantes
conservent le zoom et la position. Le flux est actualisé toutes les 30 secondes
pendant la consultation, au retour sur l’onglet et après fermeture des détails.
Un échec conserve les derniers résultats avec un message et un bouton Actualiser.

L’intégration respecte le cache HTTP du navigateur/WebView et identifie l’application
native avec `StopAccidents/1.0`. Aucun téléchargement hors ligne n’est effectué.
Le service public reste soumis à la [politique des tuiles OSM](https://operations.osmfoundation.org/policies/tiles/).
Leaflet est chargé depuis unpkg avec une version et des empreintes SRI fixes.
Le chargement est confirmé par la première tuile affichée ; les erreurs remontent
à l’application. Le lien externe ouvre le site OSM, hors de ces restrictions.

## Signalement d’accident

Le bouton « SIGNALER » de l’accueil ouvre le choix du type de signalement.
La catégorie « Accident » demande l’autorisation de localisation au choix de la
catégorie si elle n’est pas déjà accordée, puis recherche une position précise.
Les autorisations approximatives sont refusées avec un accès aux réglages natifs.
Le GPS attend une mesure datant de moins de 30 secondes, avec une précision
annoncée de 30 mètres ou mieux, pendant 35 secondes maximum. Aucune saisie
manuelle ne remplace le GPS. La recherche s’arrête à la fermeture du formulaire.

Le lieu est nommé automatiquement via Photon/OpenStreetMap (si disponible), puis
le signalement est enregistré avant le passage automatique au type d’accident.
Le formulaire affiche alors trois étapes : type d’accident, gravité, compléments.
Le lieu et la précision GPS restent visibles au-dessus du choix du type, avec un
champ de repère facultatif. Son contenu ajuste `location_description` sur le même
signalement au prochain « Suivant », en conservant les coordonnées d’origine.
Si la recherche du nom échoue, les coordonnées restent utilisables et aucune
adresse n’est inventée. Un échec d’envoi propose une reprise sans doublon.
Chaque « Suivant » attend la confirmation Supabase avant de poursuivre. Les
étapes suivantes ajustent ce même signalement ; revenir modifier une étape ne
supprime pas les autres informations. Une fermeture conserve les étapes déjà
validées en base. Le brouillon en cours reste accessible après fermeture ou redémarrage de l’application.
La caméra intégrée ne propose aucun accès à la galerie ; jusqu’à quatre photos
JPEG de 6 Mo chacune peuvent être ajoutées aux compléments.

### Configuration Supabase

Sur le projet `vqzmzblwmbhmfoikpbhy`, activer **Authentication → Sign In / Providers
→ Allow anonymous sign-ins**. Chaque visiteur obtient ainsi une identité Supabase
sans formulaire d’inscription. Les sessions natives utilisent le stockage sécurisé
existant ; les sessions web et natives sont persistantes pour reprendre les brouillons.

La migration `supabase/migrations/20260921030629_accident_reports.sql` crée :

- `accident_reports` : lieu, GPS et précision, type, gravité, notes, statut et auteur ;
- `accident_report_identifiers` : immatriculations et numéros d’identité facultatifs ;
- `accident_report_photos` : liens privés et date de capture ;
- le bucket privé `accident-photos` et la fonction `submit_accident_report`.

La migration progressive ajoute `completed_step` (1 à 4), `updated_at` et la
fonction `save_accident_report_step`. Le statut de traitement (`received`, etc.)
reste indépendant de l’avancement du formulaire. Les signalements historiques
sont considérés complets et l’ancienne fonction reste disponible.

### Signalements d’enlèvement

Le sélecteur **Signaler** propose aussi **Enlèvement**, après **Accident**. Ce
parcours enregistre successivement la localisation, les indices sur le ou les
véhicules avec leur direction, puis les indices sur la personne enlevée. Chaque
étape réutilise la même référence UUID et peut être reprise sans dupliquer le cas.

La migration `20260922042322_kidnapping_reports.sql` crée la table privée
`kidnapping_reports` et la fonction progressive
`save_kidnapping_report_step`. Les règles RLS limitent la lecture et la mise à
jour au seul auteur côté client ; ces données sensibles ne rejoignent ni le flux
public ni la carte des accidents. Le statut opérationnel et l’auteur ne peuvent
pas être modifiés par le client. Le formulaire rappelle de ne pas suivre le
véhicule et de contacter immédiatement les autorités compétentes, car l’envoi ne
les alerte pas automatiquement.

Les trois tables d’accidents utilisent RLS : seules les données de l’auteur sont accessibles
au client. Les mises à jour sont limitées aux champs du signalement ; l’auteur et
le statut de traitement ne peuvent pas être modifiés. Chaque étape écrit uniquement
ses propres champs et utilise la même référence UUID, y compris lors des reprises.
La dernière étape remplace les compléments dans une transaction : si un fichier ou
un identifiant est invalide, les informations précédemment enregistrées demeurent.

Le bucket est privé. Les photos sont téléversées après la création du signalement,
puis attachées avec les autres compléments. Le contenu d’un fichier déjà attaché
ne peut pas être écrasé. Les fichiers détachés ou les tentatives non confirmées
font l’objet d’un nettoyage au mieux ; une interruption réseau complète peut
nécessiter une purge d’exploitation via l’API Storage. Les étapes non validées ne
constituent pas une file hors ligne persistante et le brouillon n’est pas restauré
automatiquement au redémarrage. L’enregistrement ne déclenche pas les secours.

### Dernier accident sur l’Accueil

Le petit bouton de partage de la carte compacte prépare une image PNG et un texte
court avec le type, le lieu, la date, la gravité et un lien vers la fiche concernée.
L’image contient un QR code vers cette fiche ; le lien reste dans le texte partagé.
L’aperçu fige le signalement choisi même si l’accueil s’actualise. Le lien utilise
`EXPO_PUBLIC_SITE_URL` (par défaut `https://louvenslouis.github.io/stopaccidents/`)
et le paramètre `signalement=catégorie:UUID`, compatible avec l’hébergement statique.
Sur le web, le partage de fichiers est proposé lorsque le navigateur le permet ;
le téléchargement de l’image et la copie du texte restent disponibles.
Sur iOS/Android, `react-native-share` transmet le PNG avec la description et le lien.
Une nouvelle compilation native est nécessaire (`npx expo run:android` ou
`npx expo run:ios`) ; Expo Go permet l’aperçu et la copie du texte, sans le module
de partage d’images. Certaines applications destinataires peuvent ignorer le texte
accompagnant une image ; le bouton de copie permet de le joindre manuellement.

L’Accueil affiche le dernier signalement de tous les utilisateurs, ordonné par
date de création (puis par référence en cas d’égalité). Les signalements partiels
apparaissent immédiatement avec « À préciser » pour les étapes non renseignées.
La carte contient le type, le lieu, la gravité et la date du signalement. Elle ouvre
une fiche avec le lieu complet, les coordonnées et leur précision, le statut,
les dates, les précisions et les photos. Les numéros d’identité et les
immatriculations sont affichés seulement à leur auteur.

Quand seul le GPS est renseigné, la carte et la fiche recherchent le quartier ou
la commune via Photon (données OpenStreetMap) et l’affichent comme « Zone estimée ».
Le lieu saisi manuellement reste prioritaire. Les coordonnées restent disponibles
dans la fiche et servent de repli pendant la recherche, hors ligne ou si aucune
zone n’est trouvée. Cette recherche ne demande pas accès à la position du lecteur :
seules les coordonnées de l’accident sont envoyées au géocodeur, sans identifiant.
Les résultats sont mis en cache en mémoire pendant 24 heures (100 positions au
maximum), les échecs pendant une minute, et les appels simultanés sont regroupés.
Le service public Photon convient à un trafic modéré et ne garantit pas sa
disponibilité ; pour un trafic important, configurer une instance dédiée via
`EXPO_PUBLIC_GEOCODING_URL` (endpoint `/reverse` compatible Photon, HTTPS et CORS
activé pour le web). Voir les [conditions Photon](https://github.com/komoot/photon#demo-server).

### Lieux enregistrés du profil

Le domicile et le lieu de travail ne sont plus des champs texte libres. Une
personne connectée ouvre un sélecteur plein écran, puis recherche une adresse ou
un lieu via Photon, ou touche directement un point sur la carte OpenStreetMap.
L’application conserve le libellé affiché avec la latitude et la longitude
exactes du repère choisi. Les résultats et les points sélectionnables sont
limités au rectangle de navigation de la carte autour d’Haïti.

La migration `20260922055406_precise_saved_places.sql` ajoute les coordonnées à
la ligne privée `user_saved_places` sans modifier ses règles RLS réservées au
propriétaire. Les anciennes adresses texte restent lisibles, mais l’application
demande de les repositionner sur la carte avant leur prochain enregistrement.
La recherche utilise `EXPO_PUBLIC_PLACE_SEARCH_URL` (endpoint `/api` compatible
Photon) lorsqu’il est défini et revient sinon au service public Photon. Le
géocodage inverse continue d’utiliser `EXPO_PUBLIC_GEOCODING_URL`.

La migration `20260921035356_shared_accident_feed.sql` ajoute la lecture partagée
`read_accident` : sans référence, elle renvoie uniquement le résumé du dernier
accident ; avec une référence, elle renvoie les détails autorisés. L’implémentation
privilégiée est isolée dans le schéma `private`, vérifie l’identité de l’auteur pour les numéros privés et
renvoie une liste explicite de champs. Les tables conservent leurs règles RLS
réservées à l’auteur. Seules les photos attachées sont consultables par les autres
utilisateurs, via des URL signées de 15 minutes ; les téléversements non attachés
restent privés. Le formulaire indique cette visibilité avant l’envoi des compléments.

La migration `20260921040534_public_accident_read_access.sql` autorise aussi la
consultation sans connexion, sans créer de compte ni de session anonyme. L’Accueil se
rafraîchit au retour sur l’onglet, au retour au premier plan, à la fermeture d’une
fiche ou du formulaire et toutes les 30 secondes pendant sa consultation.
Un bouton permet aussi l’actualisation manuelle. La fiche recharge ses informations
à chaque ouverture et propose une actualisation. Une erreur de photo ne masque
pas les autres détails. Aucun faux accident n’est affiché lorsque la base est vide.

### Vérification

- `npm test` : validation du formulaire et tests PostgreSQL embarqués (PGlite),
  avec schémas système Supabase minimaux et migration réelle non modifiée ;
- `npx tsc --noEmit` et `npm run lint` ;
- `npx expo export -p web`.

Les scripts `supabase/tests/*.sql` peuvent aussi être exécutés avec `psql` dans une
base de développement Supabase ; toutes ses données synthétiques sont annulées.
La caméra et le GPS doivent être vérifiés sur appareil physique. Une nouvelle
compilation native est nécessaire pour prendre en compte les modules et permissions
ajoutés ; les navigateurs nécessitent HTTPS ou localhost pour ces fonctions.

## Itinéraires sur la carte

Après une recherche ou le choix Domicile/Travail, « Itinéraire » ouvre le panneau
avec l’arrivée sélectionnée. Le départ peut être la position GPS ou un lieu saisi.
On peut modifier et inverser les deux lieux, calculer un trajet en voiture,
comparer jusqu’à trois propositions, consulter les directions et lancer le guidage.
La prévisualisation entre deux adresses fonctionne sans permission GPS.

Le service configurable `EXPO_PUBLIC_ROUTING_URL` doit accepter le protocole
[OSRM Route](https://project-osrm.org/docs/v5.24.0/api/#route-service). Il renvoie
les chemins sur le réseau routier OpenStreetMap, la géométrie GeoJSON complète,
les manœuvres, les distances en mètres et les durées en secondes. L’URL par défaut
est le serveur de démonstration public OSRM ; prévoir un service dédié pour le
volume de production. Aucune clé secrète ne doit figurer dans cette variable.
Les coordonnées des deux extrémités sont envoyées à ce service au calcul.
Le rattachement à une route est limité à 100 m. Une absence de route ou une panne
réseau produit une erreur avec possibilité de réessayer, jamais un tracé à vol d’oiseau.
Les requêtes expirent après 15 s ; changer les lieux ou fermer annule le calcul.

`route-geometry.ts` indexe les segments du trajet dans une grille locale de 250 m.
Chaque signalement chargé est projeté sur les segments voisins : ceux dont la
distance au tracé est au plus de 60 m sont dédupliqués puis triés par distance
cumulée depuis le départ. Les marqueurs et la liste utilisent le même résultat,
actualisé avec le flux existant `read_map_reports` toutes les 30 s. La proximité
est géométrique : elle ne permet pas de distinguer une rue parallèle, un pont ou
un sens de circulation. Les listes indisponibles, périmées ou tronquées sont
signalées ; « aucun signalement chargé » ne garantit pas une route sans danger.
Les signalements ne ferment pas automatiquement les routes et ne modifient pas
le classement du routeur, qui privilégie le temps estimé hors trafic réel.

Le guidage obtient une nouvelle position GPS, conserve l’alternative sélectionnée
si le départ est à moins de 75 m, sinon recalcule depuis la position actuelle.
Il exige une précision connue d’au plus 50 m, suit la progression le long des
segments avec continuité aux croisements/boucles, affiche les manœuvres à venir
et les signalements restants. Un écart supérieur à max(75 m, 2 × précision GPS)
pendant 5 s déclenche un recalcul, au plus une fois toutes les 20 s. Les mesures
imprécises suspendent la progression ; une attente initiale de 25 s sans position
suffisante propose de réessayer. L’arrivée est détectée à moins de 50 m du dernier
point routier et avec au plus 40 m de tracé restant. Le suivi s’arrête à l’arrivée,
à la fermeture, au changement d’onglet ou en arrière-plan ; il faut le relancer
au retour. Ce comportement utilise la localisation au premier plan d’
[Expo 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/#locationwatchpositionasyncoptions-callback-errorhandler).

Les tests `tests/routing.test.mjs` vérifient la projection, les limites du couloir,
les boucles, l’arrivée, les réponses du routeur, les annulations, les erreurs GPS
et le recalcul temporisé. Les ponts iframe/WebView partagent le même document
Leaflet pour le tracé, les repères A/B et le cadrage.

### Récompenses de signalement

Chaque nouveau parcours terminé donne 25 points de vigilance (accident : étape 4 ; autres catégories : étape 3). Le serveur crédite les points dans la transaction de la dernière étape ; le bouton « Récolter » anime uniquement leur affichage. Une nouvelle tentative ou une correction du même signalement ne crédite pas une seconde récompense. Le solde et le niveau (250 points par niveau) apparaissent dans le profil, y compris pour la session invitée. Les points restent propres à chaque identité Supabase ; aucune fusion invité/compte n’est effectuée.

Appliquer les migrations dans leur ordre, jusqu’à `20260922072734_report_rewards.sql`, avant de publier cette interface. Cette migration dépend des tables barricades, présence armée et véhicules suspects créées par les migrations précédentes. Aucun rattrapage des anciens signalements n’est effectué. Les clients ne peuvent ni ajouter ni modifier des points et ne peuvent lire que leur propre solde.

Validation : `npm test`, `npx tsc --noEmit`, `npm run lint`. Les tests de récompenses couvrent les cinq catégories, les étapes incomplètes, les nouvelles tentatives, l’annulation transactionnelle et l’isolation entre comptes.

## Événements, témoignages et doublons

Un événement regroupe plusieurs signalements sans supprimer les témoignages ni
leurs photos. Les anciennes fiches sont reprises individuellement ; aucune fusion
fondée uniquement sur la proximité n’est effectuée. La carte et l’accueil affichent
un résumé par événement, le nombre de témoignages et la date du dernier témoignage.
La fiche permet de consulter séparément les détails autorisés de chaque source.
Le nombre de témoins compte les identités distinctes, sans rendre ces identités publiques.

Après la localisation, avant le premier enregistrement, le formulaire propose au
maximum cinq événements récents de la même catégorie. L’utilisateur peut ajouter
son témoignage à une fiche ou choisir explicitement un événement distinct.
Les seuils initiaux sont configurés dans `private.report_event_rules` :

| Catégorie | Rayon de base | Fenêtre depuis le témoignage |
| --- | ---: | ---: |
| Accident | 150 m | 30 minutes |
| Enlèvement | 150 m | 20 minutes |
| Route barricadée | 100 m | 6 heures |
| Présence d’hommes armés | 200 m | 30 minutes |
| Voiture suspecte | 100 m | 10 minutes |
| Tirs entendus | 500 m | 10 minutes |

La recherche ajoute l’incertitude GPS des deux positions (30 m maximum chacune),
ignore les témoignages clôturés et utilise l’heure du premier enregistrement,
pas celle d’une correction. Pour les tirs, les positions restent des lieux d’écoute.
Ces seuils sont des paramètres de départ à ajuster avec les retours terrain.

La réservation d’événement est idempotente pour chaque identifiant de signalement.
Une réservation dont le formulaire n’a pas été enregistré ne crée pas de marqueur.
Les anciens clients restent compatibles : les déclencheurs associent leurs nouveaux
signalements à un événement. Le contrôle serveur protège l’auteur et valide le
rattachement demandé, même si le client contourne le formulaire.

Les brouillons complets, y compris les photos en cours, sont sauvegardés avant
l’envoi et après les modifications : IndexedDB sur le web ; fichier dans l’espace
privé de l’application avec pointeur SecureStore sur mobile. Un nouveau fichier
est écrit avant le remplacement du pointeur ; les versions précédentes sont ensuite
supprimées. Les brouillons sont séparés par identité et catégorie. Une erreur de
restauration bloque le parcours avec un bouton de reprise au lieu de recréer une
fiche. La session web est désormais persistante pour retrouver le même auteur après
un rechargement. Effacer les données du navigateur ou désinstaller l’application
peut supprimer cette capacité de reprise.

Les points restent attribués à la fin du parcours : une seule récompense par
identité et événement. Une nouvelle fiche proche, récente et de même catégorie
créée par cette identité n’ouvre pas de seconde récompense, même si elle a été
présentée comme distincte. Cela conserve le témoignage mais limite les récompenses
répétées. Les créations depuis des identités différentes ne peuvent pas être
reconnues comme provenant d’une même personne par ce mécanisme.

### Modération et annulation d’une fusion

La migration `20260922113709_report_events.sql` ajoute une liste de modérateurs
privée. Aucun droit de modération n’est accordé automatiquement. Pour habiliter un
compte, un administrateur de la base ajoute son UUID Auth à
`private.report_event_moderators(user_id)`. Une identité invitée peut techniquement
y figurer, mais un compte durable facilite l’administration.

Les modérateurs voient dans la fiche l’identifiant de l’événement, un champ pour
l’identifiant de destination et un motif obligatoire. `merge_report_events` regroupe
uniquement des événements de même catégorie. L’opération conserve les sources,
est journalisée et peut être annulée depuis la fiche avec `undo_report_event_merge`.
Les liens sont sérialisés pour éviter les cycles. L’annulation restaure les groupes
antérieurs ; les contributions ajoutées directement au groupe de destination y
restent. Le journal des points est conservé : les récompenses d’une même identité
sont comptées une fois par groupe fusionné, puis recalculées après une annulation.

Vérification : `npm test` couvre le SQL réel dans PostgreSQL/PGlite, la recherche
par catégorie, les droits, les réservations répétées, les récompenses et les fusions
réversibles, ainsi que la restauration des brouillons et le choix d’un événement.

### Stations et transport en commun sur la carte

Les stations, leurs trajets directionnels, les types Taptap/Bus et les tarifs
en gourdes proviennent de Supabase. La migration `20260923024458_transport_stations.sql`
inclut cinq stations et huit trajets d’exemple, affichés sans mention de démonstration
dans l’interface. Le catalogue est accessible en lecture
seule depuis l’application. Voir [le modèle et les exemples](docs/transport-stations.md).
