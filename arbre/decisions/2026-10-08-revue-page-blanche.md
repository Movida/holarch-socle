---
type: decision
title: Revue page blanche du 2026-10-08 — ce que le projet construit au regard de ses attendus
description: Première revue de hauteur (B4), lancée à la main par un sous-agent neuf, sur demande de l'auteur. Aucune étape close sur son critère d'usage, l'outil sert surtout à se construire, P2 peu appliqué à ce qui écrit chez les autres, une méthode qui produit plus vite qu'elle ne vérifie. Quatre choix à l'auteur (A à D).
status: draft
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-03-fondation.md]
---

# Revue page blanche du 2026-10-08

**Contexte.** L'auteur demande de couvrir tout le code et de « prendre de la hauteur » pour vérifier que ce qui est créé
reste cohérent avec les attendus initiaux. C'est le besoin B4 (revue page blanche, décision tracée), jamais exercé
jusqu'ici. Un sous-agent au contexte neuf a lu l'architecture, les principes, les besoins, le journal, les trois étapes,
les 24 décisions, les contrats, puis le journal du site et `git log`. Chiffres revérifiés par l'agent principal, sauf
mention.

## Constats

1. **Aucune étape close sur son critère d'usage (§10).** Étape 1 : 47 pages vues en 30 jours, sur deux jours de
   construction de l'interface ; critère reporté puis abandonné par `cloture-etape-2`. Étape 2 : close sur un constat
   oral ; le serveur MCP `holarch` a reçu 9 appels en 30 jours, presque tous le 2026-10-08 (compté dans les
   transcriptions : ses appels ne passent pas par la passerelle). Étape 3 : la clôture prévue « après la mesure du
   2026-10-14 » porte sur le critère de la tranche 7, pas sur celui de l'étape (aucune règle redite pendant un mois,
   soit vers le 2026-11-07 ; un vrai projet créé par la commande, pas encore). La règle n° 7 de la fondation (« la
   suivante ne s'ouvre que si le critère est tenu ») aurait été levée trois fois sur trois.
2. **L'outil sert surtout à se construire.** Coût sur 30 jours : le projet privé le plus coûteux 2 046 $ (56 %), hors projet 1 071 $,
   HOLARCH 219 $. Ce projet n'a pas d'arbre et porte 3 écarts.
3. **P2 peu appliqué à ce qui écrit chez les autres.** HOLARCH écrit dans `settings.json`, `~/.claude.json`,
   `.git/hooks`, `git config`, deux dossiers de règles, 8 unités systemd, des copies de service : un gestionnaire de
   configuration maison, sans comparaison avec l'existant. Coûts lus dans un format privé de Claude Code (télémétrie
   native [À COMPLÉTER : à vérifier dans la doc]) ; gitleaks et osv-scanner en local alors que l'analyse des secrets et
   Dependabot de GitHub sont désactivés. Les défauts A1 à A8 et ceux de la passe par famille du 2026-10-08 naissent
   presque tous là.
4. **La méthode produit plus vite qu'elle ne vérifie.** Correctifs repris le jour même (I29 puis l'annonce unique, I28
   puis A4) ; la leçon mesurée du §1.4 (contre-épreuve par une instance neuve, avant de rendre) n'est pas appliquée,
   on relit après coup par passes globales.
5. **Cérémonie lourde (P11).** Spec de l'étape 3 : 823 lignes ; 52 commits sur 165 ne font que consigner ; un même fait
   écrit au journal, à l'avancement et aux idées.
6. **Cohérence.** Trois façons de lire l'arbre (catalogue horaire, `arbreAJour`, `arbreFrais`) ; « routine » désigne
   aussi les Routines de Claude Code ; contrats `noeud`, `regle`, `config` en usage sans approbation ; §4 de
   l'architecture (l'interface passe par le hub) contredit par `src/web/serveur.js`.

Écarté après vérification : le minuteur `holarch-recolte` affiche un déclenchement le 2026-10-08 à 00:03 hors
calendrier, mais le service n'a jamais démarré (aucune date de lancement, aucune entrée de journal) : rattrapage
`Persistent=yes` à la pose, rien dépensé.

## Choix à l'auteur

- **A. Critère de l'étape 3** : le tenir (redites des règles stables comptées par les récoltes jusqu'au 2026-11-07
  environ, et un vrai projet créé par la commande), ou abroger la règle n° 7 de la fondation par décision.
- **B. Brancher HOLARCH sur ce projet privé** (arbre minimal, règles, suivi du coût et des échecs), une session, puis
  mesurer si quelque chose bouge là où va la dépense.
- **C. État des lieux P2** (environ une demi-journée de lecture) avant toute nouvelle brique d'observation ou de
  conformité : télémétrie de Claude Code, `ccusage`, analyse des secrets et Dependabot, framework `pre-commit`,
  chezmoi ou équivalent ; « garder » contre « adopter », chiffré.
- **D. Méthode** : finir la passe par famille en cours et corriger ce qu'elle a trouvé, puis remplacer les passes
  globales par une contre-épreuve par un sous-agent neuf à chaque tranche qui écrit, avant de rendre ; alléger la
  cérémonie (une ligne par tranche à l'avancement, journal sans recopie).

## Faire revenir la revue (B4), sans rien construire d'avance

Signaux déjà lisibles : une décision `cloture-*` qui dispense de son critère ; la 5ᵉ tranche ouverte dans une étape ;
plus de trois correctifs du même mécanisme en 48 h (`git log`) ; le projet qui coûte le plus sur 30 jours n'est pas
celui où l'on travaille. Forme minimale proposée : une règle brouillon au type `methode-holarch` (« à une clôture
d'étape, à l'ouverture d'une 5ᵉ tranche ou devant un correctif du même mécanisme dans les 48 h, proposer une revue
page blanche par un sous-agent neuf ; consigner sa décision dans `arbre/decisions/` »), à écrire si l'auteur la retient.
