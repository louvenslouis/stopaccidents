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

Le bouton de l’accueil ouvre un bottom sheet en trois étapes : accident, gravité,
puis précisions et photos. La caméra intégrée ne propose aucun accès à la galerie.
Les coordonnées GPS ne sont demandées qu’au toucher du bouton correspondant.
Les champs facultatifs sont les plaques, les pièces d’identité, les remarques et
jusqu’à quatre photos JPEG de 6 Mo maximum chacune.

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

Les trois tables utilisent RLS, avec lecture limitée à l’auteur. Le statut de
traitement est réservé au serveur. Le bucket est privé ; les photos attachées à
un signalement ne peuvent pas être remplacées ou supprimées par le client.
L’enregistrement des trois tables est transactionnel et une référence UUID stable
évite les doublons lors d’une reprise. Les photos sont téléversées avant cette
transaction ; en cas d’échec, l’application tente de supprimer les fichiers non
attachés. Une interruption complète ou une absence prolongée de réseau peut laisser
des téléversements privés non attachés : leur purge périodique doit être assurée
par l’exploitation, via l’API Storage (pas en supprimant directement ses lignes SQL).

Le formulaire reste disponible pendant la session de l’application. Il ne constitue
pas une file d’envoi hors ligne persistante. Un accusé de réception signifie que
les données ont été enregistrées, sans déclenchement automatique des secours.

### Vérification

- `npm test` : validation du formulaire et tests PostgreSQL embarqués (PGlite),
  avec schémas système Supabase minimaux et migration réelle non modifiée ;
- `npx tsc --noEmit` et `npm run lint` ;
- `npx expo export -p web`.

`supabase/tests/accident_reports.sql` peut aussi être exécuté avec `psql` dans une
base de développement Supabase ; toutes ses données synthétiques sont annulées.
La caméra et le GPS doivent être vérifiés sur appareil physique. Une nouvelle
compilation native est nécessaire pour prendre en compte les modules et permissions
ajoutés ; les navigateurs nécessitent HTTPS ou localhost pour ces fonctions.
