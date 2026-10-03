---
type: spec
title: Étape 1 — Voir
description: Catalogue et journal alimentés par l'existant, et une interface web en lecture qui montre ce qui est en place et ce qui se passe.
status: draft
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/conception/contrats/fiche-catalogue.md, /arbre/conception/contrats/evenement.md, /arbre/decisions/2026-10-03-synchronisation.md, /arbre/decisions/2026-10-03-cout-liste.md, /arbre/decisions/2026-10-03-sources-hote.md]
---

# Étape 1 — Voir

**Sert** B2 (« voir ce qui est en place et ce qui se passe »). **Critère d'usage** : l'utilisateur ouvre l'interface
plutôt que de demander « qu'est-ce qui est en place ? » ou « qu'est-ce qui a tourné, pour combien ? ».

## Livre

1. **Inventaire** → catalogue : des adaptateurs d'inventaire, un par source, chacun optionnel et activé par la
   configuration. Premiers adaptateurs : Claude Code (skills, agents, hooks, serveurs MCP, plugins, mémoires par
   projet), dépôts Git sous des racines configurées, l'arbre HOLARCH lui-même. Aucun contenu sensible n'est copié :
   une fiche porte une référence (`location`), un nom, une description, des mesures.
2. **Import du journal** : des adaptateurs d'import, idempotents. Premier : les transcriptions Claude Code → événements
   `session.started`, `session.finished`, `cost.recorded` (tokens par modèle). Le coût en USD se calcule à la lecture,
   seulement depuis une grille de tarifs configurée, relevée et citée — aucun tarif n'est inventé (décision coût liste).
3. **Stockage** : journal en JSON Lines par site et par mois, en ajout seul (le contrat) ; un index SQLite reconstruit
   depuis le journal et l'inventaire, jetable. Données dans un répertoire de travail hors dépôt (`~/.holarch` par
   défaut, configurable) : rien de personnel n'entre dans le dépôt public.
4. **Interface web en lecture**, servie en local : tableau de bord, catalogue, journal (sessions, tokens par projet et
   par modèle), arbre (nœuds et statuts). Le serveur expose une API JSON que le hub MCP (étape 2) reprendra telle quelle.
5. **Ligne de commande** : `holarch inventaire`, `holarch importer`, `holarch voir`, `holarch etat`.

## Choix techniques (principe P12)

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| Node.js (≥ 22), modules ES, sans étape de compilation | répandu, SDK MCP officiel, `node:sqlite` intégré | un besoin de performance ou d'écosystème qu'il ne couvre pas |
| JSON Schema pour les contrats | neutre vis-à-vis du langage : le contrat survit à l'implémentation | — |
| JSON Lines + SQLite | journal lisible et fusionnable, index sans serveur | volume ou accès concurrent au-delà d'un poste |
| Interface en HTML, CSS et JavaScript sans framework | aucune chaîne de construction, durable | une interface qui devient une application riche (étape 5 et au-delà) |
| Configuration en YAML | lisible et éditable à la main | — |

## Avancement

- **Fait (2026-10-03)** : inventaire (Claude Code, dépôts Git, arbre), import des transcriptions Claude Code, journal et
  index, interface web en lecture (tableau de bord, catalogue, sessions, journal, arbre), ligne de commande, 8 tests.
- **Fait (2026-10-03)** : tarifs — grille officielle relevée et citée dans la configuration du site, coût liste
  calculé à l'indexation (tableau de bord, par modèle, par session, `holarch etat`), écriture de cache à une heure
  ventilée, mode rapide à part, compléments pour l'historique déjà importé ; 11 tests.
- **Fait (2026-10-03)** : adaptateurs Docker (conteneurs, volumes, par l'API en lecture) et Claude Desktop (serveurs
  MCP) ; une source absente est signalée à part ; inventaire asynchrone ; 13 tests. Décision `sources-hote` en brouillon.
- **Reste, dans cet ordre** :
  1. **Câbler l'accès en lecture** du conteneur du socle (proxy Docker filtrant, montage de la configuration de
     Claude Desktop), après approbation de la décision `sources-hote`.
  2. **Relecture et approbation des contrats** : événement, fiche et acteurs approuvés le 2026-10-03 ; nœud et règle
     attendent d'avoir été exercés (règle à l'étape 3).
  3. **Critère d'usage** observé sur une semaine (l'utilisateur ouvre l'interface plutôt que de demander), puis
     ouverture de l'étape 2 (hub MCP).
- **Plus tard, quand le besoin se présente** : grille de tarifs versionnée par date au premier changement de tarif.

## Hors périmètre

Écriture depuis l'interface, hub MCP, règles appliquées, exécution : étapes suivantes.
