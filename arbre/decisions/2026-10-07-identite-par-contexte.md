---
type: decision
title: L'identité de commit est un réglage du contexte, gardé au commit
description: Le contexte (ou le profil, par défaut) déclare l'identité sous laquelle ses projets committent ; `holarch regles appliquer` la pose dans les dépôts qui en divergent, sans remplacer une valeur posée à la main ; le crochet `pre-commit` refuse un commit sous une autre identité ; l'audit signale l'écart.
status: draft
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md, /arbre/decisions/2026-10-07-controles-de-regles.md, /arbre/conception/contrats/config.md]
---

# L'identité de commit est un réglage du contexte, gardé au commit

**Contexte (relevé le 2026-10-07 sur le poste personnel).** L'identité globale de git est l'adresse anonyme de GitHub
(`…@users.noreply.github.com`). Trois dépôts la remplacent à la main par l'adresse personnelle (réglage local) : un
dépôt privé déclaré au contexte perso, un dépôt privé non déclaré (commits aussi sous des adresses professionnelles)
et un dépôt public non déclaré. L'historique de deux dépôts publics porte déjà l'adresse personnelle : `holarch-socle`
(8 commits sur 81) et ce dépôt public non déclaré (tous ses commits). Rien ne dit
aujourd'hui quelle identité vaut pour quel projet, ni ne l'empêche de dériver.

**Avis.** git sait déjà choisir une identité par dépôt (réglage local) ou par dossier (`includeIf` dans
`~/.gitconfig`) : HOLARCH ne refait pas ce mécanisme (P2), il dit quelle valeur vaut où et la garde. Le réglage par
dossier dépend du chemin, qui ne dit rien du contexte (tous les dépôts sont sous `~`) ; le réglage local suit le dépôt.
Une identité fausse ne se voit qu'une fois le commit poussé, et se corrige alors par une réécriture de l'historique :
le contrôle utile est avant le commit, et le crochet `pre-commit` de HOLARCH existe déjà (décision
`controles-de-regles`).

**Décision.**

| Point | Choix |
|---|---|
| Déclaration | clé `identite: { nom, email }` dans la configuration d'un nœud ; le profil donne la valeur par défaut, un contexte ou un projet la précise (fusion du registre de configuration) |
| Application | `holarch regles appliquer` pose `user.name` et `user.email` en réglage local dans un dépôt déclaré dont l'identité effective diffère ; rien là où elle est déjà la bonne ; un réglage local posé à la main n'est jamais remplacé (laissé, signalé), comme pour les réglages de Claude Code ; HOLARCH ne retire que ce qu'il a posé |
| Garde | règle de profil `identite-de-commit`, **bloquante** : `holarch garde avant-commit` refuse un commit dont l'auteur (`git var GIT_AUTHOR_IDENT`) n'est pas l'identité déclarée ; forçable comme les autres gardes, l'écart reste alors au journal |
| Audit | la même comparaison sur la configuration du dépôt, après chaque inventaire ; écart au journal (`rule.violated`, `rule.resolved`) |
| Historique | hors de cette décision : les commits passés ne se réécrivent pas ici (réécrire un historique publié est un geste de l'auteur, à décider à part) |

**Raison.** Une seule déclaration par contexte, appliquée par le mécanisme de git ; la garde au commit empêche l'écart
au lieu de le constater après publication.

**Ce qui le ferait changer.** Un contexte dont les dépôts se rangent sous un même dossier (l'`includeIf` de git
suffirait alors) ; un besoin de signer les commits (la clé de signature rejoindrait l'identité).

**Conséquences.** Clé `identite` au registre de configuration ; règle `identite-de-commit` au profil ; tranche 8 de
l'étape 3. Contexte professionnel : [À COMPLÉTER : identité de commit des projets professionnels, et s'ils relèvent de
ce poste] (Q18).
