---
type: decision
title: Clore l'étape 1 sur sa livraison, mesurer son critère en continu
description: L'étape 2 s'ouvre sans attendre la semaine d'usage de l'étape 1 ; le critère reste ouvert, mesuré par les pages consultées.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « ça semble complet […] On pourra y revenir ; pas besoin d'attendre une semaine »" }
links:
  derives_from: [/arbre/conception/etape-1-voir.md]
  modifies: [/arbre/decisions/2026-10-03-fondation.md, /arbre/conception/contrats/evenement.md]
---

# Clore l'étape 1 sur sa livraison, mesurer son critère en continu

**Contexte.** La décision fondatrice n° 7 tient chaque étape à son critère d'usage avant d'ouvrir la suivante. L'étape 1
a livré tout ce que sa spécification prévoyait ; son critère (« l'auteur ouvre l'interface plutôt que de demander ») n'a
pas encore été observé.

**Décision (de l'auteur).** L'étape 2 s'ouvre sans attendre une semaine d'observation. Le critère de l'étape 1 n'est
pas abandonné : il reste ouvert, et il est **mesuré en continu** pour qu'on y revienne avec des chiffres.

| Point | Choix |
|---|---|
| Mesure | chaque page de l'interface consultée devient un événement `ui.viewed` (page, et période pour le tableau de bord ; rien d'autre) ; le tableau de bord dit sur combien de jours l'interface a été ouverte et quelles pages servent |
| Ce qui ne se mesure pas | « l'auteur ne demande plus ce qui tourne » : ce serait lire ses messages ; il le dit lui-même |
| Retour sur le critère | au plus tard à la clôture de l'étape 2, avant d'ouvrir l'étape 3 ; une page jamais consultée est candidate au retrait |

**Conséquences.** Contrat événement 0.6.0 (famille `ui.*` : `viewed`). La règle n° 7 reste la règle par défaut ; cette
décision n'en dispense que l'étape 1.
