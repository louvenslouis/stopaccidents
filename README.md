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

### Dernier accident sur l’Accueil

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
