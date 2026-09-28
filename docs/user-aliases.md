# Alias des utilisateurs

Chaque compte Supabase, y compris les comptes invités, reçoit un alias à sa création.
Les comptes existants sont également traités par la migration `user_aliases`.

L’alias associe deux mots créoles ou deux mots français, sans espaces, accents ni
caractères spéciaux : `ZwazoLib`, `FlanboKle`, `ColibriSerein`. Si les premières
combinaisons sont déjà prises, des chiffres aléatoires sont ajoutés. Une contrainte
unique et des tentatives supplémentaires gèrent les collisions concurrentes.
La génération n’utilise ni e-mail, ni nom, ni identifiant du compte.

L’alias reste associé au compte et ne change pas avec la langue de l’application.
Les clients peuvent uniquement lire leur propre ligne de `public.user_aliases`;
ils ne peuvent pas créer, modifier ou supprimer un alias. Les fonctions de
génération sont privées et inaccessibles aux clients.

Le profil affiche l’alias à la place de l’e-mail. `read_report_event` expose
`author_alias` sur les témoignages publiés, sans exposer la correspondance avec
l’identifiant du compte. La suppression du compte supprime sa ligne d’alias.
