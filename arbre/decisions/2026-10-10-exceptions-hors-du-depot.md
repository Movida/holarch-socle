---
type: decision
title: "Exceptions de montage-sensible : lues hors du dépôt contrôlé, dites, et limites de B complétées"
description: Amendement de veille-et-conteneur-precisions après la contre-épreuve de ses corrections. Une exception de montage-sensible ne se lit plus dans l'arbre du dépôt que le conteneur écrit, mais au profil et au contexte ; conteneur-isole devient non dérogeable ; l'exception du socle passe au contexte personnel jusqu'à D ; une exception utilisée se dit, une exception périmée se signale. Trois limites de B sont complétées.
status: draft
links:
  derives_from: [/arbre/decisions/2026-10-09-veille-et-conteneur-precisions.md, /arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-09-veille-et-conteneur-precisions.md, /arbre/decisions/2026-10-09-environnement-d-execution.md, /arbre/conception/contrats/config.md, /arbre/index.md, "profil:/arbre/rules.yaml", "profil:/arbre/contextes/perso.md"]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-09-partage-et-bac-a-sable.md]
---

# Exceptions de montage-sensible, hors du dépôt contrôlé

**Contexte (2026-10-10).** La contre-épreuve des corrections de B (constat 6) : `montage_sensible.exceptions` se lit
dans la configuration effective du projet, donc aussi dans la racine de son arbre et dans ses types, des fichiers du
dépôt que le conteneur monte en écriture. Une session du conteneur peut y écrire l'exception qui fait taire l'écart, et
le contrôle ne dit rien : ni qu'une exception a servi, ni qu'elle ne correspond plus à aucun écart. La lecture des
`exceptions` est recopiée (`src/controles.js`, données personnelles et montage sensible) au lieu d'être commune. Choix
de l'auteur (2026-10-10) : fermer la voie plutôt que la montrer (avis de l'agent suivi).

**Proposition.**

| Point | Texte proposé |
|---|---|
| Lecture des exceptions | `montage_sensible` se lit au profil et au contexte seulement, jamais au type ni au projet ; et jamais dans le dépôt contrôlé (le dépôt du profil, s'il est contrôlé, ne s'excepte pas lui-même) |
| Exception dite | une exception qui a fait taire un écart se dit dans le résultat du contrôle (clé et raison) ; une exception qui ne correspond à aucun écart se signale (périmée) |
| Une seule lecture | les `exceptions` (`montage_sensible`, `donnees_personnelles`) se lisent par une fonction commune |
| Règle `conteneur-isole` (profil) | `derogable: false` : un projet ne la retire pas par une dérogation |
| Exception du socle jusqu'à D | déplacée de la racine de l'arbre du socle au contexte personnel du profil, même clé (`acces-distant:holarch-socle`) et même raison ; D la retire |
| Contrat de configuration | `montage_sensible` : portée « profil, contexte », lue hors du dépôt contrôlé ; version 0.5.0, la livraison C passe à la 0.6.0 (choix ci-dessous) |
| Limite de B, systemd (amende `veille-et-conteneur-precisions`) | « Sans systemd utilisateur, il n'est pas posé, et `holarch veille` le dit impossible ; un systemd utilisateur injoignable (sans `XDG_RUNTIME_DIR` ni bus) n'est pas une absence : la pose rend une erreur, `holarch veille` dit le gardien illisible, le contrôle se dit non disponible. » |
| Limite de B, relance (nouvelle) | « À chaque pose de la copie de service ou des règles, le gardien relancé relâche la demande d'éveil environ 0,68 s (mesure de la contre-épreuve) : `power.released` (`arret`) puis `power.held` au journal ; pendant le trou, `holarch veille` et le contrôle disent le gardien en relance. » |
| Limite de B, profil unique (amende la limite et le choix 2) | « `holarch regles appliquer` refuse d'écrire le compte, et les projets qu'on lui nomme (leur règle hérite du profil). » |

**Choix de l'auteur à faire.**

1. Version du contrat de configuration. Recommandation de l'agent : 0.5.0 pour ce changement, C passe à la 0.6.0 (la
   portée se réduit : c'est une rupture, elle prend sa version ; quatre mentions de C à réaligner). Autre voie : amender
   la 0.4.0 en place (contrat encore en brouillon, un seul lecteur, le contrôle changé dans la même livraison), C garde
   la 0.5.0 ; plus court, mais une version publiée change de sens.

**Ce qui le ferait changer.** Un besoin d'exception propre à un projet que ni le profil ni un contexte ne peuvent
porter ; un dépôt du profil monté par un conteneur.

**Conséquences.** À l'approbation : le code du contrôle (lecture par couche, fonction commune, exceptions dites et
périmées), la règle `conteneur-isole` réécrite au profil (approbation consignée), l'exception déplacée du socle au
contexte personnel, le contrat de configuration dans la version choisie, les trois limites écrites dans
`veille-et-conteneur-precisions` avec le renvoi à cette décision. Chaque changement de code avec son test, puis une
contre-épreuve.
