# Card Battle — nouvelle version

Prototype HTML/CSS/JavaScript avec Supabase. Cette version reprend les règles discutées ensemble ; elle ne modifie pas les tables ni les cartes de l'ancien prototype. Elle est configurée pour le projet Supabase « Card creator ». Les tables et fonctions `cb3_…` y sont déjà installées : ne pas exécuter `schema.sql` dans ce projet.

## Jouer
1. Ouvrir l’aperçu ou publier ces fichiers sur GitHub Pages.
2. Chaque joueur choisit un pseudo ; son profil et ses cartes restent liés à son navigateur. **Effacer les données du navigateur ou changer d’appareil peut faire perdre le profil** : le pseudo seul ne permet pas de le récupérer.
3. Un joueur crée un salon et partage son code. Les autres ouvrent le même jeu dans leur propre navigateur ou appareil et rejoignent le salon.
4. L’hôte lance quand tous sont présents. Duel : 2 joueurs ; mêlée : 2 à 5 ; équipes : exactement 4. Un deck doit avoir au moins 4 cartes, dont une carte à 1 pièce qui produit de l’or.
5. Quand c’est son tour, sélectionner une carte en main puis cliquer sur une zone ; aucun bouton de confirmation. Si aucune carte n’est abordable, choisir la carte à défausser.

## Règles retenues
- Chaque nouveau joueur reçoit 20 cartes aux caractéristiques aléatoires. Chaque deck a au moins une carte à 1 pièce qui produit de l’or. La main initiale de 3 cartes en contient toujours une. Il n'y a pas de maximum de cartes dans le deck.
- En partage optionnel, les cartes des decks sont rassemblées, mélangées et réparties aussi équitablement que possible. S’il reste des cartes, certains joueurs en reçoivent une de plus. Le partage est temporaire ; les collections ne changent pas. La condition d’une carte à 1 pièce reste obligatoire pour chaque deck et chaque main initiale.
- Départ : roi à 20 PV, 1 pièce, 3 cartes en main. Au début des tours **suivants** : production des mines puis pioche d’une carte. La dernière carte piochée élimine immédiatement son joueur, même s’il a encore des PV ou des cartes en main.
- Une carte par tour : la carte au centre menace le joueur suivant. Se défendre compare l’attaque et la défense. Attaque supérieure : défense détruite, surplus en dégâts au roi ; défense supérieure : attaquant détruit et défenseur prend sa place ; égalité : les deux sont défaussées. L’attaquant victorieux reste au centre.
- Poser à la mine ou en attaque quand on est menacé fait subir d’abord les dégâts. Une nouvelle attaque remplace la carte au centre, qui va à la défausse. Une défense posée sans attaque ennemie devient une attaque. Quand le roi est détruit avant de poser en mine ou en attaque, sa carte n’est pas jouée.
- Une mine commence à produire au début du prochain tour de son propriétaire. Si aucune carte n’est abordable, le roi subit l’attaque éventuelle et le joueur choisit une carte à défausser. À son prochain tour, ses autres cartes retournent à la pioche et une nouvelle main de 3 cartes est tirée : priorité aux cartes différentes, puis anciennes si nécessaire. Piocher la dernière carte signifie toujours la défaite.
- Affinités : Feu > Nature > Eau > Feu ; Neutre sans affinité. La statistique de combat avantagée reçoit +50 %, arrondis au-dessus avant comparaison. Les types égaux n’ont pas de bonus.
- Création : le joueur dessine, choisit le prix et peut relancer les statistiques, le type et le pouvoir ensemble. Le prix et le dessin ne changent pas à la relance. La carte validée est ajoutée au deck.

## Choix provisoires d’équilibrage
Ces chiffres n’avaient pas été fixés pendant la discussion et peuvent être modifiés après tests : roi à 20 PV ; prix de création de 1 à 20 ; budget de statistiques de `4 + 2 × prix` ; 25 % de chance d’un pouvoir, qui consomme 2 points. Les trois premiers pouvoirs sont Prospecteur (+2 or à la mine), Furie (+2 attaque) et Rempart (+2 défense). Ils s’appliquent à la statistique concernée avant les affinités. Les statistiques ont pour minimum 1.

En 2 contre 2, une carte ne blesse pas un allié ; une défense jouée sans menace ennemie devient une attaque. Si un joueur est éliminé, ses cartes à la mine et son éventuelle carte au centre sont défaussées. Ces précisions sont provisoires.

## Musique
Un fichier audio facultatif peut être ajouté à une carte personnalisée (1 Mo maximum pour ce prototype). Il est joué aux participants lorsque la carte est posée. Utiliser une musique dont on possède les droits. Le navigateur peut bloquer la lecture automatique tant que l’utilisateur n’a pas interagi avec la page ; un bouton permet de couper le son.

## Installation ailleurs
- Copier tous les fichiers, **y compris `assets/arena.jpg`**, à la racine du dépôt GitHub, puis activer GitHub Pages. Cette conversation ne dispose pas d'un accès permettant de pousser dans GitHub automatiquement.
- Pour utiliser un autre projet Supabase vierge : exécuter `schema.sql` une seule fois dans son SQL Editor ; renseigner son URL et sa **clé publique** dans `config.js`. Ne jamais placer de clé secrète/service_role dans le navigateur.
- Le prototype crée un identifiant technique propre au navigateur pour permettre l’accès avec seulement un pseudo ; il ne dépend pas des connexions anonymes. Il utilise le fournisseur e-mail avec confirmation automatique des inscriptions. **Cela désactive la vérification des adresses e-mail pour tout le projet**, y compris les autres applications qui l’utilisent. Ne pas partager ce projet avec une application qui dépend d’une vérification d’adresse.
- Pour un service public, ajouter une authentification récupérable, une protection anti-abus/CAPTCHA, des quotas de stockage et une modération, et revoir les politiques de sécurité. Les dessins et musiques sont stockés en base ; les parties sont un prototype synchronisé par rafraîchissement automatique. Le mode roguelike et les adversaires IA ne sont pas encore inclus.
