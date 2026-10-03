---
type: contract
title: Contrat — nœud de l'arbre
description: Ce qu'est un nœud (un fichier Markdown à en-tête YAML), ses champs, ses liens typés, son cycle de vie et l'héritage de configuration.
status: draft
version: 0.1.0
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Contrat — nœud de l'arbre

## 1. Forme

Un nœud est **un fichier Markdown** avec un en-tête YAML, compatible avec Open Knowledge Format (OKF 0.2). Un dossier
regroupe les nœuds d'un même niveau et porte un `index.md` (liste des nœuds, une ligne « - description » chacun).
L'identité d'un nœud est son chemin depuis la racine de l'arbre ; un `id` explicite survit aux déplacements.

Un nœud n'existe que s'il aide à décider ou à agir (principe P8).

## 2. En-tête

| Champ | Obligatoire | Valeur |
|---|---|---|
| `type` | oui | un type du registre (`/arbre/conception/types.md`) |
| `title`, `description` | oui | texte ; la description tient en une phrase |
| `status` | oui | `draft` · `stable` · `deprecated` |
| `id` | non | identifiant stable, `kebab-case` |
| `approved` | si `stable` | `{by: human:<id>, at: AAAA-MM-JJ, ref: <trace de l'approbation>}` |
| `generated` | non | `{by: <acteur>, at: AAAA-MM-JJ}` |
| `review` | non | revue ouverte : `{reason, since, suspends, keeps}` ; un nœud en revue est suspendu pour ce que dit `suspends` |
| `as_of`, `stale_after` | non | date de validité, date de péremption |
| `classification` | non (hérité) | `public` · `internal` · `confidential` · `sensitive` |
| `types` | non | types transverses d'un `project`, dans l'ordre d'héritage |
| `roles` | non (hérité) | `{subject: [human:…], operator: [human:…], …}` |
| `config` | non (hérité) | réglages, clés prises dans le registre de configuration (étape 1) |
| `links` | selon le type | voir §3 |
| `sources` | non | `[{id, resource, title}]`, citées dans le texte par `[^id]` |

## 3. Liens typés

| Lien | Sens |
|---|---|
| `derives_from` | le parent dans l'arbre ; obligatoire sauf pour la racine |
| `constrained_by` | contraintes déclarées en plus de celles héritées |
| `depends_on` | dépendance fonctionnelle |
| `supported_by` | observation, mesure ou document qui appuie le nœud |
| `tests` | une expérience teste une hypothèse |
| `modifies` | une décision modifie un nœud |
| `realized_by` | ce qui réalise le nœud (tranche, livrable, élément du catalogue) |

Les liens sont des chemins absolus depuis la racine du dépôt de l'arbre, ou des identifiants du catalogue
(`holarch:<kind>:<slug>`, contrat fiche).

## 4. Cycle de vie et autorité

- Tout ce qu'un agent crée est `draft`. Seul un `stable` oblige.
- Un nœud passe en `stable` quand un agent **consigne** une approbation humaine écrite (`approved`) ; jamais de
  lui-même. Lever une `review` est un acte humain.
- Modifier un nœud `stable` passe par un nœud `decision` qui le `modifies`.
- `deprecated` retire un nœud sans l'effacer ; ses descendants sont signalés.

## 5. Héritage

`classification`, `roles`, `config` et les règles (contrat règle) **s'héritent** le long de `derives_from`, puis des
`types` dans l'ordre déclaré. Le plus spécifique l'emporte, sauf valeur ou règle déclarée non dérogeable plus haut.
La **vue effective** d'un nœud est l'ensemble calculé, chaque valeur avec sa provenance. Une contrainte héritée n'a pas
à être redéclarée dans `constrained_by`.

`[À COMPLÉTER : héritage d'une classification — peut-on la relâcher plus bas (public sous confidential) ? Proposition :
non, une classification ne peut que se durcir en descendant.]`
