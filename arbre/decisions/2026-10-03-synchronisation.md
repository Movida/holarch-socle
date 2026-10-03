---
type: decision
title: Synchronisation entre le local et le serveur
description: Ce qui se synchronise entre les sites (local, serveur), comment, et qui fait foi ; résout Q3.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange de conception du 2026-10-03" }
links:
  derives_from: [/arbre/decisions/2026-10-03-fondation.md]
  modifies: [/arbre/conception/contrats/evenement.md, /arbre/conception/contrats/fiche-catalogue.md]
---

# Synchronisation entre le local et le serveur

| État | Fait foi | Synchronisation |
|---|---|---|
| Arbre, règles, configuration, savoir (fichiers) | Git | `pull` / `push` de chaque site ; un conflit devient une décision pour l'humain, jamais une fusion silencieuse |
| Journal | chaque site pour ses propres événements | chaque site écrit le sien, en ajout seul, champ `site` dans chaque événement ; la vue unifiée est l'union triée par `id` (ULID), sans conflit possible |
| Catalogue | dérivé | recalculé par inventaire sur chaque site ; un élément propre à une machine porte son `site` |

Répartition des rôles : le **serveur** porte ce qui tourne en continu (rêve, cadences, missions longues) ; le **local**
porte l'interactif. Chaque site a son hub ; l'interface montre les deux.

Conséquences : champ `site` ajouté au contrat événement (0.2.0) et au contrat fiche du catalogue (0.2.0).
