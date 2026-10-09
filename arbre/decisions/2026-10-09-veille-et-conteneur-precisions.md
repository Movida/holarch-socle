---
type: decision
title: "Veille retardée et conteneur, après les contre-épreuves : texte aligné sur le code, risques et limites écrits"
description: Amendement de la décision environnement-d-execution (livraison B) et du contrat événement 0.10.0. La ligne B dit ce que couvre B, la borne d'immobilité de 30 min entre dans la décision et la règle, le gardien suit la seule règle, le risque résiduel du dépôt monté en écriture est accepté ou levé jusqu'à D, les limites connues sont écrites.
status: draft
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
borne (contre-épreuve de B) : 301 tours de 67 sessions distantes, aucun silence de plus de 11 min pendant un tour ; sur 56
transcriptions distantes de 30 jours, 38 changent plus de 30 s après leur dernière entrée datée (entrées sans date
écrites après la fin d'un tour), d'où une activité lue aux entrées datées.

**Proposition.**

| Point | Texte proposé |
|---|---|
| Ligne B de `environnement-d-execution` | « point « Veille » ; B couvre les sessions de l'hôte ; le signe de vie d'une session en conteneur se conçoit avec D » |
| Borne d'immobilité (décision, point « Veille ») | ajouter : « Une session dont rien de daté ne s'écrit depuis 30 min, ni dans sa transcription ni dans celles de ses sous-agents, est tenue pour en attente depuis sa dernière écriture : une demande de permission, une élicitation ou une fin de tour manquée ne tiennent pas le poste éveillé sans fin. Un sous-agent de fond retient le poste tant qu'il écrit ; un shell de fond, non. » |
| Règle `veille-retardee` (profil) | « Le poste ne se met pas en veille d'inactivité tant qu'une session distante travaille, ou attend une réponse de l'auteur depuis moins de 30 min ; une session immobile depuis 30 min attend ; une veille demandée à la main reste possible, et Windows reprend la main si l'adaptateur s'arrête. » |
| Gardien (choix de l'auteur, 2026-10-09) | à consigner : le gardien suit la seule règle, comme les crochets ; posé et retiré par `holarch regles appliquer` et la pose de la copie de service, plus par l'accès distant (une session reliée par `/remote-control` est retenue sans accès distant) |
| Risque résiduel jusqu'à D | tant que l'accès distant tourne sur l'hôte (dérogation de `partage-et-bac-a-sable`), un conteneur qui monte son dépôt en écriture peut y écrire ce que l'hôte exécute : `.claude/settings*.json` (crochets lancés par une session de l'hôte dans ce dépôt), `.git/hooks` et `.git/config` (lancés par git sur l'hôte), `initializeCommand` (lancé sur l'hôte au démarrage du conteneur). Le contrôle `montage-sensible` le dit (écart `acces-distant`). D le ferme. Choix de l'auteur ci-dessous |
| Contrat événement 0.10.0 | `power.*` (`held`, `released`, `failed`) tel qu'écrit ; `data.environnement` (`conteneur`) sur les événements d'une session tenue dans un conteneur, distinct de `origine` d'un refus d'outil |

**Limites connues, écrites avec B et `conteneur-isole`.**

- Une session en conteneur n'a pas les crochets du compte : elle n'est pas notée, rien ne la retient avant D.
- Une question à l'auteur posée pendant qu'un sous-agent de fond écrit compte comme un travail, jusqu'à 30 min après la
  dernière écriture du sous-agent.
- Une transcription sans entrée datée dans ses derniers 64 Kio se date par sa modification (le défaut ci-dessus revient).
- L'erreur d'un crochet s'efface à la note réussie suivante : une panne passagère entre deux audits horaires peut ne
  pas se voir.
- Le gardien tourne partout où la règle s'applique, même sur un site sans mécanisme : il le dit une fois au journal
  (`power.failed`, `sans-mecanisme`).
- Un projet du poste sans dépôt git : son correctif de conteneur n'est ni versionné ni audité.
- Un compte sans profil, ou à plusieurs profils : le gardien est laissé tel quel, et `holarch regles appliquer`
  refuse d'écrire le compte (choix 2 ci-dessous).

**Choix de l'auteur (2026-10-09, choix cliquables).**

1. Le risque résiduel jusqu'à D : levé par une exception du socle jusqu'à D (l'écart `acces-distant` ne se dit plus,
   le risque reste le même ; la recommandation de l'agent était de le garder visible).
2. Compte sans profil unique : `holarch regles appliquer` refuse d'écrire le compte, comme pour des règles
   illisibles ; ce qui est posé reste jusqu'à la correction.
3. Reste à faire : l'approbation du tout, une fois corrigés les mineurs de la contre-épreuve, puis l'écriture des trois
   textes (décision, règle du profil, contrat).

**Ce qui le ferait changer.** Un silence de plus de 30 min mesuré pendant un tour (la borne retiendrait trop peu) ; une
session en conteneur qui travaille sous l'accès distant avant D.

**Conséquences.** À l'approbation : la ligne B et le point « Veille » réécrits dans `environnement-d-execution`, la règle
`veille-retardee` réécrite dans le profil (approbation consignée), le contrat événement approuvé en 0.10.0.
