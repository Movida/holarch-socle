---
type: template
id: projet-dormant
title: Type transverse — projet dormant
description: Un projet peu actif, déclaré pour ses règles et son audit, sans conteneur ni accès distant.
status: draft
config:
  # Création de projet (décision creation-de-projet) : ni conteneur de développement (donc ni clé de déploiement) ni
  # service d'accès distant ; un service qui tourne et une clé ne servent pas un dépôt touché quelques fois par mois
  # (choix de l'auteur, 2026-10-07, sur okf-bundle-template : 4 commits, le dernier le 2026-09-21).
  creation: { etapes: { conteneur: false, distant: false } }
links:
  derives_from: [/arbre/index.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md]
---

# Type transverse — projet dormant

Un projet qu'on touche rarement reste déclaré, pour ses règles, son identité de commit et son audit, sans ce qui ne sert
qu'à un travail suivi : conteneur de développement, clé de déploiement, accès distant. Pas de règle propre.
