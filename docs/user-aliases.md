# Alias des utilisateurs

Chaque compte Supabase, y compris les comptes invités, reçoit un alias à sa création.
Les comptes existants sont également traités par la migration `user_aliases`.

L’alias associe deux mots créoles ou deux mots français, sans espaces, accents ni
caractères spéciaux : `zwazolib`, `flanbokle`, `colibriserein`. Si les premières
combinaisons sont déjà prises, des chiffres aléatoires sont ajoutés. Une contrainte
unique et des tentatives supplémentaires gèrent les collisions concurrentes.
La génération n’utilise ni e-mail, ni nom, ni identifiant du compte.

L’alias reste associé au compte et ne change pas avec la langue de l’application.
Les clients peuvent uniquement lire leur propre ligne de `public.user_aliases`.
Les comptes inscrits peuvent modifier leur alias et leur étape de configuration ;
les invités ne peuvent pas les modifier. L’identifiant et la date de création
ne sont jamais modifiables par le client. La contrainte unique gère les alias déjà pris.
`public.suggest_user_alias` réutilise le générateur existant sans enregistrer la suggestion.

Après inscription, le parcours demande un alias saisi ou généré, puis un avatar.
`onboarding_step` conserve la progression (`alias`, `avatar`, `complete`) pour
reprendre après une interruption. Les comptes inscrits avant la migration
`profile_onboarding` conservent leur profil sans repasser par ces étapes.

Le profil affiche l’alias à la place de l’e-mail. `read_report_event` expose
`author_alias` sur les témoignages publiés, sans exposer la correspondance avec
l’identifiant du compte. La suppression du compte supprime sa ligne d’alias.

Les alias enregistrés contiennent uniquement `a-z` et `0-9` (4 à 40 caractères,
avec une lettre au début). Les espaces, caractères invisibles et remplissages
hangul sont refusés par la validation et par la contrainte SQL. Les anciennes
valeurs sont converties en minuscules sans changer leur propriétaire.

Pendant la saisie, les majuscules ASCII deviennent des minuscules. Après 350 ms
sans modification, `is_user_alias_available` vérifie la disponibilité et renvoie
uniquement un booléen aux comptes inscrits. Les requêtes précédentes sont annulées ;
une erreur réseau ou un résultat obsolète ne peut pas activer « Continuer ».
La disponibilité n’est pas une réservation : les contraintes uniques (dont l’index
sur `lower(alias)`) empêchent deux sauvegardes concurrentes du même alias.
