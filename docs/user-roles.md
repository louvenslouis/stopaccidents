# Rôles et modération

- `user` : rôle par défaut des nouveaux comptes et des sessions anonymes ; tous les parcours de signalement restent accessibles.
- `moderator` : suspension, remise en ligne et fusion réversible des publications.
- `admin` : droits de modération et attribution/retrait des rôles, y compris administrateur.

Les autorisations sont relues dans la base à chaque opération ; les métadonnées modifiables par le client ne font pas autorité. Le dernier administrateur ne peut pas être rétrogradé par l’application. Les comptes anonymes ne peuvent pas recevoir de rôle privilégié.

Le profil propose la gestion des rôles par identifiant de compte aux administrateurs. Les modérateurs retrouvent les publications suspendues dans leur profil et peuvent les remettre en ligne avec un motif. Les changements de rôle et de visibilité sont journalisés.

Une publication suspendue disparaît des flux, des statistiques, des détails publics et des nouvelles demandes d’URL de photo partagée. Les URL de photos déjà signées restent valables jusqu’à leur expiration (15 minutes). Les données originales sont conservées ; une modification de l’auteur ne lève pas la suspension.

## Initialisation

Les migrations `20260927033241_user_roles_moderation.sql` et `20260927033349_bootstrap_administrator.sql` ont été appliquées au projet connecté. La seconde désigne explicitement `louvenslouisl@gmail.com` comme premier administrateur. Pour une autre installation, désigner le compte voulu depuis une connexion de confiance :

```sql
insert into private.report_event_moderators(user_id, role)
select id, 'admin' from auth.users
where id = '<UUID du compte>'::uuid and not is_anonymous
on conflict (user_id) do update set role = excluded.role;
```

Les nominations suivantes passent par `public.set_user_role` dans l’application.

## Vérification locale

```sh
node --test tests/user-roles-database.test.mjs
npx tsc --noEmit
```
