---
type: decision
title: Un geste à la main sur ce que HOLARCH pose est laissé et dit, jusqu'à ce que l'arbre change
description: "Lot 5 des Gardes muettes (revue des limites). L'arbre dit ce qui est voulu ; un réglage que HOLARCH a posé puis qu'on a retiré ou changé à la main n'est jamais remis en silence ; l'écart reste ouvert avec deux gestes (reposer, ou l'écrire dans l'arbre) ; le geste ne vaut que pour la valeur à laquelle il répondait. Exception : ce qu'exige une règle bloquante (identité de commit) est reposé, et dit. Modifie copie-de-service (entrée MCP), identite-par-contexte (identité retirée à la main) et passation-sereine (réglage ou crochet retiré à la main)."
status: stable
approved: { by: human:auteur, at: 2026-10-13, ref: "choix cliquable du 2026-10-13 : « Approuver telle quelle »" }
links:
  derives_from: [/arbre/conception/revue-limites.md, /arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-07-copie-de-service.md, /arbre/decisions/2026-10-07-identite-par-contexte.md, /arbre/decisions/2026-10-07-passation-sereine.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-08-routines-posees.md, /arbre/decisions/2026-10-11-garde-sans-passage-muet.md]
---

# Un geste à la main sur ce que HOLARCH pose est laissé et dit, jusqu'à ce que l'arbre change

**Contexte (2026-10-13, famille Gardes muettes de la revue des limites).** Le lot 3 a codé trois remèdes de la revue
approuvés par l'auteur ; ils contredisent ou dépassent le texte de trois décisions approuvées :

- M2 (`c9c3f95`) : une clé ou un crochet de `settings.json` posé par HOLARCH puis retiré à la main est laissé, et dit,
  tant qu'il est voulu. `passation-sereine` (ligne Où) ne dit que « ne retire que ce qu'il a posé, ne remplace jamais
  une valeur posée à la main ». Deux trous vus par le lot 4 : la clé reste figée sur l'ancienne valeur (une autre valeur
  au profil n'est pas reposée) ; un crochet dont HOLARCH change la commande (node mis à jour, autre seuil) est reposé,
  voire doublé à côté de celui que l'auteur a changé. Aucun geste n'est proposé.
- M3 (`7ecadb2`) : `service poser` laisse une entrée MCP `holarch` qui lance autre chose qu'une copie de service ou le
  socle. `copie-de-service` (ligne Points d'entrée) dit « l'entrée MCP `holarch` du compte est réécrite si elle existe ».
- M5 (`d0540bc`) : une identité de commit posée par HOLARCH puis retirée à la main n'est plus reposée.
  `identite-par-contexte` (ligne Application) la pose « dans un dépôt déclaré dont l'identité effective diffère ». La
  garde d'identité est bloquante et non dérogeable (`garde-sans-passage-muet`) : sans réglage local, git prend
  l'identité du compte, et chaque commit est refusé ; une identité changée au contexte n'est plus reposée non plus.
  Vu au lot 4 : quand l'identité n'est plus voulue, la note `holarch.identite` reste, orpheline, si le réglage local
  n'est plus celui que HOLARCH a posé.

Mesure sur le poste personnel le 2026-10-13 : 0 clé et 8 crochets au manifeste du compte, tous présents dans
`settings.json` ; l'entrée MCP `holarch` lance la copie de service ; 0 note `holarch.identite` sur les 10 dépôts du
poste (un seul réglage local d'identité, posé à la main, égal à l'identité du compte). Aucun des trois défauts ne s'est
produit.

**Avis.** La conception prévue suit une direction commune, déjà celle de `routines-posees` : l'arbre dit ce qui est
voulu, le runtime garde la trace du geste, et le geste ne survit pas à un changement de l'arbre.

| Voie | Pour | Contre |
|---|---|---|
| Direction commune : un geste à la main est laissé et dit ; l'écart reste ouvert avec deux gestes (reposer, ou l'écrire dans l'arbre) ; il ne vaut que pour la valeur à laquelle il répondait ; ce qu'exige une règle bloquante est reposé, et dit | un seul principe pour les trois cas ; rien n'est défait en silence ; une valeur changée dans l'arbre s'applique | une option de plus (`--reposer`) ; un crochet changé à la main peut être doublé après un changement du profil (dit) |
| Écrire le code tel qu'il est | rien à coder | un retrait vaut pour toujours, même quand l'arbre change ; M5 laisse des commits refusés |
| Revenir sur `c9c3f95`, `7ecadb2` et `d0540bc` | les décisions restent telles quelles | les trois limites reviennent : des gestes défaits en silence |

La première est retenue (choix de l'auteur, 2026-10-13 : « Suivre les trois recommandations » ; M2 « comparer par
rôle » ; M5 « retirer la note »).

**Décision.**

| Point | Choix |
|---|---|
| Principe | L'arbre (profil, contexte, projet) dit ce qui est voulu. Un réglage que HOLARCH a posé, puis retiré ou changé à la main, n'est ni remis ni remplacé en silence : la commande qui pose et l'audit disent l'écart, qui reste ouvert, avec deux gestes : le reposer, ou l'écrire dans l'arbre. Le geste ne vaut que pour la valeur à laquelle il répondait : une autre valeur dans l'arbre est posée ; un changement de HOLARCH seul (chemin de node ou de la copie de service, forme d'une commande) ne l'est pas |
| Exception : règle bloquante | Ce qu'exige une règle bloquante est reposé, et dit : laissé, le retrait ferait refuser chaque commit sans rien obtenir ; la voie pour s'en écarter est l'arbre (déclaration au projet, dérogation). C'est déjà le cas des lectures refusées (`appliquerPermissions`) |
| Réglages et crochets de Claude Code (modifie `passation-sereine`, ligne Où) | Une clé retirée à la main est laissée tant que le profil veut la valeur que HOLARCH avait posée ; une autre valeur au profil est posée. Un crochet retiré ou changé à la main est laissé tant que le profil veut le même rôle avec la même valeur (alerte au même seuil, reprise, veille du même événement) : la comparaison se fait par rôle, pas par commande. Gestes dits par `regles appliquer` et par l'audit : `holarch regles appliquer --reposer <clé ou rôle>`, ou retirer la valeur du profil (`claude_code.reglages`, `claude_code.passation`, règle de veille). Un crochet changé à la main, puis un changement du profil : le crochet de HOLARCH est posé à côté, et dit (reconnaître la version changée pour la remplacer serait deviner) |
| Identité de commit (modifie `identite-par-contexte`, ligne Application) | Règle bloquante : posée par HOLARCH puis retirée à la main, l'identité est reposée, et dite (« retirée à la main : reposée ; pour une autre identité ici, déclarer `identite` au projet »). Un réglage local posé à la main reste laissé et dit, comme avant. Quand l'identité n'est plus voulue, la note `holarch.identite` est retirée, même si le réglage local n'est plus celui que HOLARCH avait posé |
| Serveur MCP (modifie `copie-de-service`, ligne Points d'entrée) | L'entrée MCP `holarch` d'un compte n'est repointée que si elle lance une copie de service ou le socle (la copie de travail qui pose, ou la source) ; réglée ailleurs, une autre copie de HOLARCH installée exprès, elle est laissée et dite. Aucune clé de l'arbre ne porte ce chemin : `holarch service` montre l'entrée MCP de chaque compte, avec le geste qui la repointe |

**Raison.** Un geste défait en silence se refait sans fin, et un geste qui vaut pour toujours fige une valeur que
l'arbre a changée ; le borner à sa valeur garde les deux.

**Ce qui le ferait changer.** Un geste à la main qui revient après un changement de l'arbre sans qu'on le veuille :
l'écrire alors dans l'arbre (une dérogation au projet ou au contexte). Un chemin du serveur MCP porté par l'arbre (une
clé du site) : il se reposerait comme les autres réglages.

**Conséquences.** `src/regles-claude-code.js` (comparaison par valeur et par rôle, option `reposer`), `bin/holarch.js`
(option `--reposer`), `bin/affichage.js` et `src/audit.js` (gestes dits), `src/identite-git.js` et `src/creation.js`
(identité reposée, note retirée), `src/service.js` (entrée MCP montrée) ; un test par point, rouge sur son parent. Les
trois décisions modifiées se lisent avec celle-ci.
