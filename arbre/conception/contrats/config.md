---
type: contract
title: Contrat — registre de configuration
description: Les clés de réglage (`config`) qu'un nœud de l'arbre peut porter, qui les lit, et comment elles se fusionnent d'une couche à l'autre.
status: draft
version: 0.4.0
links:
  derives_from: [/arbre/conception/contrats/noeud.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md, /arbre/decisions/2026-10-07-identite-par-contexte.md, /arbre/decisions/2026-10-07-creation-de-projet.md, /arbre/decisions/2026-10-09-veille-et-conteneur-precisions.md]
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
| `identite` | profil, contexte, projet | `holarch regles appliquer` (réglage local de git), contrôle `identite-de-commit` | `{nom, email}` : l'identité sous laquelle committent les projets déclarés (décision `identite-par-contexte`) |
| `montage_sensible` | profil, contexte, type, projet | contrôle `montage-sensible` (décision `veille-et-conteneur-precisions`) | `exceptions` : `{ecart, pourquoi}`, la clé exacte d'un écart et sa raison (sans raison, l'exception ne vaut pas) ; le risque reste, l'écart ne se dit plus |
| `creation` | profil, contexte, type | `holarch projet creer` (décision `creation-de-projet`) | `dossier` (parent du projet, `~` par défaut), `visibilite` (`private` par défaut, `public`), `licence` (nom d'un modèle du socle, `modeles/projet/licences/`), `journal` (chemin du journal d'un arbre créé), `proprietaire` (compte GitHub ; par défaut, le compte actif de `gh`), `etapes` : `{github, conteneur, distant}`, oui par défaut |

Les réglages du **site** (outils, délais, interface) ne sont pas des réglages de l'arbre : ils vivent dans la
configuration du site (`config.yaml`, hors dépôt).
