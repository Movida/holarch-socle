---
type: decision
title: Un projet garde son identité quand il change de place
description: Un dépôt est identifié par son premier commit ; un changement d'emplacement ou d'identifiant devient element.moved et l'historique suit.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « ok pour ce que tu proposes » (avis rendu point par point)" }
links:
  derives_from: [/arbre/conception/etape-1-voir.md]
  modifies: [/arbre/conception/contrats/evenement.md]
  constrained_by: [/arbre/conception/contrats/fiche-catalogue.md]
---

# Un projet garde son identité quand il change de place

**Contexte.** Le contrat fiche veut un identifiant « unique et stable » ; celui d'un projet venait de son chemin. Un
déplacement (par exemple d'un conteneur de développement à un autre) se lisait donc comme une disparition suivie d'une
création, et coupait l'historique.

**Décision.**

| Point | Choix |
|---|---|
| Identité d'un dépôt | son **premier commit** (le plus ancien s'il y a plusieurs racines), 12 caractères ; sans commit, le chemin |
| Clones d'un même dépôt sur un site | départagés par un suffixe tiré du chemin |
| Déplacement | même identifiant, autre emplacement : `element.moved` (`data.de`, `data.vers` : identifiant et emplacement) |
| Ré-identification | un identifiant disparaît pendant qu'un autre apparaît au même emplacement, pour le même kind : `element.moved` aussi ; c'est ainsi que les identifiants fondés sur le chemin migrent sans perte |
| Historique | la fiche d'un élément montre aussi les événements de ses identifiants précédents |
| Portée | la détection vaut pour tout kind ; seule l'identité des projets change ici (les mémoires et éléments rangés par projet suivront sur un cas réel) |

**Conséquences.** Contrat événement 0.5.0 (`element.moved`).
