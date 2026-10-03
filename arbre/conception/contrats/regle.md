---
type: contract
title: Contrat — règle
description: Une règle est une donnée attachée à un nœud ; elle s'hérite, se déroge explicitement, et s'applique par des adaptateurs selon son niveau.
status: draft
version: 0.1.0
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/conception/contrats/noeud.md]
---

# Contrat — règle

## 1. Forme

Les règles d'un nœud vivent dans un fichier `rules.yaml` à côté de lui (ou dans son en-tête sous `rules:` pour une ou
deux). Exemple fictif :

```yaml
- id: verifier-ci-apres-push
  statement: Après tout envoi vers un dépôt distant, lire le résultat de l'intégration continue et le rapporter.
  why: Un envoi non vérifié a laissé une intégration rouge plusieurs jours.
  trigger: after_action        # before_action · after_action · periodic · session_start · session_end · project_creation
  match: { action: git.push }   # sur quoi le déclencheur porte ; vocabulaire des actions : étape 3
  level: verified               # blocking · verified · guided · reminder
  derogable: true
  applies_to: { node_types: [project] }
  status: stable
  approved: { by: human:alice, at: 2026-10-03 }
  source: harvest               # written · harvest · decision
  review_after: 2027-04-01
```

## 2. Niveaux d'application

| Niveau | Effet | Coût en contexte |
|---|---|---|
| `blocking` | garde déterministe : l'action n'a pas lieu | nul |
| `verified` | contrôlé après coup ; écart journalisé et signalé | nul |
| `guided` | procédure chargée à la demande quand le déclencheur survient | ponctuel |
| `reminder` | consigne toujours présente dans le contexte de l'agent | **à chaque tour** — réservé au très court |

Un adaptateur traduit une règle pour un client (hook, permission, consigne de serveur MCP, contrôle d'un runtime). Une
règle qu'un client ne peut pas appliquer à son niveau descend au niveau applicable suivant, et l'écart est visible
dans la vue effective.

## 3. Héritage, dérogation, conflits

- Une règle vaut pour le nœud qui la porte et toute sa descendance (puis par les `types` d'un projet).
- **Dérogation** : un nœud descendant déclare `derogations: [{rule, why, by, at}]` ; refusée si la règle est
  `derogable: false`.
- **Conflit** : le plus spécifique l'emporte, sauf règle non dérogeable ; un conflit que ces deux principes ne
  tranchent pas devient une décision pour l'humain.
- **Règle effective** d'un nœud : l'ensemble calculé, chaque règle avec sa provenance (nœud porteur, dérogations
  traversées).

## 4. Évolution

- **Récolte** : une consigne répétée par l'humain devient une règle proposée (`status: draft`, `source: harvest`).
- **Remontée** : une règle présente chez deux enfants ou plus est proposée au parent ; une règle du parent dérogée par
  la plupart de ses enfants est proposée à la descente.
- Une règle a une date de revue ; une règle jamais déclenchée depuis longtemps est proposée au retrait.
