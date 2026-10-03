---
type: contract
title: Contrat — acteurs
description: Comment un acteur (humain, agent, brique du système) est désigné partout où une action, une approbation ou un événement est attribué.
status: draft
version: 0.1.0
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Contrat — acteurs

| Forme | Désigne | Exemple |
|---|---|---|
| `human:<id>` | une personne, identifiant choisi dans le profil | `human:alice` |
| `agent:<runtime>/<modèle>` | une session d'agent, par runtime et modèle réel | `agent:claude-code/claude-opus-5-5` |
| `system:<brique>` | une brique du socle agissant d'elle-même | `system:regulation`, `system:dream` |

- Seul un `human:` approuve (`approved.by`), lève une revue ou décide d'un geste irréversible (principe P5).
- Les **rôles** sont portés par les nœuds (`roles`, contrat nœud) : `subject` (autorité sur sa voix, ses limites, ses
  données et toute publication), `operator` (autorité sur la structure et la méthode) ; d'autres rôles par
  configuration.
- Un identifiant `human:` ne contient ni courriel ni nom complet dans le socle ; la correspondance vit dans le profil
  privé.
