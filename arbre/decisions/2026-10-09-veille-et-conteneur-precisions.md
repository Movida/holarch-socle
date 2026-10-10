---
type: decision
title: "Veille retardée et conteneur, après les contre-épreuves : texte aligné sur le code, risques et limites écrits"
description: Amendement de la décision environnement-d-execution (livraison B) et du contrat événement 0.10.0. La ligne B dit ce que couvre B, la borne d'immobilité de 30 min entre dans la décision et la règle, le gardien suit la seule règle, le risque résiduel du dépôt monté en écriture est accepté ou levé jusqu'à D, les limites connues sont écrites.
status: stable
approved: { by: human:auteur, at: 2026-10-09, ref: "échange du 2026-10-09 au soir, récapitulatif et recommandation, choix cliquables" }
links:
  derives_from: [/arbre/decisions/2026-10-09-environnement-d-execution.md, /arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-09-environnement-d-execution.md, /arbre/conception/contrats/evenement.md, /arbre/conception/contrats/config.md, "profil:/arbre/rules.yaml"]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-09-partage-et-bac-a-sable.md]
---

# Veille retardée et conteneur, après les contre-épreuves

**Contexte (2026-10-09).** Deux contre-épreuves (livraison B, puis la faille du conteneur et les corrections de B) ont
changé le code sans que les textes approuvés suivent. Dans `environnement-d-execution`, la ligne B (« l'état des
sessions se lit de l'hôte, même quand elles tourneront en conteneur ») contredit la précision du 2026-10-09 (B couvre
les sessions de l'hôte). Ni la décision ni la règle `veille-retardee` ne disent la borne d'immobilité de 30 min, alors
qu'elle décide quand le poste peut dormir. Le contrat événement porte la version 0.10.0 (`power.*`, et
`data.environnement` depuis la contre-épreuve du conteneur) sous l'approbation du 2026-10-03. Mesures qui fondent la
borne : hors attente de permission, aucun silence de plus de 11 min pendant un tour (contre-épreuve de B, 301 tours de
67 sessions distantes) ; le 2026-10-09, sur 53 sessions distantes de 30 jours, 4 silences de plus de 11 min pendant un
tour, jusqu'à 114 min, tous après un appel court (`Edit`, `git add`, un lint) : des attentes de permission, que
`PermissionRequest` note comme telles. Sur ces 53 transcriptions, 36 changent plus de 30 s après leur dernière entrée
datée, jusqu'à 6 jours plus tard (entrées sans date écrites après la fin d'un tour), d'où une activité lue aux entrées
datées.

**Proposition.**

| Point | Texte proposé |
|---|---|
| Ligne B de `environnement-d-execution` | « point « Veille » ; B couvre les sessions de l'hôte ; le signe de vie d'une session en conteneur se conçoit avec D » |
| Borne d'immobilité (décision, point « Veille ») | ajouter : « Une session dont rien de daté ne s'écrit depuis 30 min, ni dans sa transcription ni dans celles de ses sous-agents, est tenue pour en attente depuis sa dernière écriture : une demande de permission, une élicitation ou une fin de tour manquée ne tiennent pas le poste éveillé sans fin. Un sous-agent de fond retient le poste tant qu'il écrit ; un shell de fond, non. » |
| Règle `veille-retardee` (profil) | « Le poste ne se met pas en veille d'inactivité tant qu'une session distante travaille, ou attend une réponse de l'auteur depuis moins de 30 min ; une session immobile depuis 30 min est en attente depuis sa dernière écriture ; une veille demandée à la main reste possible, et Windows reprend la main si l'adaptateur s'arrête. » |
| Gardien (choix de l'auteur, 2026-10-09) | à consigner : le gardien suit la seule règle, comme les crochets ; posé et retiré par `holarch regles appliquer` et la pose de la copie de service, plus par l'accès distant (une session reliée par `/remote-control` est retenue sans accès distant) ; sans systemd utilisateur (WSL sans systemd, conteneur), il n'est pas posé, sans erreur |
| Risque résiduel jusqu'à D | tant que l'accès distant tourne sur l'hôte (dérogation de `partage-et-bac-a-sable`), un conteneur qui monte son dépôt en écriture peut y écrire ce que l'hôte exécute : `.claude/settings*.json` (crochets lancés par une session de l'hôte dans ce dépôt), `.git/hooks` et `.git/config` (lancés par git sur l'hôte), `initializeCommand` (lancé sur l'hôte au démarrage du conteneur). Le contrôle `montage-sensible` le dit (écart `acces-distant`), sauf exception portée par l'arbre du projet (`montage_sensible.exceptions`, contrat de configuration 0.4.0 ; depuis la 0.5.0, par le profil ou un contexte seulement, décision `exceptions-hors-du-depot`). D le ferme. Choix de l'auteur ci-dessous |
| Contrat événement 0.10.0 | `power.*` (`held`, `released`, `failed`) tel qu'écrit ; `data.environnement` (`conteneur`) sur les événements d'une session tenue dans un conteneur, distinct de `origine` d'un refus d'outil |
| Contrat de configuration 0.4.0 | `montage_sensible.exceptions` : `{ecart, pourquoi}`, la clé exacte d'un écart du contrôle et sa raison ; le risque reste, l'écart ne se dit plus |

**Limites connues, écrites avec B et `conteneur-isole`.**

- Une session en conteneur n'a pas les crochets du compte : elle n'est pas notée, rien ne la retient avant D.
- Une question à l'auteur posée pendant qu'un sous-agent de fond écrit compte comme un travail, jusqu'à 30 min après la
  dernière écriture du sous-agent.
- Une transcription sans entrée datée dans ses derniers 64 Kio se date par sa modification (le défaut ci-dessus revient).
- L'erreur d'un crochet s'efface à la note réussie suivante, de quelque session qu'elle vienne (une note non faite la
  garde) : une panne passagère entre deux audits horaires peut ne pas se voir.
- Le gardien tourne partout où la règle s'applique et où un systemd utilisateur répond, même sur un site sans
  mécanisme : il le dit une fois au journal (`power.failed`, `sans-mecanisme`). Sans systemd utilisateur, il n'est pas
  posé, et `holarch veille` le dit impossible ; un systemd utilisateur injoignable (sans `XDG_RUNTIME_DIR` ni bus) n'est
  pas une absence : la pose rend une erreur, `holarch veille` dit le gardien illisible, le contrôle se dit non
  disponible (décision `exceptions-hors-du-depot`).
- À chaque pose de la copie de service ou des règles, le gardien relancé relâche la demande d'éveil environ 0,68 s
  (mesure de la contre-épreuve) : `power.released` (`arret`) puis `power.held` au journal ; pendant le trou,
  `holarch veille` et le contrôle disent le gardien en relance (décision `exceptions-hors-du-depot`).
- Un projet du poste sans dépôt git : son correctif de conteneur n'est ni versionné ni audité.
- Un compte sans profil, ou à plusieurs profils : le gardien est laissé tel quel, et `holarch regles appliquer`
  refuse d'écrire le compte, et les projets qu'on lui nomme (leur règle hérite du profil ; choix 2 ci-dessous, précisé
  par la décision `exceptions-hors-du-depot`).

**Choix de l'auteur (2026-10-09, choix cliquables).**

1. Le risque résiduel jusqu'à D : levé par une exception du socle jusqu'à D (l'écart `acces-distant` ne se dit plus,
   le risque reste le même ; la recommandation de l'agent était de le garder visible). Portée par la racine de l'arbre
   du socle (`montage_sensible.exceptions`) ; D la retire. Déplacée au contexte personnel du profil le 2026-10-10,
   même clé et même raison (décision `exceptions-hors-du-depot`).
2. Compte sans profil unique : `holarch regles appliquer` refuse d'écrire le compte, comme pour des règles
   illisibles ; ce qui est posé reste jusqu'à la correction. Il refuse aussi les projets qu'on lui nomme, dont la règle
   hérite du profil (décision `exceptions-hors-du-depot`).
3. Reste à faire : l'approbation du tout, une fois corrigés les mineurs de la contre-épreuve (faits le 2026-10-09), puis
   l'écriture des textes (décision, règle du profil, contrats événement et configuration).

**Ce qui le ferait changer.** Un silence de plus de 30 min mesuré pendant un tour (la borne retiendrait trop peu) ; une
session en conteneur qui travaille sous l'accès distant avant D.

**Conséquences.** À l'approbation : la ligne B et le point « Veille » réécrits dans `environnement-d-execution`, la règle
`veille-retardee` réécrite dans le profil (approbation consignée), le contrat événement approuvé en 0.10.0, le contrat de
configuration en 0.4.0.

**Amendée le 2026-10-10** par [`exceptions-hors-du-depot`](/arbre/decisions/2026-10-10-exceptions-hors-du-depot.md)
(approuvée) : exception du socle lue au profil et au contexte, hors du dépôt contrôlé, et déplacée au contexte
personnel ; limites du systemd injoignable, de la relance du gardien et du profil unique.
