---
type: decision
title: Les sources de l'hôte, lues par des interfaces standard, en lecture seule
description: Comment l'inventaire voit Docker et Claude Desktop, qu'il tourne sur la machine ou dans un conteneur ; ajoute les kinds container et volume au catalogue.
status: draft
links:
  derives_from: [/arbre/conception/etape-1-voir.md]
  modifies: [/arbre/conception/contrats/fiche-catalogue.md]
---

# Les sources de l'hôte, en lecture seule

**Contexte.** L'étape 1 inventorie aussi ce qui vit sur l'hôte : les conteneurs et volumes Docker, et les serveurs
MCP déclarés dans Claude Desktop. HOLARCH peut tourner directement sur la machine ou dans un conteneur de
développement, qui ne voit alors ni Docker ni la configuration de Claude Desktop. Le socle se diffuse : la solution
doit marcher chez n'importe qui, sans rien de propre à une machine.

**Décision.**

| Point | Choix |
|---|---|
| Interfaces | chaque adaptateur lit une interface standard, à un emplacement configurable : l'**API Docker Engine** (GET seulement), le **fichier de configuration de Claude Desktop** |
| Installation directe | rien à régler : `DOCKER_HOST` ou le socket local ; l'emplacement documenté de Claude Desktop (macOS, Windows) |
| Installation en conteneur | l'accès se déclare dans le conteneur, en lecture seule : Docker par un **proxy filtrant** (outil existant, conteneurs et volumes en lecture, aucune écriture) désigné par `inventaire.docker.hote` ; Claude Desktop par un montage en lecture seule désigné par `inventaire.claude-desktop.config` ; **jamais le socket Docker brut**, qui donnerait aux agents du conteneur le contrôle de l'hôte |
| Source absente | ce n'est pas une erreur : l'inventaire la signale à part (« non vu sur ce site ») |
| Catalogue | deux kinds : `container` (actif s'il tourne, suspendu sinon ; projet d'après les étiquettes des devcontainers ou de Compose) et `volume` (conteneurs qui l'utilisent, orphelin sinon) ; aucune variable d'environnement, commande ni étiquette hors rattachement |
| Serveurs MCP conteneurisés | vus comme conteneurs ; leur reconnaissance comme serveurs MCP attend qu'il en existe un (Q6) |

**Conséquences.** Contrat fiche du catalogue 0.3.0 à l'approbation (kinds `container` et `volume`). Le câblage du
conteneur de développement du socle (proxy et montage) reste à faire, et sera documenté pour qui installe en conteneur.
