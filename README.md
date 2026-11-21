# TEMPO

Arcade de précision à un bouton **avec duels en ligne de 2 à 5 joueurs** et une boutique de 70 skins de cercle.

Une aiguille tourne, une cible apparaît, tu appuies au bon moment. Trois vies, une séquence de cibles identique pour tous : le dernier debout gagne.

## Jouer

Ouvre `index.html` (ou l'aperçu). `Espace` / clic / tap pour jouer, `M` pour le son, `Échap` pour revenir au menu.

### Solo
- 3 vies, combo jusqu'à ×9, cibles dorées, inversion de sens au niveau 4.
- Fin de partie : `score ÷ 40` points, record sauvegardé.

### En ligne (2 à 5 joueurs)
1. **En ligne → Créer un salon** : un code à 5 lettres apparaît.
2. Les potes font **En ligne → code → Rejoindre**.
3. L'hôte lance : compte à rebours de 3 s, **même graine**, donc même séquence de cibles pour tout le monde.
4. 3 vies chacun. Le **dernier debout** gagne ; les éliminés passent en spectateur et regardent les mini-cercles des autres.
5. Résultats classés, puis **Revanche** en un clic (hôte).

Les mini-cercles en bas de l'écran affichent le score, les vies et **le skin équipé de chaque pote**.

### Boutique et points
- **Points** : gagnés en fin de partie (solo : `score ÷ 40` ; multi : +150 victoire, +75 2ᵉ, +30 sinon).
- **Bonus quotidien** : 100 + 50 × jours de série (plafond 450), réclamé automatiquement à l'ouverture.
- **50 skins basiques** (120 → 414 ◆, les 3 premiers offerts) et **20 skins prestige** (2 200 → 6 000 ◆) : dégradés animés, conic, arc-en-ciel, pulsation, pointillés, double anneau, halo.
- Acheter équipe immédiatement. Le skin équipé s'affiche chez les autres joueurs pendant les duels.

## Technique

| Fichier | Rôle |
| --- | --- |
| `index.html` | interface (accueil, boutique, salon, résultats), canvas |
| `style.css` | DA néon, HUD, grille de skins, responsive |
| `game.js` | boucle, règles, boutique, points, orchestration des duels |
| `skins.js` | catalogue des 70 skins + rendu canvas / aperçu CSS |
| `online.js` | salons temps réel Supabase (présence + broadcast) |
| `vendor/supabase.js` | client Supabase officiel, embarqué (aucun CDN) |
| `assets/` | — |

- **Aucune donnée en base** : les salons sont des canaux Realtime publics et éphémères (`tempo-room-CODE`). La présence transporte pseudo + skin, le broadcast transporte vies / score / élimination.
- **Aucune clé secrète** dans le navigateur : uniquement la clé publique (`anon`), prévue pour être exposée.
- **Déterminisme** : la graine est tirée par l'hôte, puis chaque client génère la même suite de cibles (`mulberry32`). Les tirages sont à nombre fixe à chaque succès, donc deux joueurs reçoivent exactement la même séquence.
- Le profil (points, skins, record, série) reste **local au navigateur** (`localStorage`, clé `tempo.profile.v2`).
- Si le réseau est coupé, le solo et la boutique continuent de fonctionner ; le mode en ligne affiche une erreur explicite.

## Réglages

En haut de `game.js` : `MAX_LIVES`, `HITS_PER_LEVEL`, `speedForLevel()`, `widthForLevel()`.
Dans `skins.js` : ajouter un skin = une ligne dans `BASIC` ou `premium`.
Dans `online.js` : `SUPABASE_URL` / `SUPABASE_KEY` pour brancher un autre projet.

## Publier

Dépose les fichiers à la racine du dépôt et active GitHub Pages, ou sers le dossier :

```bash
python3 -m http.server 8000
```
