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

## Signalement d’accident

Le bouton « SIGNALER » de l’accueil ouvre le choix du type de signalement.
La catégorie « Accident » demande l’autorisation de localisation au choix de la
catégorie si elle n’est pas déjà accordée, puis recherche une position précise.
Une autorisation approximative est signalée avec un accès aux réglages natifs.
En cas de refus ou de GPS indisponible, le lieu peut être renseigné manuellement.

Le formulaire comporte quatre étapes : lieu, type d’accident, gravité, compléments.
Le premier « Suivant » crée immédiatement un signalement reçu avec son lieu.
Chaque « Suivant » attend la confirmation Supabase avant de poursuivre. Les
étapes suivantes ajustent ce même signalement ; revenir modifier une étape ne
supprime pas les autres informations. Une fermeture conserve les étapes déjà
validées en base. Le brouillon en cours reste accessible pendant la session.
La caméra intégrée ne propose aucun accès à la galerie ; jusqu’à quatre photos
JPEG de 6 Mo chacune peuvent être ajoutées aux compléments.

### Configuration Supabase

Sur le projet `vqzmzblwmbhmfoikpbhy`, activer **Authentication → Sign In / Providers
→ Allow anonymous sign-ins**. Chaque visiteur obtient ainsi une identité Supabase
sans formulaire d’inscription. Les sessions natives utilisent le stockage sécurisé
existant ; la session web reste en mémoire.

La migration `supabase/migrations/20260921030629_accident_reports.sql` crée :

- `accident_reports` : lieu, GPS et précision, type, gravité, notes, statut et auteur ;
- `accident_report_identifiers` : immatriculations et numéros d’identité facultatifs ;
- `accident_report_photos` : liens privés et date de capture ;
- le bucket privé `accident-photos` et la fonction `submit_accident_report`.

La migration progressive ajoute `completed_step` (1 à 4), `updated_at` et la
fonction `save_accident_report_step`. Le statut de traitement (`received`, etc.)
reste indépendant de l’avancement du formulaire. Les signalements historiques
sont considérés complets et l’ancienne fonction reste disponible.

Les trois tables utilisent RLS : seules les données de l’auteur sont accessibles
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
