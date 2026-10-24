---
type: decision
title: L'identité de commit se pose toujours en réglage local d'un dépôt déclaré
description: Amende `identite-par-contexte` sur un point, l'application. `holarch regles appliquer` pose l'identité déclarée en réglage local même quand l'identité globale de la machine est déjà la bonne, pour qu'un conteneur qui partage le dépôt sans partager la configuration globale de l'hôte committe sous la même identité.
status: stable
approved: { by: human:auteur, at: 2026-10-24, ref: "choix cliquable du 2026-10-24 : « Toujours en local » (recommandation de l'agent, alternative « par le conteneur » écartée)" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-07-identite-par-contexte.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-07-identite-par-contexte.md]
---

# L'identité de commit se pose toujours en réglage local d'un dépôt déclaré

**Contexte (relevé le 2026-10-24 dans le conteneur du socle).** Le dossier du dépôt `holarch-socle` est celui du poste,
monté dans son conteneur de développement : `.git/config` est commun aux deux. Sur le poste, l'identité vient de la
configuration globale de git, qui est l'identité déclarée ; `holarch regles appliquer` ne pose donc rien en local
(« rien là où elle est déjà la bonne »). Le conteneur n'a pas cette configuration globale (elle ne survit pas à une
reconstruction) : git y refuse de committer, faute d'identité, et chaque commit d'une session du conteneur a dû la
fournir à la main.

**Avis.** Le réglage local est déjà le mécanisme choisi (P2, git sait choisir une identité par dépôt) ; il suffit de
ne plus dépendre de la configuration globale pour décider de le poser. Alternative écartée : des variables
`GIT_AUTHOR_*` et `GIT_COMMITTER_*` générées dans la configuration du conteneur, second mécanisme pour la même chose
(`coherence-globale`), identité figée à la génération du conteneur.

**Décision.** Le point « Application » de `identite-par-contexte` devient : `holarch regles appliquer` pose
`user.name` et `user.email` en réglage local dans tout dépôt déclaré dont le réglage local n'est pas l'identité
déclarée, que l'identité globale soit la bonne ou non. Le reste tient : un réglage local posé à la main n'est jamais
remplacé (laissé, signalé), HOLARCH ne retire que ce qu'il a posé, la garde et l'audit comparent toujours l'identité
effective.

**Raison.** Un dépôt porte son identité avec lui, quel que soit le lieu qui l'ouvre ; l'écart ne dépend plus d'un
fichier propre à une machine.

**Ce qui le ferait changer.** Un dépôt déclaré qu'un outil réécrit et dont `.git/config` ne doit pas changer.

**Conséquences.** `src/identite-git.js` compare la déclarée au réglage local et non plus à l'identité effective ; le
test de la tranche 8 reproduit le cas (identité globale bonne, aucun réglage local : posée). Au prochain
`holarch regles appliquer` sur le poste, l'identité se pose en local dans les dépôts déclarés qui n'en avaient pas.
