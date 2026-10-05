---
type: contract
title: Contrat — fiche du catalogue
description: Tout élément en place a une fiche ; ce qui n'est pas au catalogue n'existe pas pour le système.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « ok pour tes recommandations »" }
version: 0.4.0
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-03-sources-hote.md, /arbre/decisions/2026-10-05-rattachement-projet.md]
---

# Contrat — fiche du catalogue

## 1. Champs

| Champ | Valeur |
|---|---|
| `id` | `holarch:<kind>:<slug>`, unique et stable |
| `kind` | `rule` · `procedure` · `skill` · `hook` · `agent_profile` · `model_profile` · `knowledge_base` · `project` · `node` · `run` · `budget` · `connector` · `context` · `adapter` · `brick` · `idea` · `memory` (note de mémoire d'un outil) · `instructions` (fichier de consignes d'un outil, `CLAUDE.md`…) · `plugin` · `plugin_marketplace` · `container` (conteneur, actif s'il tourne) · `volume` (volume de conteneurs) (extensible par décision) |
| `name`, `description` | texte court |
| `version` | semver, si l'élément est versionné |
| `node` | nœud de l'arbre auquel l'élément est attaché (portée) |
| `context` | contexte effectif (hérité du nœud) |
| `status` | `proposed` · `active` · `suspended` · `retired` |
| `provenance` | `{source, created_by, at}` : d'où vient l'élément (écrit, récolté, importé, généré) |
| `license`, `shareable` | licence ; `true` si l'élément peut aller dans le socle public |
| `classification` | niveau effectif (contrat nœud) |
| `site` | site où l'élément vit, s'il est propre à une machine (hook local, conteneur) ; absent s'il vit dans Git |
| `location` | où l'élément vit réellement (chemin, URL, conteneur) — une référence, jamais un secret |
| `usage` | `{count, last_used, cost_usd}`, tenu à jour depuis le journal |
| `links` | `depends_on`, `realizes` (nœud), `replaces` ; `project` : identifiants des projets (fiches `project`) auxquels l'élément appartient, absent pour un élément qui n'appartient à aucun projet (niveau utilisateur) |
| `attributes` | attributs propres au `kind`, posés par l'adaptateur qui crée la fiche ; non normatifs |

## 2. Règles

- Le catalogue est **dérivé autant que possible** : une fiche se crée par inventaire (ce qui existe déjà), par
  création (la brique qui crée l'élément l'inscrit), ou par import ; une fiche orpheline (élément introuvable à sa
  `location`) est signalée.
- Créer, modifier, suspendre ou retirer une fiche émet un événement (`element.*`, contrat événement).
- L'interface liste le catalogue : c'est la réponse à « qu'est-ce qui est en place ? ».
