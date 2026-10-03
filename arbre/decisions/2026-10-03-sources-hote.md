---
type: decision
title: Les sources de l'hôte, lues par des interfaces standard, en lecture seule
description: Comment l'inventaire voit Docker et Claude Desktop, qu'il tourne sur la machine ou dans un conteneur ; ajoute les kinds container et volume au catalogue.
status: draft
links:
  derives_from: [/arbre/conception/etape-1-voir.md]
  constrained_by: [/arbre/decisions/2026-10-03-synchronisation.md]
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
| Installation en conteneur | HOLARCH tourne **aussi sur l'hôte, comme un second site** (par exemple `hote`), qui partage le répertoire de données du conteneur et n'active que les adaptateurs de l'hôte ; le conteneur montre l'union des sites (décision synchronisation). Le conteneur ne reçoit aucun droit nouveau. **Jamais le socket Docker brut** dans le conteneur, qui donnerait à ses agents le contrôle de l'hôte |
| Repli | si rien ne peut s'installer sur l'hôte : un **proxy filtrant** de l'API Docker (outil existant, lecture des conteneurs et volumes seulement), désigné par `inventaire.docker.hote`, et un montage en lecture seule de la configuration de Claude Desktop, désigné par `inventaire.claude-desktop.config` |
| Configuration par site | `config.yaml` porte ce qui est commun (tarifs…) ; `config.<site>.yaml` ce qui est propre au site ; le site vient de `HOLARCH_SITE`, sinon de `config.yaml` |
| Source absente | ce n'est pas une erreur : l'inventaire la signale à part (« non vu sur ce site ») |
| Catalogue | deux kinds : `container` (actif s'il tourne, suspendu sinon ; projet d'après les étiquettes des devcontainers ou de Compose) et `volume` (conteneurs qui l'utilisent, orphelin sinon) ; aucune variable d'environnement, commande ni étiquette hors rattachement |
| Serveurs MCP conteneurisés | vus comme conteneurs ; leur reconnaissance comme serveurs MCP attend qu'il en existe un (Q6) |

Exemple fictif de `config.hote.yaml` pour un hôte WSL dont le conteneur porte déjà Claude Code, les dépôts et l'import :

```yaml
inventaire:
  claude-code: { actif: false }
  depots-git: { actif: false }
  arbre: { actif: false }
  claude-desktop: { config: /mnt/c/Users/<utilisateur>/AppData/Roaming/Claude/claude_desktop_config.json }
import:
  claude-code-transcriptions: { actif: false }
```

**Conséquences.** Contrat fiche du catalogue 0.3.0 à l'approbation (kinds `container` et `volume`). Deux sites qui
partagent un répertoire de données portent des noms distincts. Le site de l'hôte se relance à la main ou par une tâche
planifiée : la date de son dernier inventaire dit la fraîcheur de ce qu'il montre.
