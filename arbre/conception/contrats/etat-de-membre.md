---
type: contract
title: Contrat — état d'un membre du hub
description: "La sortie de l'outil `etat` que chaque membre du hub expose, service qui parle MCP ou capsule : trois champs communs, déclarés par un schéma de sortie, pour qu'un client les montre tous de la même façon."
status: stable
version: 0.1.0
approved: { by: human:auteur, at: 2026-11-02, ref: "choix cliquable du 2026-11-02 : « Approuver telle quelle » (décision membres-du-hub), puis « indisponible » pour la valeur de statut" }
links:
  derives_from: [/arbre/decisions/2026-11-02-membres-du-hub.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-14-sorties-mcp-des-chiffres.md]
---

# Contrat — état d'un membre du hub

Chaque membre du hub (décision `membres-du-hub`) expose un outil `etat`, que la passerelle préfixe du nom du membre
(`<membre>_etat`). Un client (agent, page) appelle les `*_etat` des membres et les montre de la même façon, sans
connaître chacun.

**Sortie.** L'outil déclare sa sortie par `outputSchema` et la rend en `structuredContent` ; il la rend aussi en texte
JSON, pour les clients qui ne lisent que le texte. Trois champs sont communs ; tout autre champ est libre, propre au
membre.

| Clé | Valeur | Contenu |
|---|---|---|
| `statut` | `ok` \| `alerte` \| `panne` \| `indisponible` | `ok` : le service fait ce qu'on attend de lui ; `alerte` : il tourne, mais quelque chose demande un regard ; `panne` : il ne fait plus ce qu'on attend de lui ; `indisponible` : le membre ne peut pas établir l'état (source absente ou illisible, outil introuvable), jamais compté comme `ok` |
| `derniere_activite` | horodatage ISO 8601, ou `null` | la dernière activité du service que le membre sait dater ; `null` s'il n'en connaît aucune |
| `resume` | texte | une phrase, en français, qui dit le statut et ce qui le fonde |

Ce que chaque statut signifie pour un service donné (seuils, signaux) appartient au membre : il le dit dans la
description de son outil.

**Membres qui le tiennent.** `holarch`, depuis le 2026-11-02 : âge du dernier inventaire, cibles ignorées par la
passerelle dans l'heure ; seuils au réglage `etat` de la configuration du site.

**Évolution.** Un champ commun s'ajoute par une version mineure ; renommer ou retirer un champ, ou changer le sens d'un
statut, est une décision (contrat P1).
