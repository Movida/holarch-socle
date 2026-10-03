---
type: decision
title: Une classification ne peut que se durcir en descendant
description: Un nœud ne déclare jamais un niveau de classification plus ouvert que celui qu'il hérite ; résout Q1.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « ok pour tes recommandations »" }
links:
  derives_from: [/arbre/decisions/2026-10-03-fondation.md]
  modifies: [/arbre/conception/contrats/noeud.md]
---

# Une classification ne peut que se durcir en descendant

**Question (Q1).** L'héritage laisse le plus spécifique l'emporter : un nœud `public` placé sous un nœud
`confidential` relâcherait-il la classification de sa branche ?

**Décision.** Non. La classification effective d'un nœud est le niveau le plus strict entre celui qu'il hérite et
celui qu'il déclare. Un contenu plus ouvert que sa branche change de place dans l'arbre.

**Raison.** L'erreur dans ce sens est une fuite silencieuse, irréversible pour un dépôt public ; l'erreur inverse
n'est qu'une gêne, visible et corrigeable. Assouplir plus tard reste possible, par une décision explicite.
