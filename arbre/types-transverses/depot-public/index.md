---
type: template
id: depot-public
title: Type transverse — dépôt public
description: Ce que doit respecter un projet dont le dépôt est public.
status: draft
config:
  # Création de projet (décision creation-de-projet) : un dépôt public est public sur GitHub et porte une licence (MIT,
  # celle de 2 des 3 dépôts publics du poste).
  creation: { visibilite: public, licence: MIT }
  # Une licence nomme son titulaire : le fichier est soustrait au contrôle des données personnelles, pour tout dépôt
  # public (accord de l'auteur, 2026-10-07 ; d'abord posé pour le seul socle). De même pour le NOTICE d'Apache-2.0
  # (accord de l'auteur, 2026-10-07, sur okf-bundle-template).
  donnees_personnelles:
    exceptions:
      - { fichier: LICENSE, pourquoi: "titulaire du droit d'auteur de la licence" }
      - { fichier: NOTICE, pourquoi: "titulaire du droit d'auteur, avis exigé par Apache-2.0" }
links:
  derives_from: [/arbre/index.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md]
---

# Type transverse — dépôt public

Un dépôt public se lit par n'importe qui et se copie sans retour possible (principe P7). Règles dans
[`rules.yaml`](rules.yaml).
