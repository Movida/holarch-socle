---
type: decision
title: Une routine coupée à la main reste coupée quand la copie de service est posée
description: Défaut A6 de la passe globale. `holarch service poser` réactive les minuteurs et l'interface coupés à la main, et la décision recolte dit encore la routine hebdomadaire « proposée, pas posée » alors que l'auteur l'a acceptée le 2026-10-08. L'état d'activation de systemd fait foi ; la décision recolte est mise à jour.
status: stable
approved: { by: human:auteur, at: 2026-10-08, ref: "échange du 2026-10-08 : « On suit ta recommandation pour A6 »" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-07-recolte.md, /arbre/decisions/2026-10-07-copie-de-service.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Une routine coupée à la main reste coupée quand la copie de service est posée

**Contexte (2026-10-08, passe globale, défaut A6).**

- `holarch service poser` réécrit les unités marquées (interface, import horaire, récolte du lundi) et les active à
  chaque pose (`systemctl --user enable --now`). Une unité coupée par l'auteur (`disable --now`) est donc rallumée à
  la pose suivante, sans le dire. Pour la récolte, chaque passe appelle `claude -p` et coûte environ 0,25 $.
- Rien ne permet de retirer la récolte : `holarch interface desactiver` existe pour l'interface, il n'y a pas
  d'équivalent pour les minuteurs.
- La décision `recolte` (stable) dit, à la ligne Cadence : « une routine hebdomadaire est possible : proposée, pas
  posée ». L'auteur l'a acceptée le 2026-10-08 (journal, « Récolte hebdomadaire ») ; le minuteur `holarch-recolte` est
  posé depuis. Le texte approuvé ne dit plus ce qui tourne.
- Mesure sur le poste personnel le 2026-10-08 : interface, import, récolte et réveil sont tous activés ; aucune unité
  n'est coupée à la main. Le défaut ne s'est pas encore produit.

**Avis.** Deux façons de savoir qu'une routine est voulue :

| Voie | Pour | Contre |
|---|---|---|
| L'état d'activation de systemd fait foi : une unité marquée déjà présente et `disabled` est réécrite (texte à jour) mais ni activée ni démarrée ; la première pose l'active | aucun réglage de plus, le runtime tient l'état (P2) ; le geste de l'auteur est la commande systemd habituelle | un état qui vit hors de l'arbre : une réinstallation du poste rallume tout |
| Un réglage dans l'arbre (`service: { recolte: false }` au profil), lu par `service poser`, qui retire l'unité | visible et versionné, survit à une réinstallation | deux sources pour le même état (le réglage et systemd), qui peuvent se contredire (`coherence-globale`) |

La première est recommandée : elle corrige le défaut sans ajouter de notion, et une réinstallation est rare. La
seconde reste possible si une routine coupée revient sans qu'on le veuille.

**Décision.**

| Point | Choix |
|---|---|
| Pose | `holarch service poser` réécrit les unités marquées ; une unité déjà présente et coupée (`systemctl --user is-enabled` : `disabled`) reste coupée, et la pose le dit (« coupée à la main : laissée ») ; l'interface coupée n'est pas relancée |
| Couper une routine | `systemctl --user disable --now holarch-recolte.timer` (de même pour `holarch-import.timer`) ; `holarch service` montre l'état de chaque routine |
| Récolte, cadence (modifie `recolte`) | chaque lundi à 8 h, posée par `holarch service poser` (accord de l'auteur du 2026-10-08), environ 0,25 $ par passe ; elle reste lançable à la demande (`holarch recolte`) |

**Ce qui le ferait changer.** Une routine coupée qui revient après une réinstallation ou un changement de poste : passer
alors au réglage dans l'arbre.

**Conséquences.** `creerMinuteur` et `creerInterface` (`src/distant.js`) consultent
`is-enabled` avant d'activer, avec un test qui coupe une unité puis pose la copie ; `holarch service` affiche l'état
des routines. La ligne Cadence de la décision `recolte` se lit avec cette modification.
