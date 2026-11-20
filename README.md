# Card Battle — prototype multijoueur

Application HTML statique + Supabase. Fonctionne avec GitHub Pages (aucun serveur à maintenir).

## Installation Supabase

Cette copie est configurée pour le projet Supabase « Card creator ». Les migrations du jeu et des decks y ont déjà été installées : ne relancez ni `schema.sql` ni `migration_decks.sql` ni `migration_fin_deck.sql` dans ce projet. Les connexions anonymes ne sont pas utilisées. Les étapes suivantes servent à configurer un autre projet vierge.
1. Créer un projet sur https://supabase.com/.
2. Dans **Authentication > Sign In / Providers**, activer la connexion par e-mail et désactiver la confirmation des adresses. Les joueurs choisissent seulement un pseudo : le jeu crée automatiquement un identifiant technique aléatoire et un mot de passe secret enregistrés dans le navigateur, sans utiliser d'adresse e-mail réelle. Ce n'est pas un compte récupérable par pseudo : vider les données du navigateur ou changer d'appareil peut faire perdre la collection. Pour une vraie persistance multi-appareils, ajouter une authentification récupérable.
3. Dans **SQL Editor**, exécuter `schema.sql`, puis `migration_decks.sql`, puis `migration_fin_deck.sql` dans un projet vierge. Ces scripts créent les tables, politiques RLS et fonctions ; ils ne sont pas destinés à être relancés tels quels.
4. Copier l'URL du projet et la **clé publique** (publishable / anon) depuis les réglages API. Ne jamais utiliser la clé `service_role` dans le navigateur. Ajouter les valeurs dans `config.js` avant publication : les joueurs n’ont aucun réglage Supabase à saisir. Une clé publique est conçue pour être exposée ; les permissions sont contrôlées par RLS.
5. Pour une production publique, activer CAPTCHA et limites de débit sur les connexions anonymes, surveiller le stockage et revoir les règles de sécurité. Les dessins sont stockés en base : éviter les gros volumes sans ajouter quotas et modération.

## Publication GitHub Pages
1. Placer les fichiers à la racine du dépôt GitHub `card battle`, puis commit et push sur la branche principale.
2. GitHub > Settings > Pages > Build and deployment > Deploy from a branch : sélectionner la branche et `/ (root)` puis Save.
3. Ouvrir l'URL Pages fournie par GitHub. On peut aussi servir localement avec `python3 -m http.server 8000` et ouvrir `http://localhost:8000`.

## Règles de ce prototype
- Chaque nouveau joueur reçoit automatiquement un deck de 10 cartes de départ. Dans Ma collection, il peut le personnaliser ; il faut enregistrer exactement 10 cartes différentes. Tous les participants doivent disposer d’un deck complet pour démarrer. Le serveur vérifie ces règles et fige le deck au lancement. Lorsque tous les decks sont épuisés, le joueur ou l’équipe ayant le plus de PV gagne ; en cas d’égalité, la partie est déclarée nulle.
- Sur le plateau, sélectionner une carte et une zone, puis cliquer sur « Jouer la carte » ; sur ordinateur, on peut aussi glisser une carte vers une zone. L’attaque vise le joueur choisi. Toutes les cartes non jouées du deck sont visibles en main.
- Dessiner puis choisir un prix de 1 à 8. Budget de points = 4 + 2 × prix, réparti aléatoirement entre or, attaque et défense. Un pouvoir (25 % de chance) coûte 2 points du budget. Type aléatoire. C'est une première base d'équilibrage, pas une garantie d'équité statistique.
- Roi : 40 PV. Départ : 8 or. Au début de chaque tour après le premier : +2 or et production des mines.
- Une carte au maximum par tour si l'or le permet ; chaque carte ne peut être jouée qu'une fois par partie. 3 mines et 3 défenses maximum par joueur. Une attaque est consommée immédiatement.
- La plus ancienne défense absorbe les dégâts, puis le surplus touche le roi. Le bonus/malus de type (+2 / −2, minimum 1) s'applique seulement contre cette défense : Feu > Nature > Eau > Feu ; Neutre sans affinité. Un seul défenseur intercepte chaque attaque.
- Prospecteur : +2 or par tour en mine ; Furie : +2 attaque ; Rempart : +2 PV en défense.
- Duel : 2 joueurs ; mêlée : 2 à 5 joueurs (l'hôte démarre quand il veut) ; équipes : 4 joueurs, les sièges 1 et 3 contre 2 et 4. Le dernier joueur ou la dernière équipe en vie gagne.
- Expédition solo : 3 combats contre des adversaires contrôlés par le jeu ; bonus aléatoire entre les combats. Les PV et l’or persistent, les cartes et emplacements sont réinitialisés à chaque combat. Ce mode fonctionne localement, sans sauvegarde ni validation serveur.
- Synchronisation par rafraîchissement automatique toutes les 3 secondes. Les actions de combat et le tirage des cartes sont exécutés en base et vérifiés côté serveur.

## Limites
Prototype sans matchmaking, sans reconnexion inter-appareils, sans protection anti-abus complète ni outils de modération. Il ne doit pas être considéré comme prêt pour une mise en production publique. Tous les joueurs doivent pouvoir accéder au même projet Supabase.

**Sécurité :** la confirmation e-mail automatique est activée sur tout le projet Supabase, donc les adresses e-mail de toutes ses applications ne sont pas vérifiées. Ne pas utiliser ce projet pour d'autres applications qui s'appuient sur la vérification d'e-mail. Ajouter des limites d'inscription, une protection anti-abus, des outils de modération et une authentification récupérable avant toute mise en production publique.

Pour publier cette mise à jour sur GitHub Pages, remplacer les fichiers du dépôt et copier aussi le dossier `assets` avec `arena.jpg`. La mise à jour de la base est déjà installée sur le projet configuré.
