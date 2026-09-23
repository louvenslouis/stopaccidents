# Stations et transport en commun

La page Carte lit les stations actives dans Supabase. Les repères verts ouvrent
leur fiche ; le bouton **Stations** donne accès à une liste avec recherche par
nom, commune ou adresse. La fiche propose les trajets au départ, un filtre par
véhicule et le tarif en gourdes. « Voir cette station » et « Voir l’arrivée »
recentrent la carte ; le bouton Itinéraire existant permet ensuite de rejoindre
le lieu choisi. Aucun parcours routier de transport collectif n’est inventé à
partir des seuls points de départ et d’arrivée.

## Tables

- `transport_stations` : nom, commune, adresse, coordonnées, `is_active` et
  `is_demo`. Le `slug` sert d’identifiant lisible unique.
- `transport_vehicle_types` : codes `taptap` et `bus`, avec leurs libellés.
  D’autres types pourront être ajoutés sans modifier le schéma.
- `transport_routes` : station de départ, station d’arrivée, type de véhicule,
  `official_fare_htg`, `fare_reference`, `fare_effective_from`, `is_active` et
  `is_demo`.

Un trajet est directionnel. Le retour nécessite une autre ligne. Une liaison
peut avoir plusieurs types de véhicule, chacun avec son tarif. Les clés
étrangères interdisent les stations et véhicules inexistants, la contrainte
d’unicité empêche les doublons départ/arrivée/véhicule, et les montants négatifs
sont refusés. Un montant nul signifie « Non renseigné », tandis que zéro reste
un tarif valide.

Un tarif réel doit avoir une référence officielle et une date d’application.
L’interface montre cette date, y compris pour un tarif prenant effet dans le
futur. Les exemples affichent simplement « Tarif », sans badge ou mention de
démonstration dans l’interface. Le champ `is_demo` reste conservé dans la base.

Les visiteurs et utilisateurs connectés peuvent seulement lire le catalogue
actif. Les écritures sont réservées aux opérateurs de la base. Désactiver une
station masque aussi les trajets qui la desservent. Les lectures sont paginées,
annulables et actualisées au retour sur Carte ; les erreurs disposent d’un
bouton de relance. Il n’y a pas de remplacement silencieux par des données
locales lorsque Supabase est indisponible.

## Exemples inclus

La migration `20260923024458_transport_stations.sql` crée cinq stations de
démonstration : Champs de Mars, Pétion-Ville, Delmas 32, Carrefour et Cap-Haïtien.
Les coordonnées sont approximatives et les huit trajets ont des prix fictifs.

| Départ | Arrivée | Véhicule | Montant de test (HTG) |
| --- | --- | --- | ---: |
| Champs de Mars | Pétion-Ville | Taptap | 75 |
| Champs de Mars | Pétion-Ville | Bus | 50 |
| Champs de Mars | Delmas 32 | Taptap | 50 |
| Champs de Mars | Carrefour | Bus | 100 |
| Pétion-Ville | Champs de Mars | Taptap | 75 |
| Delmas 32 | Pétion-Ville | Taptap | 60 |
| Carrefour | Champs de Mars | Bus | 100 |
| Cap-Haïtien | Champs de Mars | Bus | 1 500 |

Ces exemples ne constituent pas un répertoire vérifié des stations ou des
liaisons actuellement exploitées. Pour préparer le catalogue réel, désactiver
les lignes de démonstration et saisir les stations vérifiées, puis les trajets
et tarifs sourcés. L’administration du catalogue se fait dans Supabase ; aucun
écran d’édition des tarifs n’est exposé dans l’application.

## Vérification

`node --test tests/transport*.test.mjs tests/map-markers.test.mjs` vérifie les
contraintes et droits dans PostgreSQL/PGlite, les exemples, le sens des trajets,
la distinction tarifs officiels/démonstration, la recherche, la pagination,
les erreurs et la séparation des stations et signalements sur la carte.
