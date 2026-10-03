---
type: contract
title: Registre des types de nœuds
description: Les types de nœuds de l'arbre, leurs parents admis et leurs liens obligatoires. Extensible par décision.
status: draft
version: 0.1.0
links:
  derives_from: [/arbre/conception/contrats/noeud.md]
---

# Registre des types de nœuds

Le vocabulaire est **minimal et extensible** : un type s'ajoute par une décision, avec son gabarit. Un outil (le
vérificateur, l'interface) lit ce registre, il ne code aucun type en dur.

| Type | Rôle | Parent admis (`derives_from`) | Liens obligatoires |
|---|---|---|---|
| `guideline` | ligne directrice, racine d'un arbre | — | — |
| `manifesto`, `principles` | fondations : pourquoi, contraintes et préférences | `guideline`, `manifesto` | — |
| `context` | contexte cloisonné (pro, perso, client…) | `guideline` | — |
| `activity` | activité ou domaine regroupant des projets | `guideline`, `context`, `activity` | — |
| `project` | projet ; peut déclarer des `types` transverses | `context`, `activity`, `project` | — |
| `need` | besoin qualifié | tout nœud au-dessus | `constrained_by` dès qu'une contrainte s'applique |
| `hypothesis` | hypothèse à tester | `need` | — |
| `spec` | spécification | `need`, `hypothesis`, `spec` | `constrained_by` |
| `slice` | tranche verticale en cours ou faite | `spec` | `constrained_by` |
| `experiment` | expérience limitée | `hypothesis` | `tests` |
| `observation` | constat daté | tout nœud | — |
| `decision` | décision, transversale | tout nœud | `modifies` si elle change un nœud `stable` |
| `contract` | contrat versionné | `spec`, `guideline` | — |
| `procedure` | procédure (guide d'application d'une règle, mode opératoire) | tout nœud | — |

Types transverses de projet (gabarits partagés par des projets de parents différents, §5.2 de l'architecture) : registre
à ouvrir à l'étape 3, quand le premier sera utilisé (principe P8).
