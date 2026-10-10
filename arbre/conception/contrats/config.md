---
type: contract
title: Contrat — registre de configuration
description: Les clés de réglage (`config`) qu'un nœud de l'arbre peut porter, qui les lit, et comment elles se fusionnent d'une couche à l'autre.
status: draft
version: 0.8.0
links:
  derives_from: [/arbre/conception/contrats/noeud.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md, /arbre/decisions/2026-10-07-identite-par-contexte.md, /arbre/decisions/2026-10-07-creation-de-projet.md, /arbre/decisions/2026-10-09-veille-et-conteneur-precisions.md, /arbre/decisions/2026-10-09-environnement-d-execution.md, /arbre/decisions/2026-10-10-exceptions-hors-du-depot.md, /arbre/decisions/2026-10-10-profil-designe.md, /arbre/decisions/2026-10-10-fusion-et-profil-audite.md]
---

# Contrat — registre de configuration

Un nœud porte ses réglages sous `config` (contrat nœud). Ils se fusionnent du profil vers le projet, dans l'ordre de la
règle effective : un objet clé à clé, une liste s'allonge, une valeur simple posée plus bas l'emporte sur une valeur
simple. Elle ne remplace ni un objet ni une liste d'une couche plus haute : celle-ci tient, et la règle effective le dit
(décision `fusion-et-profil-audite`) ; lever une règle passe par une dérogation. Une clé absente
de ce registre n'est lue par personne ; une clé s'y ajoute avec le mécanisme qui la lit. Une clé à portée restreinte
(`montage_sensible`, et les `exceptions` de `donnees_personnelles`) n'est pas lue quand une autre couche la porte, ni
dans le dépôt contrôlé, et la règle effective le dit.

Les `exceptions` d'un réglage se lisent d'une seule façon, couche par couche, chacune avec sa provenance : sans sa
valeur ou sans raison (`pourquoi`), une exception ne vaut pas ; celle qui ne vaut pas se dit à l'audit, avec ce qui
l'écarte.

| Clé | Porté par | Lu par | Contenu |
|---|---|---|---|
| `journal` | projet | contrôle `journal-tenu` | chemin du journal du projet, relatif au dépôt |
| `donnees_personnelles` | `termes` : toute couche ; `exceptions` : profil, contexte seulement, lues hors du dépôt contrôlé (décision `profil-designe`) | contrôle `donnees-personnelles` | `termes` à ajouter à la liste déduite ; `exceptions` : `{terme, pourquoi}` ou `{fichier, pourquoi}` |
| `dependances` | profil, projet | contrôle `dependances-vulnerables` | `seuil_cvss` (7 par défaut) |
| `outils_surveilles` | profil | contrôle `outils-a-jour` | `[{nom, commande, github \| node: lts}]` |
| `claude_code` | profil | adaptateur Claude Code (compte) | `reglages` : clés de `settings.json` (`autoCompactWindow`…) ; `passation` : `{seuil_tokens, reprise}` |
| `identite` | profil, contexte, projet | `holarch regles appliquer` (réglage local de git), contrôle `identite-de-commit` | `{nom, email}` : l'identité sous laquelle committent les projets déclarés (décision `identite-par-contexte`) |
| `montage_sensible` | profil, contexte seulement, lu hors du dépôt contrôlé (décision `exceptions-hors-du-depot`) | contrôle `montage-sensible` (décision `veille-et-conteneur-precisions`) | `exceptions` : `{ecart, pourquoi}`, la clé exacte d'un écart et sa raison ; le risque reste, l'écart ne se dit plus. Une exception qui fait taire un écart se dit dans le résultat du contrôle ; une exception qui n'en fait taire aucun, sur l'audit de tous les projets du site, est un écart du compte (périmée), jugée sur ce site seulement, et seulement si le contrôle a lu en entier chacun des projets que couvre son nœud |
| `creation` | profil, contexte, type | `holarch projet creer` (décision `creation-de-projet`) | `dossier` (parent du projet, `~` par défaut), `visibilite` (`private` par défaut, `public`), `licence` (nom d'un modèle du socle, `modeles/projet/licences/`), `journal` (chemin du journal d'un arbre créé), `proprietaire` (compte GitHub ; par défaut, le compte actif de `gh`), `etapes` : `{github, conteneur, distant}`, oui par défaut |
| `conteneur` | profil, contexte, type, projet | `holarch projet creer` (étape `conteneur`), audit (écart `conteneur-genere`, décision `environnement-d-execution`) | `devcontainer` : clés du format `devcontainer.json` telles quelles, `remoteUser` attendu (le profil le pose avec l'image de base) ; `gpu` (`non` par défaut, `optionnel`, `requis` : `hostRequirements.gpu`) ; `connexion_claude` (`volume` par défaut, `hote` : le `~/.claude` de l'hôte monté, dérogation écrite). Le socle pose ensuite ses clés, qu'aucune couche ne remplace : `name`, `initializeCommand`, ses montages, `CLAUDE_CONFIG_DIR` et `CLAUDE_CODE_PROJECT_DIR_NAME`, `ANTHROPIC_API_KEY` vidée, `onCreateCommand.holarch` ; une couche qui en pose une ne se génère pas |

Les réglages du **site** (outils, délais, interface) ne sont pas des réglages de l'arbre : ils vivent dans la
configuration du site (`config.yaml`, hors dépôt). Le dépôt du profil en est un (`profil`, décision `profil-designe`).
