---
type: principles
title: Principes
description: Les contraintes qui s'imposent à toute conception de HOLARCH, et les préférences qui l'orientent.
status: draft
links:
  derives_from: [/arbre/fondations/manifeste.md]
---

# Principes

Chaque principe porte sa nature : une **contrainte** ne se contourne que par une décision ; une **préférence** oriente
un arbitrage.

| # | Principe | Nature |
|---|---|---|
| P1 | **Les contrats sont le produit.** Formats, interfaces et protocoles sont versionnés ; toute implémentation est un adaptateur remplaçable. | contrainte |
| P2 | **Autour des runtimes, pas à leur place.** Avant d'écrire une brique : un runtime ou un outil existant le fait-il déjà, et bien ? Si oui, on l'adapte et on le gouverne. | contrainte |
| P3 | **Modulable, configurable, évolutif.** Toute brique est optionnelle ; toute configuration est une donnée portée par un nœud de l'arbre, jamais codée en dur. | contrainte |
| P4 | **Visible.** Ce qui n'est pas au catalogue n'existe pas ; ce qui n'est pas au journal ne s'est pas passé. | contrainte |
| P5 | **L'humain décide de l'irréversible.** L'agent écrit des brouillons et consigne les approbations ; approuver n'autorise pas à agir sans une autorisation qui porte sur une version, une destination et des limites. | contrainte |
| P6 | **Cloisonné.** Une donnée ne sort jamais du contexte et du niveau de classification qui l'autorisent ; le hub l'applique, pas l'agent. | contrainte |
| P7 | **Partageable.** Le socle ne contient rien de personnel ; le personnel vit dans un profil privé. | contrainte |
| P8 | **Rien n'est créé à l'avance.** Un élément n'existe que s'il aide à décider ou à agir. | contrainte |
| P9 | **Mesure avant réglage.** Une évolution s'adopte sur une mesure ; le banc grandit avec chaque incident. | contrainte |
| P10 | **Le recul avant le rapiéçage.** Devant une adaptation qui résiste, comparer explicitement « adapter » et « recréer depuis plus haut ». | préférence |
| P11 | **La cérémonie au juste niveau.** Question, tâche ou mission : la machinerie ne s'active que quand la tâche la justifie. | préférence |
| P12 | **Des technologies ordinaires.** À service égal, l'outil le plus répandu et le plus simple, avec la raison du choix et la condition qui le ferait changer. | préférence |
