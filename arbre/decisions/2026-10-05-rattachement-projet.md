---
type: decision
title: Tout se rattache au projet par son identifiant
description: Une seule notion, le projet du catalogue identifié par son dépôt ; fiches et événements le citent par identifiant, un module partagé fait le rattachement.
status: draft
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/conception/contrats/fiche-catalogue.md, /arbre/conception/contrats/evenement.md]
  constrained_by: [/arbre/decisions/2026-10-03-identite-projets.md]
---

# Tout se rattache au projet par son identifiant

**Contexte.** Consigne de l'auteur (2026-10-05) : « la notion de dépôt doit être présente partout, côté modulaire ».
L'audit du code, fait après la tranche 2 de l'étape 3, trouve six façons de désigner un projet :

| Où | Ce qui désigne le projet |
|---|---|
| événements importés (`data.projet`), colonne `projet` de l'index, `consommation` par projet, filtre `projet` des sessions | nom du **dossier de départ** de la session (`morva`, `src`… : souvent pas un dépôt) |
| `session.finished` (`data.depots`), vue Projets, filtre `depot` | **identifiant** du projet du catalogue |
| skills, agents, hooks, MCP, consignes d'un dépôt (`attributes.projet`) | nom du dossier du dépôt |
| mémoires (`attributes.projet`) | nom du dossier de départ lu dans une transcription (vu d'un conteneur : autre chemin) |
| nœuds de l'arbre (`attributes.depot`, identifiant `holarch:node:<nom>/…`) | nom du dossier du dépôt (deux clones de même nom se confondent) |
| conteneurs et volumes (`attributes.projet`) | étiquette Compose ou nom du dossier du devcontainer |
| `holarch distant` | chemin ou nom cherché sous les racines de la configuration, sans le catalogue |

Conséquences visibles : le tableau de bord (« Projets les plus actifs », par dossier de départ) et la page Projets (par
dépôt touché, coût partagé) donnent des chiffres différents pour le même projet ; la logique « chemin → projet » vit
dans le module d'import et le socle l'y emprunte.

**Avis sur la consigne.** D'accord sur le fond : une seule référence, partout. Mais la notion commune doit être le
**projet** (la fiche `project`), dont le dépôt est l'identité et l'emplacement, pas le dépôt lui-même :

- le catalogue, l'architecture (§5.8, création de projet : dépôt, environnement, règles) et la décision
  `identite-projets` parlent de projet ; ajouter « dépôt » comme seconde notion reproduirait l'incohérence constatée ;
- un projet peut avoir plusieurs emplacements (clones, worktrees, montage d'un conteneur) : l'identifiant les réunit ;
- tout ne relève pas d'un projet (skills et connecteurs du niveau utilisateur, session lancée dans `/tmp`) : l'absence
  de rattachement se dit (« hors projet »), elle ne se force pas.

**Décision proposée.**

| Point | Choix |
|---|---|
| Notion | le projet du catalogue, identifié par son dépôt (premier commit) ; « dépôt » désigne son support Git, pas une autre entité |
| Fiche | lien `links.project` : identifiant(s) du projet, posé par tout adaptateur dont l'élément appartient à un projet (éléments Claude Code d'un dépôt, mémoires, nœuds de l'arbre, conteneurs et volumes) ; absent au niveau utilisateur |
| Événement | `data.projets` : `[{id, n}]` (projets touchés et poids) remplace `data.depots` ; `data.projet` (nom du dossier de départ) reste pour l'affichage et l'historique, il ne sert plus à regrouper |
| Rattachement | un seul module (`src/projets.js`) : chemin → projet (le plus profond, montage d'un conteneur compris par le nom du dépôt), utilisé par l'import, l'inventaire, `holarch distant` et le socle |
| Lectures | toute agrégation par projet passe par l'identifiant et la même attribution (tableau de bord, consommation, sessions, Projets, outils MCP) ; un nom donné en paramètre se résout en identifiant |
| Nœuds de l'arbre | identifiant fondé sur celui du projet ; la migration passe par la ré-identification (`element.moved`) |
| Historique | les événements anciens ne se réécrivent pas ; leur projet se déduit à la lecture du dossier de départ (`cwd`) et des compléments déjà importés |

**Conséquences.** Contrat fiche 0.4.0 (lien `project`) ; contrat événement : rien dans le schéma (le contenu de `data`
est libre), une convention écrite au §2. Refonte de l'inventaire, de l'import, du socle, de l'interface et du serveur
MCP ; les tests suivent.
