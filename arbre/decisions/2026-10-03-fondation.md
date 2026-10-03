---
type: decision
title: Décisions fondatrices
description: Les décisions prises par l'auteur le 2026-10-03, qui fondent HOLARCH dans sa forme de socle.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange de conception du 2026-10-03" }
links:
  derives_from: [/arbre/index.md]
  supported_by: [/docs/architecture.md]
---

# Décisions fondatrices (2026-10-03)

1. **Positionnement** : HOLARCH ne fait pas concurrence aux systèmes multi-agents existants ; c'est un socle autour
   d'eux, qui crée une synergie et délègue l'orchestration aux runtimes.
2. **Recommencer à partir de zéro** : ni le framework HOLARCH antérieur ni l'outillage des projets existants ne sont
   des contraintes ; ce sont des sources de leçons. Le nom HOLARCH est conservé.
3. **Architecture** : hub MCP unique, catalogue, journal, briques en conteneurs, régulation, interface web
   (`docs/architecture.md`), approuvée comme base de l'étape 0.
4. **Exigences** : modulable, configurable, évolutif ; partageable en entier et brique par brique ; un seul arbre pour
   les intentions, les règles et la configuration ; création de projet et conformité couvertes ; mémoire, rêve et
   idéation.
5. **Exploitation** : en local et sur un petit serveur, synchronisés.
6. **Partage** : socle public dès le début, dans un dépôt neuf ; le profil personnel reste privé.
7. **Construction par étapes** (architecture §10), chacune tenue à un critère d'usage avant d'ouvrir la suivante.
