---
type: decision
title: L'interface s'appuie sur Pico CSS
description: Le look de l'interface vient d'un système de design existant (Pico CSS), servi en local ; HOLARCH n'y ajoute que ses composants propres.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « c'est parti » (Pico CSS recommandé, alternatives présentées)" }
links:
  derives_from: [/arbre/conception/etape-1-voir.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# L'interface s'appuie sur Pico CSS

**Contexte.** L'interface de l'étape 1 avait sa propre feuille de style. Le principe P2 (autour de l'existant, pas à
sa place) vaut aussi pour le look : un système de design entretenu par d'autres donne la typographie, les thèmes clair
et sombre, les tableaux, les champs et les boutons, et laisse HOLARCH à ce qui lui est propre.

**Décision.** **Pico CSS** (MIT), dans sa variante violette : du CSS seul, qui met en forme le HTML sémantique déjà
employé (`nav`, `table`, `details`, formulaires). Il est installé par npm et **servi par le serveur local**
(`/vendor/pico.css`), jamais chargé depuis un réseau, et sans chaîne de construction. La feuille propre à HOLARCH se
réduit à la mise en page et aux composants du tableau de bord (tuiles, barres, histogramme, arbre, journal), exprimés
avec les variables de Pico.

**Écartés.** Open Props : des jetons sans « look ». Web Awesome : des composants riches, à reconsidérer quand
l'interface deviendra une application (étape 5). DSFR : réservé aux sites de l'État. Carbon, Material, Primer : lourds,
pensés pour une chaîne de construction.

**Ce qui le ferait changer.** Une interface qui demande des composants que du CSS seul ne donne pas.
