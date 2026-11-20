# Card Battle — prototype multijoueur

Application HTML statique + Supabase. Fonctionne avec GitHub Pages (aucun serveur à maintenir).

## Installation Supabase

Cette copie est configurée pour le projet Supabase « Card creator ». La migration y a déjà été installée : ne relancez pas `schema.sql` dans ce projet. Il reste à activer les connexions anonymes dans son tableau de bord. Les étapes suivantes servent à configurer un autre projet vierge.
1. Créer un projet sur https://supabase.com/.
2. Dans **Authentication > Sign In / Providers**, activer **Anonymous Sign-Ins**. Les joueurs n'ont pas besoin de compte, mais leur collection est liée à la session enregistrée dans leur navigateur : vider les données ou changer de navigateur peut la faire disparaître. Pour une vraie persistance multi-appareils, ajouter une connexion par compte.
3. Dans **SQL Editor**, exécuter le contenu de `schema.sql` dans un projet vierge. Ce script crée les tables, politiques RLS et fonctions ; il n'est pas destiné à être relancé tel quel.
4. Copier l'URL du projet et la **clé publique** (publishable / anon) depuis les réglages API. Ne jamais utiliser la clé `service_role` dans le navigateur. Ajouter les valeurs dans `config.js` avant publication, ou les saisir dans l'écran de connexion du jeu (elles restent dans le navigateur). Une clé publique est conçue pour être exposée ; les permissions sont contrôlées par RLS.
5. Pour une production publique, activer CAPTCHA et limites de débit sur les connexions anonymes, surveiller le stockage et revoir les règles de sécurité. Les dessins sont stockés en base : éviter les gros volumes sans ajouter quotas et modération.

## Publication GitHub Pages
1. Placer les fichiers à la racine du dépôt GitHub `card battle`, puis commit et push sur la branche principale.
2. GitHub > Settings > Pages > Build and deployment > Deploy from a branch : sélectionner la branche et `/ (root)` puis Save.
3. Ouvrir l'URL Pages fournie par GitHub. On peut aussi servir localement avec `python3 -m http.server 8000` et ouvrir `http://localhost:8000`.

## Règles de ce prototype
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
