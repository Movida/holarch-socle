---
type: contract
title: Contrat — registre de configuration
description: Les clés de réglage (`config`) qu'un nœud de l'arbre peut porter, qui les lit, et comment elles se fusionnent d'une couche à l'autre.
status: draft
version: 0.1.0
links:
  derives_from: [/arbre/conception/contrats/noeud.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md]
---

# Contrat — registre de configuration

Un nœud porte ses réglages sous `config` (contrat nœud). Ils se fusionnent du profil vers le projet, dans l'ordre de la
règle effective : un objet clé à clé, une liste s'allonge, une valeur simple posée plus bas l'emporte. Une clé absente
de ce registre n'est lue par personne ; une clé s'y ajoute avec le mécanisme qui la lit.

| Clé | Porté par | Lu par | Contenu |
|---|---|---|---|
| `journal` | projet | contrôle `journal-tenu` | chemin du journal du projet, relatif au dépôt |
| `donnees_personnelles` | profil, projet | contrôle `donnees-personnelles` | `termes` à ajouter à la liste déduite ; `exceptions` : `{terme, pourquoi}` ou `{fichier, pourquoi}` |
| `dependances` | profil, projet | contrôle `dependances-vulnerables` | `seuil_cvss` (7 par défaut) |
| `outils_surveilles` | profil | contrôle `outils-a-jour` | `[{nom, commande, github \| node: lts}]` |
| `claude_code` | profil | adaptateur Claude Code (compte) | `reglages` : clés de `settings.json` (`autoCompactWindow`…) ; `passation` : `{seuil_tokens, reprise}` |

Les réglages du **site** (outils, délais, interface) ne sont pas des réglages de l'arbre : ils vivent dans la
configuration du site (`config.yaml`, hors dépôt).
