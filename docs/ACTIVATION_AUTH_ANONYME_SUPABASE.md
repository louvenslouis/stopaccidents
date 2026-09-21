# Activer l’authentification anonyme dans Supabase

Ce réglage doit être effectué avec le compte **Owner** du projet Supabase **STOP Accidents**. Le compte Developer peut consulter le projet, mais ne peut pas modifier la configuration d’authentification.

## Étapes

1. Ouvrir le tableau de bord Supabase :
   <https://supabase.com/dashboard/project/vqzmzblwmbhmfoikpbhy/auth/providers>
2. Se connecter avec le compte ayant le rôle **Owner**.
3. Vérifier que le projet sélectionné est **STOP Accidents** et la branche **main**.
4. Dans **Authentication → Sign In / Providers**, trouver la section **User Signups**.
5. Activer **Allow anonymous sign-ins**.
6. Cliquer sur **Save changes**.

## Vérification

Après l’enregistrement, le bouton doit rester activé après actualisation de la page. L’application pourra alors créer un utilisateur temporaire avec `signInAnonymously()`.

## Si l’option reste grisée

- vérifier que la session utilise bien le compte **Owner** ;
- se déconnecter puis se reconnecter avec ce compte ;
- vérifier que le projet est bien **STOP Accidents** et non un autre projet ;
- demander à l’Owner de réaliser lui-même l’activation.

Ne jamais partager le mot de passe du compte Owner. Supabase recommande aussi de revoir les règles RLS et d’activer une protection CAPTCHA si l’authentification anonyme est exposée publiquement.

Documentation Supabase : <https://supabase.com/docs/guides/auth/auth-anonymous>
