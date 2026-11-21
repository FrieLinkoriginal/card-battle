# TEMPO

Un jeu d'arcade de précision **à un seul bouton**. Une aiguille tourne autour d'un cercle,
une cible apparaît ; tu appuies au bon moment. Ça dure trente secondes, et tu recommences.

Aucune dépendance, aucun build, aucun asset externe : trois fichiers statiques.

## Jouer

Ouvre `index.html` (ou l'aperçu) et appuie sur **Espace**, clique ou tape l'écran.
Sur mobile, n'importe quel tap fonctionne. `M` coupe le son.

## Règles

- **Réussite** : l'aiguille est dans la zone colorée → points + combo +1.
- **Parfait** : l'aiguille est dans le liseré blanc au centre → score ×1,5 et gerbe d'étincelles.
- **Raté** : l'aiguille est ailleurs → une vie perdue, combo remis à zéro.
- Trois vices et la partie s'arrête. Chaque nouveau record est sauvegardé dans le navigateur.

## Ce qui rend la boucle accrocheuse

| Levier | Mise en œuvre |
| --- | --- |
| Parties courtes | 3 vies, mort en ~20 à 60 s → « encore une ». |
| Progression lisible | Une cible tous les 6 succès : la zone rétrécit, l'aiguille accélère. |
| Récompense de la prise de risque | Multiplicateur de combo (jusqu'à ×9), cibles dorées (×3, plus petites), bonus PARFAIT. |
| Surprise | À partir du niveau 4, l'aiguille peut **inverser son sens** sans prévenir. |
| Feedback immédiat | Screen shake, particules, anneaux d'onde, flash, texte flottant, sons synthétisés. |
| Enjeu personnel | Record visible en permanence, alerte « NOUVEAU RECORD » en pleine partie, stats de fin. |
| Zéro friction | Redémarrage instantané (Espace / clic), aucune installation, chargement immédiat. |

## Courbe de difficulté

- Vitesse angulaire : `2,55 rad/s` au niveau 1 → plafond `7,4 rad/s`.
- Largeur de la cible : `0,262 rad` → plancher `0,064 rad` (les cibles dorées sont 26 % plus étroites).
- Après chaque succès, la nouvelle cible est placée à une distance calculée en **temps de réaction**
  (0,6 à 1,3 s), pour que la vitesse ne rende jamais le jeu illisible.

Tout est réglable en haut de `game.js` : `speedForLevel`, `widthForLevel`, `HITS_PER_LEVEL`, `MAX_LIVES`.

## Technique

- `index.html` / `style.css` : interface, HUD, menus.
- `game.js` : boucle `requestAnimationFrame`, rendu Canvas 2D, logique, audio Web Audio API.
- Sauvegarde via `localStorage` (clé `tempo.save.v1`), sans compte ni réseau.
- Responsive (téléphone, tablette, bureau), `devicePixelRatio` géré, aucun scroll.
- Audio 100 % synthétisé : aucun fichier à héberger, aucun droit à gérer.

## Publier

Dépose les trois fichiers à la racine du dépôt et active GitHub Pages, ou sers le dossier :

```bash
python3 -m http.server 8000
```
