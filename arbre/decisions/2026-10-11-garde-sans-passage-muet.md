---
type: decision
title: La garde refuse ce qu'elle ne vérifie pas, et un projet ne lève plus une règle bloquante
description: "Revue rétroactive des limites, les cinq de tête. Le crochet d'un conteneur vérifie les secrets par gitleaks quand HOLARCH est injoignable ; un contrôle bloquant indisponible fait refuser le commit ; les règles bloquantes du profil et du type depot-public deviennent non dérogeables ; une règle stable sans approbation se lit comme un brouillon ; un projet en échec n'arrête plus l'audit des autres."
status: stable
approved: { by: human:auteur, at: 2026-10-11, ref: "échange du 2026-10-11, choix cliquables : quatre limites de tête, gitleaks par montage, limite 5, précisions A et B ; recommandations suivies" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-07-controles-de-regles.md, /arbre/decisions/2026-10-09-environnement-d-execution.md, /arbre/conception/contrats/regle.md, /arbre/conception/etape-3-regles-projets.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-09-partage-et-bac-a-sable.md]
---

# La garde refuse ce qu'elle ne vérifie pas, et un projet ne lève plus une règle bloquante

**Contexte (2026-10-11, revue rétroactive des limites, `revue-limites.md`).** Cinq limites ouvertes, vérifiées dans
le code à `423f6a7` ; les quatre premières laissent un commit partir sans contrôle :

1. Le crochet `pre-commit` fige les chemins de node et de HOLARCH de l'hôte (`src/garde-git.js`) ; dans un conteneur,
   ils n'existent pas, et le commit passe avec « HOLARCH injoignable ». 68 % des sessions tournaient en conteneur le
   2026-10-09 ; 90 % des envois partent en moins de 0,4 h, souvent avant l'audit horaire. gitleaks n'est pas dans
   l'image de base du profil (`mcr.microsoft.com/devcontainers/base:bookworm`).
2. Une seule règle du profil sur 27 est `derogable: false` (`conteneur-isole`) : la racine d'un projet, que le
   conteneur écrit, peut redéfinir `secrets-hors-contexte`, `identite-de-commit` (profil) ou `rien-de-personnel` (type
   `depot-public`) en simple rappel. La fusion tient déjà `derogable: false` (`src/regles.js`, `fusionner`).
3. Un contrôle d'une règle bloquante indisponible (gitleaks absent ou en panne, liste privée illisible) laisse passer
   le commit avec « non vérifié » (`bin/holarch.js`, `garde`), alors que des règles illisibles le font refuser.
   0 « non vérifié » dans les transcriptions lisibles depuis l'hôte.
4. Une règle `stable` s'applique sans `approved` (`applicable`, `src/regles.js`). 0 règle `stable` sans `approved` sur
   43 (profil, socle, types) le 2026-10-11.
5. Une levée dans le calcul des règles d'un seul projet (`regleEffective`, `materialiserProjet`) arrête l'audit de
   tous, donc tous les écarts du passage horaire (`src/audit.js`) ; écarté le 2026-10-10 faute d'un cas à reproduire.

**Choix de l'auteur (2026-10-11, choix cliquables, recommandations suivies) et leur mise en œuvre.**

| Limite | Choix | Mise en œuvre |
|---|---|---|
| 1. Conteneur | repli gitleaks | HOLARCH injoignable : le crochet lance `gitleaks git --pre-commit --staged` (mêmes options que la garde) s'il le trouve. Rien trouvé : le commit passe et le crochet dit que seuls les secrets sont vérifiés. Une fuite : refus. gitleaks en panne : refus (point 3). gitleaks absent : le commit passe avec le message d'aujourd'hui, sans quoi chaque conteneur bloquerait tout jusqu'à sa reconstruction. Les termes privés restent hors du conteneur (`conteneur-isole`) : seul l'audit les voit. gitleaks dans le conteneur : un dossier dédié de l'hôte, créé vide par `initializeCommand` (le conteneur démarre toujours), monté en lecture seule ; `holarch service poser` y copie le gitleaks de l'hôte (binaire statique), donc la version que suit `outils-a-jour`, sans réseau ni version figée |
| 2. Dérogation | `derogable: false` | sur `secrets-hors-contexte` et `identite-de-commit` (profil) et `rien-de-personnel` (type `depot-public`). Une exception passe par le profil ou le contexte, hors du dépôt contrôlé |
| 3. Indisponible | refus | un contrôle d'une règle bloquante non disponible au commit fait refuser le commit, comme des règles illisibles, et se journalise comme tout refus (`rule.enforced`) ; `git commit --no-verify` reste le passage explicite, que l'audit voit |
| 4. Approbation | `approved` exigé | une règle `stable` sans `approved` se lit comme un brouillon : elle ne s'applique pas, compte parmi les règles à approuver (reprise, page Règles) et la règle effective le signale. Elle ne remplace donc pas une règle approuvée de même `id`. Pas d'écart d'audit en plus |
| 5. Isolement | corrigé | une levée sur un projet le rend non disponible à l'audit, avec sa raison ; les autres projets sont audités |

**Ce que cela modifie.** Décision `controles-de-regles` et tranche 4 de l'étape 3 : la garde ne laisse plus passer
que ce qu'elle a vérifié, sauf HOLARCH et gitleaks tous deux absents. Contrat de règle 0.5.0 : `stable` ne vaut
qu'avec `approved`, sans changement de forme (le champ existe).

**Ce qui le ferait changer.** Des refus pour indisponibilité qui reviennent (outil instable, délai trop court) : les
compter au journal, puis régler le délai plutôt que de rouvrir le passage. Un besoin réel de lever une règle bloquante
dans un seul projet : une exception portée par le contexte, sur le modèle des `exceptions` de `donnees_personnelles`.

**Conséquences.** `src/garde-git.js` (crochet), `src/audit.js` et `bin/holarch.js` (garde), `src/regles.js`
(lecture du statut), `src/conteneur.js` et `src/service.js` (montage de gitleaks) ; un test par point, chacun éprouvé sur son parent ; règles du profil et du type `depot-public` ;
image du profil ; crochets réécrits par `holarch regles appliquer` dans chaque projet déclaré.
