---
type: decision
title: La part partageable d'un projet ne contient rien de personnel, et une session distante est une exécution
description: Tranche 12 de l'étape 3, partie principes. P7 couvre la part partageable d'un projet, pas seulement le socle ; §5.4 dit qu'une session distante tourne dans le bac à sable de son projet. La mise en œuvre est la décision `environnement-d-execution`.
status: draft
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/fondations/principes.md, /docs/architecture.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# La part partageable d'un projet ne contient rien de personnel, et une session distante est une exécution

**Contexte (mesuré le 2026-10-09 sur le poste personnel).**

- **L'accès distant tourne sur l'hôte**, en mode `auto` : une session ouverte depuis le téléphone voit la clé SSH
  personnelle, `gh` connecté avec tous ses droits et tous les dépôts. L'architecture demande l'inverse (§5.4 : bac à
  sable par exécution, aucun secret en clair ; §9 : droits minimaux), mais ne dit pas qu'une session distante est une
  exécution.
- **Le modèle de conteneur du socle** (`modeles/projet/devcontainer.json`) monte `${localEnv:HOME}/.claude` en entier :
  identifiants et conversations de tous les projets visibles de chaque conteneur ; un collègue qui ouvre le projet monte
  le sien. P7 ne couvre que le socle, pas la part partageable d'un projet.
- **Objectifs de l'auteur pour l'environnement** : isolement, outils propres au projet, partage facile avec des
  collègues, modularité, carte graphique ; le tout imbriqué dans le socle.

**Avis.** Deux voies :

| Voie | Pour | Contre |
|---|---|---|
| Étendre P7 au projet et écrire dans §5.4 qu'une session distante est une exécution | le partage et l'isolement deviennent des contraintes que l'audit peut tenir ; la mise en œuvre en découle | un projet sans conteneur perd l'accès distant, sauf dérogation écrite |
| Garder les textes et traiter le cas dans la mise en œuvre seule | rien à changer aux principes | l'accès sur l'hôte reste conforme à la lettre ; un autre site referait le même choix sans garde-fou |

La première voie est recommandée.

**Décision.**

| Point | Texte |
|---|---|
| P7 | « **Partageable.** Le socle et la part partageable d'un projet ne contiennent rien de personnel ; le personnel vit dans un profil privé ou dans la configuration du site. » (accord de l'auteur sur le principe, 2026-10-09) |
| §5.4 | ajout à « Bac à sable par exécution » : « Une session distante est une exécution : elle tourne dans le bac à sable de son projet, jamais sur l'hôte, sauf dérogation écrite. » (accord de l'auteur sur le principe, 2026-10-09) |

**Raison.** L'isolement demandé par §5.4 et §9 n'existe que si la session tourne là où sont ses droits ; un projet
partagé avec un collègue ne doit pas emporter ce qui appartient à l'auteur.

**Ce qui le ferait changer.** Un essai qui montre que Remote Control ne peut pas tourner durablement dans un conteneur
(Q24) : la dérogation écrite deviendrait la règle, et §5.4 serait à revoir.

**Conséquences.** P7 et §5.4 réécrits à l'approbation ; jusqu'à la livraison D de la décision
`environnement-d-execution`, l'accès distant sur l'hôte vaut dérogation écrite (celle-ci), à retirer quand D tient.
