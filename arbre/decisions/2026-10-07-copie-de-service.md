---
type: decision
title: Les services lancent une copie fixe du code, posée par commit
description: Idée I16. Les points d'entrée de HOLARCH (import horaire, interface, crochets, serveur MCP, garde avant commit) lancent une copie du socle tirée d'un commit, posée par une commande explicite après les tests verts, et non plus la copie de travail.
status: stable
approved: { by: human:auteur, at: 2026-10-07, ref: "échange du 2026-10-07 : « Approuvée telle quelle »" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md, /arbre/idees.md]
  modifies: [/arbre/rules.yaml]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-07-relancer-interface.md]
---

# Les services lancent une copie fixe du code, posée par commit

**Contexte (mesuré le 2026-10-07 sur le poste personnel).** Cinq points d'entrée lancent
`~/holarch-socle/bin/holarch.js`, la copie de travail : l'import horaire (minuteur `holarch-import`), l'interface en
service, les crochets de Claude Code (`contexte`), le serveur MCP, la garde avant commit des six dépôts qui la portent.
Trois écrivent au journal, en ajout seul : l'import, l'audit (après l'inventaire, ou lancé par l'interface) et
`garde` (`rule.enforced`). Le minuteur et le serveur MCP ont été posés à la main ; les trois autres par HOLARCH, d'après
`BIN` (`src/materialisation.js`), le chemin du code qui s'exécute. Cette semaine, des commits presque chaque heure de
13 h à 22 h : le minuteur tombe souvent sur du code en cours d'écriture, ce qui est arrivé le 2026-10-07, sans dommage.
Le code ne lit son propre dossier que pour ses fichiers (schémas, modèles, pages) ; l'arbre se lit par la
configuration, une copie fixe ne fige donc pas les règles. `npm test` : 5 s.

**Avis.** Trois voies :

| Voie | Pour | Contre |
|---|---|---|
| Une copie par commit, ses dépendances par `npm ci --omit=dev`, un lien `courant` qui bascule ; posée par une commande | verrou des dépendances respecté, commit tracé, bascule d'un coup, retour arrière par le lien ; deux appels d'outils existants (P2) | une commande de plus, à ne pas oublier |
| `npm pack` puis `npm install -g` du paquet | l'outil standard | le paquet n'emporte pas `package-lock.json` (dépendances résolues à nouveau), pas de commit tracé (0.1.0), pas de retour arrière simple ; depuis un dossier, `install -g` ne pose qu'un lien |
| Sauter l'import quand la copie de travail est sale | rien à poser | ne couvre pas `garde`, qui tourne justement quand un commit se prépare |

La première est retenue (choix de l'auteur, 2026-10-07). Précision de l'agent, à approuver avec la décision : la copie
est un export du commit (`git archive`) plutôt qu'un `git worktree` ; même résultat, sans dépôt git dans la copie (on ne
peut pas y committer par erreur) ni métadonnées de worktree à élaguer.

**Décision.**

| Point | Choix |
|---|---|
| Copie | `<accueil>/service/<commit court>/` : export du commit, puis `npm ci --omit=dev` ; lien `<accueil>/service/courant` vers elle |
| Commande | `holarch service` : commit en service, et son retard sur `HEAD` du socle. `holarch service poser [<commit>]` (défaut `HEAD`) : refuse si la copie de travail n'est pas propre ou si `npm test` est rouge ; exporte, installe, bascule le lien, réécrit les points d'entrée, relance l'interface. Reposer un commit déjà présent bascule seulement le lien : c'est le retour arrière |
| Rétention | la copie en service et la précédente ; les plus anciennes sont supprimées après la bascule |
| Points d'entrée | `BIN` désigne `courant/bin/holarch.js` quand le lien existe, sinon le code qui s'exécute (autre site, conteneur) : la garde, les crochets et l'interface le suivent par les commandes existantes. Le minuteur d'import devient une unité marquée écrite par HOLARCH (fabrique d'unité existante) ; l'entrée MCP `holarch` du compte est réécrite si elle existe |
| Contrôle | l'audit, qui lit déjà ce que `regles appliquer` écrirait, voit un point d'entrée resté sur la copie de travail ; la reprise dit le retard de la copie en service sur `HEAD` |
| Règle | `verifier-avant-de-rendre` devient : « Avant de rendre la main, `npm test` est vert ; quand l'interface change, le test visuel (`npm run test:visuel`) passe aussi ; puis la copie de service est posée là où elle tourne (`holarch service poser`), ce qui relance l'interface. » Pourquoi : « Un changement non vérifié casse la session suivante ; un service qui lance la copie de travail tourne sur du code inachevé, une copie non posée montre l'ancienne version. » Niveau inchangé (rappel) |

**Raison.** Un journal en ajout seul ne se corrige pas : ce qui l'écrit doit tourner sur du code commité et vérifié.

**Ce qui le ferait changer.** Des copies non posées malgré la règle (un crochet après envoi les poserait alors), ou un
besoin de tester un point d'entrée sur du code non commité qu'une invocation directe de la copie de travail ne suffit
pas à couvrir.

**Critère.** Avec la copie de travail cassée (erreur de syntaxe dans `src/`), l'import horaire, la garde d'un commit
dans un autre projet et l'interface tournent normalement ; la copie posée se lit dans `holarch service`.

**Conséquences.** Idée I16 prise ; `arbre/rules.yaml` modifié à l'approbation, puis `holarch regles appliquer`.
