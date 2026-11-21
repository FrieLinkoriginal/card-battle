# TEMPO

Arcade de précision à un bouton, **duels en ligne de 2 à 5 joueurs**, **mode rythme** et boutique de 70 skins de cercle.

- **Arcade** : l'aiguille tourne, une cible apparaît, tu appuies. 3 vies, le dernier debout gagne.
- **Rythme** : la musique impose le tempo, tu joues les temps. **Le meilleur score à la fin du morceau gagne** — personne n'est éliminé. Ton cercle et ceux de tes potes tournent côte à côte en semi-transparent.
- **Boutique** : 50 skins basiques + 20 prestige, achetés avec les points, visibles par tes potes en duel.

## Jouer

Ouvre `index.html` (ou l'aperçu). `Espace` / clic / tap pour jouer, `M` pour le son, `Échap` pour le menu.

### Arcade (solo ou 2–5 joueurs)
- Combo jusqu'à ×9, cibles dorées, inversion de sens au niveau 4.
- Solo : `score ÷ 40` points en fin de partie.
- Multi : 3 vies chacun, même séquence de cibles pour tous, le dernier debout gagne.

### Rythme (solo ou 2–5 joueurs)
- **4 morceaux synthétisés en direct** par la Web Audio API : Néon (118 BPM), Pulse (132), Nuit (96), Orage (150). Aucun fichier audio, aucun droit, un tempo exact.
- L'aiguille fait un tour par mesure, une cible par temps : tu appuies quand elle traverse la zone.
- **Vies = armure de combo** : un raté casse le combo et coûte une vie. À **0 vie**, tu perds **20 % de ton score** et tu continues — **tu ne sors jamais de la partie**.
- **Le classement est le score, en direct.** Si un joueur perd ses vies mais garde plus de points, il reste premier jusqu'à ce qu'on le dépasse.
- **Cercles des potes** : à côté du tien, en **semi-transparent** et plus petits, avec **leur vrai skin** et leur aiguille **calée sur le même tempo** ; nom, score et vies en direct, halo rouge quand ils prennent un dégât.
- **4 types de cibles**, débloqués progressivement dans le morceau :
  | Cible | Repère | Règle |
  | --- | --- | --- |
  | Normale | arc clair (cyan / doré) | appuie quand l'aiguille est dedans |
  | **Piège** | arc rouge pointillé + ✕ | **ne clique pas** : cliquer = 1 vie. La laisser passer est la bonne réponse |
  | **Tenue** | arc orange + point | garde appuyé du début à la fin de l'arc : relâcher trop tôt ou dépasser la fin = 1 vie |
  | **Gauche / Droite** | arc violet + flèche ◀ ▶ | clic gauche ou droit selon la flèche (mauvais bouton = 1 vie) |
- **Commandes** : souris (clic gauche / droit), clavier `Q` / `D` (ou `←` / `→`), mobile = **moitié gauche / moitié droite de l'écran**, `Espace` = clic normal, relâchement = fin de tenue.
- **Robots** (0 à 3) qui jouent au tempo avec une précision réglable (Facile / Normal / Fort) et **gèrent les nouveaux types** (ils ignorent les pièges, choisissent le bon bouton, relâchent la tenue au bon moment) : de quoi s'entraîner seul et remplir les salons.
- Fin du morceau : classement complet, points crédités (+150 vainqueur, +75 2ᵉ, +30 sinon).

### Spotify (optionnel, Premium)
- Le Client ID est déjà configuré. **Chaque joueur doit avoir Spotify Premium** : le Web Playback SDK refuse les comptes gratuits.
- Ajoute l'URL affichée dans le panneau (ex. `https://…/index.html`) dans **Redirect URIs** du dashboard Spotify.
- Colle un lien de morceau, **règle le BPM** (champ ou *Tap tempo* en 4 appuis), puis lance : les cibles sont posées sur ce tempo.
- Spotify ne fournit plus le BPM par API (endpoint supprimé fin 2024) : d'où le tap tempo.
- En multi, l'hôte lance le morceau ; chaque joueur connecté le lit de son côté (décalage de l'ordre de 150 ms). Un joueur non connecté entend une version synthétisée au même BPM.
- Si la lecture est bloquée, un filet de sécurité reprend sur l'horloge locale pour que la partie se termine quand même.

## Boutique et points

- **Points** : solo `score ÷ 40`, multi +150 / +75 / +30, rythme +150 / +75 / +30.
- **Bonus quotidien** : `100 + 50 × jours de série` (plafond 450), réclamé à l'ouverture.
- 50 basiques (120 → 414 ◆, les 3 premiers offerts) et 20 prestige (2 200 → 6 000 ◆).
- Le skin équipé s'affiche chez les autres joueurs pendant les parties.

## Technique

| Fichier | Rôle |
| --- | --- |
| `index.html` | interface (accueil, rythme, boutique, salon, résultats) |
| `style.css` | DA néon, HUD, grille de skins, responsive |
| `game.js` | boucle, règles arcade + rythme (4 types de cibles, cercles des potes), boutique, orchestration des duels |
| `skins.js` | catalogue des 70 skins + rendu canvas |
| `music.js` | séquenceur Web Audio : batterie, basse, arpège, nappes |
| `spotify.js` | OAuth PKCE + Web Playback SDK (isolé, jamais bloquant) |
| `online.js` | salons temps réel Supabase (présence + broadcast) |
| `vendor/supabase.js` | client Supabase officiel embarqué |

- **Aucune donnée en base** : salons = canaux Realtime publics éphémères (`tempo-room-CODE`).
- **Aucune clé secrète** dans le navigateur (clé `anon` uniquement, prévue pour être publique).
- **Déterminisme** : graine tirée par l'hôte → même suite de cibles, même tirage pour chaque joueur. Les notes du mode rythme découlent du BPM, du nombre de mesures **et d'une graine partagée** : mêmes notes, mêmes types (pièges, tenues, gauche/droite) sur tous les écrans.
- **Robots déterministes** : simulés localement à partir de la graine, identiques sur tous les écrans, zéro trafic réseau supplémentaire.
- Profil, points, skins, série : `localStorage` (clé `tempo.profile.v2`).

## Réglages

- `game.js` : `MAX_LIVES`, `HIT_WINDOW` (±100 ms), `PERFECT_WINDOW` (±35 ms), `widthForLevel()`.
- Types de cibles : `ryBuildNotes()` (seuils de progression 28 % pièges / 40 % latérales / 55 % tenues, roll `mulberry32`), gain tenue `170 × multiplicateur`, fenêtre de relâchement `[-0.24 s, +0.32 s]`.
- `music.js` : ajouter un morceau = une ligne dans `TRACKS` (BPM, mesures, gamme).
- `skins.js` : ajouter un skin = une ligne dans `BASIC` ou `premium`.
- `online.js` / `spotify.js` : identifiants des projets.

## Publier

Dépose les fichiers à la racine du dépôt et active GitHub Pages, ou sers le dossier :

```bash
python3 -m http.server 8000
```
