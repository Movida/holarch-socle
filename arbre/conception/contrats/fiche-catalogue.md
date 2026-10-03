---
type: contract
title: Contrat — fiche du catalogue
description: Tout élément en place a une fiche ; ce qui n'est pas au catalogue n'existe pas pour le système.
status: draft
version: 0.1.0
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Contrat — fiche du catalogue

## 1. Champs

| Champ | Valeur |
|---|---|
| `id` | `holarch:<kind>:<slug>`, unique et stable |
| `kind` | `rule` · `procedure` · `skill` · `hook` · `agent_profile` · `model_profile` · `knowledge_base` · `project` · `node` · `run` · `budget` · `connector` · `context` · `adapter` · `brick` · `idea` (extensible par décision) |
| `name`, `description` | texte court |
| `version` | semver, si l'élément est versionné |
| `node` | nœud de l'arbre auquel l'élément est attaché (portée) |
| `context` | contexte effectif (hérité du nœud) |
| `status` | `proposed` · `active` · `suspended` · `retired` |
| `provenance` | `{source, created_by, at}` : d'où vient l'élément (écrit, récolté, importé, généré) |
| `license`, `shareable` | licence ; `true` si l'élément peut aller dans le socle public |
| `classification` | niveau effectif (contrat nœud) |
| `location` | où l'élément vit réellement (chemin, URL, conteneur) — une référence, jamais un secret |
| `usage` | `{count, last_used, cost_usd}`, tenu à jour depuis le journal |
| `links` | `depends_on`, `realizes` (nœud), `replaces` |

## 2. Règles

- Le catalogue est **dérivé autant que possible** : une fiche se crée par inventaire (ce qui existe déjà), par
  création (la brique qui crée l'élément l'inscrit), ou par import ; une fiche orpheline (élément introuvable à sa
  `location`) est signalée.
- Créer, modifier, suspendre ou retirer une fiche émet un événement (`element.*`, contrat événement).
- L'interface liste le catalogue : c'est la réponse à « qu'est-ce qui est en place ? ».
