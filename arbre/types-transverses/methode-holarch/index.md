---
type: template
id: methode-holarch
title: Type transverse — méthode HOLARCH
description: Les règles de la méthode qu'un projet adopte en déclarant ce type ; chacune désigne un registre par son rôle, le projet dit où il est.
status: draft
config:
  # Création de projet (décision creation-de-projet) : un arbre tient son journal, la règle journal-du-projet le lit.
  creation: { journal: arbre/log.md }
links:
  derives_from: [/arbre/index.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md]
---

# Type transverse — méthode HOLARCH

La façon de travailler d'un projet construit avec sa propre arborescence : rien n'oblige tant que l'humain ne l'a pas
approuvé, rien ne s'invente, rien ne se crée d'avance, une contrainte ne change que par une décision. Avant ce type,
ces règles étaient écrites deux fois, avec des mots différents, dans les consignes de deux projets (récolte du
2026-10-06, `conception/etape-3-regles-projets.md`, tranche 3).

Les règles sont dans [`rules.yaml`](rules.yaml). Elles désignent le registre des questions ouvertes, le journal et les
décisions par leur rôle : chaque projet dit dans ses propres consignes où ils se trouvent.
