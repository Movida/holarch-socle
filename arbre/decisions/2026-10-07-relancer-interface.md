---
type: decision
title: Relancer l'interface en service quand elle change
description: La règle verifier-avant-de-rendre s'étend à la relance de l'interface en service, une fois les tests verts, là où elle tourne.
status: draft
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/rules.yaml]
  constrained_by: [/arbre/fondations/principes.md]
---

# Relancer l'interface en service quand elle change

**Contexte (2026-10-07).** Après un changement de la carte d'un projet, tests et test visuel verts, l'interface en
service montrait encore l'ancienne version : l'auteur a dû demander sa relance. Le serveur charge les fichiers de
l'interface en mémoire à son démarrage (`src/web/serveur.js`) : même un changement de style demande une relance. Mesure
dans les transcriptions (331, depuis le 2026-08-01) : une seule demande de relance de l'interface, celle-ci ; le manque
est dans la règle plus que dans une habitude.

**Avis.** Deux voies :

| Voie | Pour | Contre |
|---|---|---|
| Étendre la règle `verifier-avant-de-rendre` : l'agent relance le service après les tests verts | au bon moment, sur du code vérifié ; `systemctl` le fait déjà (P2), rien à écrire | dépend de l'agent, comme le reste de la règle |
| Service lancé avec `node --watch` | aucune intervention | redémarre sur du code à moitié écrit (risque déjà noté, idée I16) ; une erreur de syntaxe en cours d'écriture arrête l'interface |

La première est retenue (accord de l'auteur sur la voie, 2026-10-07).

**Décision.** La règle `verifier-avant-de-rendre` devient : « Avant de rendre la main, `npm test` est vert ; quand
l'interface change, le test visuel (`npm run test:visuel`) passe aussi, puis l'interface en service est relancée là où
elle tourne (`systemctl --user restart holarch-interface.service`). » Pourquoi : « Un changement non vérifié casse la
session suivante ; une interface non relancée montre l'ancienne version. » Niveau inchangé (rappel). Là où l'unité
n'existe pas (conteneur, autre site), rien à faire.

**Ce qui le ferait changer.** Des relances oubliées malgré la règle (un crochet après commit les ferait alors), ou une
interface qui recharge ses fichiers sans redémarrer.

**Conséquences.** `arbre/rules.yaml` modifié à l'approbation, puis `holarch regles appliquer`.
