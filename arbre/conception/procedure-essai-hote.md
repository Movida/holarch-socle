---
type: procedure
title: Essai du hub sur l'hôte (WSL et Claude Desktop)
description: Mode opératoire, pour une session d'agent lancée dans WSL sur l'hôte, de l'essai du hub (site de l'hôte, agentgateway, Claude Desktop, accès depuis un conteneur).
status: draft
links:
  derives_from: [/arbre/conception/essai-agentgateway.md]
  constrained_by: [/arbre/decisions/2026-10-03-forme-etape-2.md, /arbre/decisions/2026-10-03-sources-hote.md]
---

# Essai du hub sur l'hôte

Pour une session d'agent. Les consignes du dépôt (`CLAUDE.md`) s'appliquent : rien de personnel dans un fichier suivi,
tout ce que l'agent écrit dans l'arbre reste `draft`, aucune approbation consignée sans une phrase de l'humain.

## 0. Où et avec quoi

- **Lieu** : dans WSL, sur l'hôte, **pas dans un conteneur** ; dans le clone hôte du dépôt (celui que monte le conteneur
  de développement du socle). Vérifier : `grep -qi microsoft /proc/version` vrai, `/.dockerenv` absent,
  `git remote -v` désigne le dépôt du socle.
- **Prérequis** : Node ≥ 22.5 ; `npm ci` ; Docker Desktop avec l'intégration WSL (`docker version` répond).
- **Données** : `HOLARCH_HOME=$HOME/.claude/holarch`, le répertoire déjà partagé avec les conteneurs. Ne pas en créer un
  autre.
- **Fichiers temporaires** (binaire, configuration de la passerelle, scripts d'essai) : hors du dépôt, par exemple
  dans un répertoire de travail temporaire ; rien de tout cela n'est commité.

**Arrêt** : si un prérequis manque, s'arrêter et dire à l'humain lequel.

## 1. Site de l'hôte (décision `sources-hote`)

1. Trouver le fichier de configuration de Claude Desktop : `wslpath "$(cmd.exe /c 'echo %APPDATA%' 2>/dev/null | tr -d '\r')"`,
   puis `…/Claude/claude_desktop_config.json`.
2. Écrire `$HOLARCH_HOME/config.hote.yaml` sur le modèle de la décision `sources-hote` : `claude-code`, `depots-git`,
   `arbre` et l'import des transcriptions désactivés ; `claude-desktop.config` vers ce fichier.
3. `HOLARCH_SITE=hote node bin/holarch.js inventaire`.

**Vérifier** : la sortie ne signale plus Docker ni Claude Desktop comme « non vus » ; le catalogue du site `hote`
contient des fiches `container`, `volume` et, s'il y en a, des `connector` de portée `desktop`. Le site du conteneur
(`local`) n'est pas modifié.

## 2. Passerelle (agentgateway)

1. Télécharger la version consignée dans `essai-agentgateway.md` (binaire Linux) **et** sa somme `.sha256` depuis la
   page des versions officielles ; vérifier la somme. **Arrêt** si elle diffère.
2. Configuration, en suivant le schéma officiel (`https://agentgateway.dev/schema/config`), sans rien supposer :
   - un point d'entrée MCP sur **127.0.0.1** seulement (section `gateways`, `bindAddress`), port libre (3900 par exemple) ;
   - cibles stdio : le serveur HOLARCH (`node --no-warnings <dépôt>/bin/holarch.js mcp`, avec `HOLARCH_HOME`) et un serveur
     de démonstration minimal écrit avec le SDK officiel (un outil `echo`) ;
   - `failureMode: failOpen` ; journal au format `json` ; `adminAddr`, `statsAddr`, `readinessAddr` sur 127.0.0.1 ou `off`.
3. Lancer la passerelle en arrière-plan, journal dans un fichier.

**Vérifier** :
- `ss -ltnp` ne montre la passerelle que sur 127.0.0.1 ;
- avec le client MCP officiel (`@modelcontextprotocol/client`, transport HTTP), la liste d'outils contient `holarch_*` et
  `demo_echo`, et `holarch_etat` répond ;
- un appel à `demo_echo` avec une chaîne témoin : le journal de la passerelle montre serveur et outil, **jamais** la
  chaîne.

## 3. Claude Desktop par un pont stdio

Claude Desktop ne joint pas un serveur local par URL, et une entrée `url` dans son fichier de configuration a déjà
effacé toute la section `mcpServers` : n'utiliser qu'une entrée `command`.

1. **Sauvegarder** le fichier de configuration de Claude Desktop (copie datée à côté de lui).
2. Préparer l'ajout d'une entrée `holarch-hub` qui lance le pont **dans WSL**, pour joindre 127.0.0.1 sans dépendre du
   réseau Windows : `command` = `wsl.exe`, `args` = `["-e", "bash", "-lc", "npx -y mcp-remote@<version fixée> http://127.0.0.1:3900/mcp"]`
   (version de `mcp-remote` fixée, relevée sur npm). Les entrées existantes restent intactes.
3. **Montrer le changement à l'humain et attendre son accord** avant d'écrire : ce fichier n'est pas dans le dépôt.
4. Demander à l'humain de **redémarrer Claude Desktop**, puis de lui faire appeler un outil HOLARCH (« quel est l'état
   de HOLARCH sur 7 jours ? »).

**Vérifier** : l'humain voit les outils `holarch_*` dans Desktop ; le journal de la passerelle montre l'appel.

En plus, pour mémoire : depuis Windows, `curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3900/mcp` (le
transfert localhost de WSL vers Windows) ; noter le code obtenu, sans rien changer à la configuration réseau.

## 4. Accès depuis un conteneur de développement

1. Repérer le conteneur du socle s'il tourne (`docker ps`, étiquette `devcontainer.local_folder`).
2. Depuis lui (`docker exec`), tester `http://host.docker.internal:3900/mcp`.
3. Si l'accès échoue avec l'écoute sur 127.0.0.1, **ne pas** ouvrir la passerelle sur toutes les interfaces sans
   l'accord de l'humain ; noter le résultat et les options (mode réseau `mirrored` de WSL, écoute sur l'adresse du
   pont, pont stdio dans le conteneur).

## 5. Consigner et ranger

1. Compléter `arbre/conception/essai-agentgateway.md` (reste `draft`) : un tableau de ce qui a été vérifié sur l'hôte,
   avec les versions (passerelle, `mcp-remote`, Claude Desktop si visible), sans aucun chemin ni nom personnel.
2. Une ligne datée en tête de `arbre/log.md` ; avancement de `arbre/conception/etape-2-point-entree.md`.
3. `npm test` vert ; commit en français, résumé impératif ; **pousser seulement si l'humain le demande**.
4. Arrêter la passerelle. Demander à l'humain s'il garde l'entrée `holarch-hub` de Claude Desktop ; sinon, remettre la
   sauvegarde.
