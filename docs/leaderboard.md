# Classement

La page Classement est accessible depuis Profil → Voir le classement. Il affiche uniquement les alias, points, rangs et
un indicateur « Vous » pour la session courante. Les identifiants Auth, e-mails,
positions et lignes du registre des récompenses ne sont pas exposés.

Les scores utilisent les récompenses existantes (25 points par parcours terminé),
réservées aux comptes inscrits au moment de la fin du parcours. Les contributions
anonymes restent enregistrées, sans points. Leurs anciennes récompenses sont
conservées dans le registre avec `eligible = false` et exclues définitivement du
solde et du classement, y compris après inscription. Les invités peuvent consulter
le classement, sans fiche personnelle.

Les récompenses éligibles sont comptabilisées
avec la même déduplication par compte et événement fusionné que `read_my_rewards`.
La première récompense conservée détermine la période et la commune. Une fusion
ou son annulation est donc prise en compte au prochain rafraîchissement.

- National : toutes les récompenses, même celles sans commune identifiée.
- Communal : points des signalements localisés dans la commune sélectionnée,
  indépendamment du domicile du contributeur.
- Hebdomadaire : depuis lundi à minuit, heure `America/Port-au-Prince`.
- Mensuel : depuis le premier du mois, dans le même fuseau.
- Tous les temps : historique complet.

À points égaux, le premier à avoir atteint son score précède l’autre ; l’alias
sert de dernier départage stable. Seuls les comptes ayant des points dans la
sélection apparaissent. L’API renvoie les 100 premiers en une seule réponse et le rang personnel
même s’il se situe au-delà du top 100. La fiche personnelle reste affichée en
haut de la page. Un compte sans points dans la sélection apparaît avec 0 point
et la mention « Non classé ». Les trois premiers ont un podium, les places 4 et 5
des cartes distinctes, puis les places 6 à 100 une liste.

Migrations : `20260928034725_rewards_leaderboard.sql` (dépend de `user_aliases`)
puis `20260928035920_leaderboard_top_100.sql` et
`20260928041515_registered_contributor_rewards.sql`.
