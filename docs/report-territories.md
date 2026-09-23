# Territoires des rapports

La page Rapports utilise les limites communales CNIGS diffusées dans le service
[Commune](https://services2.arcgis.com/llfadFMmXWfR5SAz/ArcGIS/rest/services/Commune/FeatureServer/0).
Ce référentiel contient 140 communes et 10 départements ; les champs `date` et
`validOn` indiquent respectivement le 6 septembre 2017 et le 29 novembre 2018.
Il s’agit de la version de ce référentiel, pas d’une garantie de couverture de
toutes les évolutions administratives ultérieures. Les limites et dénominations
ne constituent pas une reconnaissance officielle des Nations unies.

Les coordonnées sont croisées avec les polygones complets, sans simplification,
à chaque création ou modification de position d’une contribution. La migration
reclasse aussi les contributions existantes sans modifier les rapports sources.
Les polygones et leurs éventuels trous utilisent les types natifs PostgreSQL,
avec un index GiST sur leurs enveloppes ; aucune extension n’est nécessaire.
Un point absent ou hors référentiel apparaît dans « Territoire à préciser ».
Si plusieurs communes couvrent un point, la commune reste « à préciser », mais
le département est conservé si toutes les correspondances appartiennent au même
département. Les filtres distinguent ces deux niveaux de couverture. Aucun nom n’est déduit
d’une adresse libre et aucune position n’est envoyée à un service tiers.

Un événement prend le territoire de la contribution représentative déjà utilisée
par les rapports (la plus complète, puis la plus ancienne). Le regroupement, les
totaux, comparaisons et pages de résultats conservent ainsi le même périmètre.
Les parts territoriales ont pour dénominateur tous les événements de la sélection,
y compris ceux sans territoire. Elles ne mesurent pas un risque par habitant.

## Reproduction des données

Télécharger le GeoJSON avec cette requête (WGS84, toutes les entités, sans
`maxAllowableOffset`) :

```text
https://services2.arcgis.com/llfadFMmXWfR5SAz/ArcGIS/rest/services/Commune/FeatureServer/0/query?where=1%3D1&outFields=ADM2_FR,ADM2_PCODE,ADM1_FR,ADM1_PCODE,date,validOn&outSR=4326&f=geojson
```

```sh
node scripts/build-report-territories.mjs source.geojson \
  supabase/migrations/20260923023905_report_territories.sql \
  supabase/migrations/20260923023914_report_territory_boundaries.sql \
  supabase/migrations/20260923023916_report_territory_analytics.sql
```

Le script vérifie les codes, les géométries et les effectifs, génère le catalogue
léger embarqué et les données SQL, et inscrit le SHA-256 source dans la migration.
Pour une nouvelle version après déploiement, créer une nouvelle migration.
Les trois migrations respectent la limite de taille de l’API Supabase ; seule la
dernière active le rattachement et les filtres, une fois tout le référentiel chargé.
La migration `20260923024321_report_territory_partial_matches.sql` ajoute ensuite
la conservation du département en cas d’ambiguïté communale. Appliquer les quatre
migrations avant de publier le client qui transmet les filtres.
