---
type: procedure
title: Installer le site de travail et sa passerelle
description: Mode opératoire, pour une session d'agent lancée dans WSL sur un poste de travail, du site HOLARCH de travail, de sa passerelle protégée et du branchement des clients.
status: draft
links:
  derives_from: [/arbre/conception/etape-2-point-entree.md]
  constrained_by: [/arbre/decisions/2026-10-03-passerelle-par-site.md, /arbre/decisions/2026-10-03-forme-etape-2.md, /arbre/fondations/principes.md]
  supported_by: [/arbre/conception/essai-agentgateway.md, /arbre/conception/procedure-essai-hote.md]
---

# Installer le site de travail et sa passerelle

Pour une session d'agent. Les consignes du dépôt (`CLAUDE.md`) s'appliquent. Trois règles en plus, qui priment :

- **Rien du travail dans le socle public** : ni nom d'employeur, de client, de projet, de serveur, d'URL interne, ni
  chemin. Tout ce qui est propre au travail va dans le **profil privé** (un dépôt privé de l'employeur) ou reste sur le
  poste.
- **Les données de travail restent sur ce site** : pas de synchronisation avec un autre site, pas de copie vers un dépôt
  public (principe P6).
- **Aucun secret dans un fichier versionné** : la clé d'accès de la passerelle vit dans un fichier local aux droits
  restreints ou dans l'environnement.

Chaque **Arrêt** et chaque « montrer et attendre l'accord » est un point où l'humain décide.

## 0. Où et avec quoi

- **Lieu** : dans WSL, sur le poste de travail, pas dans un conteneur. Vérifier : `grep -qi microsoft /proc/version`
  vrai, `/.dockerenv` absent.
- **Prérequis** : Node ≥ 22.13 (une LTS actuelle de préférence) ; Docker Desktop avec l'intégration WSL ; un clone du
  socle public (lecture) ; un accès au dépôt privé qui servira de profil. **Arrêt** si l'un manque.
- **Nom du site** : `travail` (variable `HOLARCH_SITE` ou clé `site`). **Données** : `HOLARCH_HOME` local au poste.

## 1. Profil privé

Dans le dépôt privé (à créer s'il n'existe pas, après accord de l'humain sur son nom et son emplacement) :

| Fichier | Contenu |
|---|---|
| `holarch/config.yaml` | configuration du site `travail` : racines des dépôts, compte Claude Code du site (§2), grille de tarifs, adaptateurs |
| `holarch/passerelle.yaml` | configuration de la passerelle, **sans la clé** |
| `holarch/serveurs.md` | la liste des serveurs MCP fédérés : nom, rôle, transport, qui l'entretient |
| `README.md` | comment relancer la passerelle, où vit la clé, comment revenir en arrière |

`$HOLARCH_HOME/config.yaml` est un lien vers `holarch/config.yaml` : une seule source, versionnée en privé.

**Grille de tarifs** : la recopier du site personnel s'il existe sur ce poste, sinon la **relever sur la page officielle**
du fournisseur (jamais de mémoire), en consignant `source` et `releve`. Le mode rapide s'écrit `<modèle>:rapide`, les
multiplicateurs de cache s'appliquant au tarif rapide. Sans grille, le coût reste inconnu, ce qui est acceptable.

## 2. Site de travail

1. **Désigner le compte Claude Code du site.** Par défaut l'inventaire et l'import lisent `~/.claude` ; avec un
   répertoire par compte (`CLAUDE_CONFIG_DIR`), ils lisent un profil vide **sans erreur**. Poser dans
   `holarch/config.yaml` `inventaire.claude-code` (`home` et `config`) **et** `import.claude-code-transcriptions.home` sur
   le répertoire du bon compte.
2. `node bin/holarch.js inventaire` puis `importer` (avec `HOLARCH_HOME` et le site `travail`). **Vérifier que le nombre
   de sessions importées n'est pas nul** : un 0 signale le plus souvent le mauvais répertoire.
3. **Vérifier** : le catalogue liste les serveurs MCP configurés aujourd'hui (Claude Code, Claude Desktop, en paquet
   MSIX compris) ; le journal reçoit les sessions ; l'interface (`npm run voir`) s'ouvre sur 127.0.0.1.
4. Relever, pour la suite, les serveurs MCP à fédérer et leur transport (stdio, conteneur, HTTP).

## 3. Passerelle protégée (décision `passerelle-par-site`)

1. Binaire agentgateway de la version consignée dans `essai-agentgateway.md` (ou plus récente, à consigner), somme
   SHA-256 vérifiée, installé hors des dépôts (par exemple `~/.local/opt/agentgateway`). **Arrêt** si la somme diffère.
2. `holarch/passerelle.yaml`, en suivant le schéma officiel sans rien supposer :
   - point d'entrée sur **127.0.0.1** (`gateways`, `bindAddress`) ;
   - **`dnsRebindingProtection: true`** ;
   - **clé d'accès** (politique `apiKey` du schéma, `mode: strict`) : la clé, générée aléatoirement, vit dans un fichier
     local en droits `600` hors des dépôts ; la configuration ne porte que son **empreinte** (`keyHash: "sha256:<hex>"`),
     donc aucun secret et un fichier versionnable. La rotation change le fichier et l'empreinte, jamais les clients
     (ils relisent le fichier au lancement) ;
   - cibles : les serveurs relevés au §2 **et** le serveur HOLARCH (`bin/holarch.js mcp`) ;
   - `failureMode: failOpen` ; journal au format `json`, écrit dans un fichier sous `$HOLARCH_HOME/passerelle/` ;
     `adminAddr`, `statsAddr`, `readinessAddr` sur 127.0.0.1 ou `off`.
3. Lancement durable : un service utilisateur systemd dans WSL si systemd y est actif ; sinon, proposer à l'humain
   une autre voie (tâche planifiée Windows qui démarre WSL) et attendre son choix. **Arrêt** : installer un service est
   une persistance, que l'outil d'agent peut lui aussi soumettre à un accord explicite de l'humain ; le demander avant.
   Le `PATH` d'un service est minimal : y mettre explicitement le Node utilisé (un gestionnaire de versions n'est pas
   dans le `PATH` d'un service) et les outils qu'invoquent les serveurs fédérés (CLI de secrets, Docker).

**Vérifier**, et consigner chaque résultat :
- `ss -ltnp` : la passerelle n'écoute que sur 127.0.0.1 ;
- sans clé : refus ; avec la clé : la liste d'outils contient ceux de chaque serveur, préfixés, et ceux de HOLARCH ;
- `Host: evil.example` : refus (403) ;
- un appel avec une chaîne témoin : le journal montre serveur et outil, jamais la chaîne ;
- un serveur arrêté : les autres restent servis ;
- **autant de serveurs que de cibles configurées** : avec `failOpen`, une cible qui n'a pas démarré est ignorée sans
  erreur côté client (seul un avertissement au journal le dit) ; comparer le préfixe de chaque outil listé à la liste des
  cibles, et relire les avertissements du journal ;
- **les scripts de vérification ferment leurs sessions** (`terminateSession` du client officiel) : une session laissée
  ouverte garde ses serveurs stdio jusqu'à 30 min d'inactivité ;
- **une session neuve** : mesurer le délai de `initialize` (de l'ordre de la seconde par serveur léger ; plus, des
  serveurs qui ouvrent des connexions à une base). Au-delà de ce que tolère un client (quelques dizaines de secondes), voir
  « Reprise après blocage ».

## 4. Clients

Pour chaque client, **montrer le changement et attendre l'accord**, sauvegarder la configuration d'avant.

- **Claude Code (WSL)** : une entrée HTTP vers la passerelle avec l'en-tête de la clé (`claude mcp add --scope user
  --transport http … --header …`), **dans le répertoire du bon compte** (`CLAUDE_CONFIG_DIR`). La commande écrit la clé
  telle quelle dans la configuration du compte (fichier en droits `600`, hors dépôt) : à consigner, à ne jamais
  commiter. Si le projet déclare déjà le serveur HOLARCH en direct, il sera servi deux fois : choisir un chemin.
- **Claude Code dans un conteneur de développement** : `host.docker.internal` ; la protection contre le DNS rebinding
  impose l'en-tête `Host: localhost:<port>` ; tester les deux en-têtes ensemble et consigner.
- **Claude Desktop** : une entrée stdio qui lance dans WSL un **script de lancement** (versionné dans le profil, sans
  secret) : `wsl.exe -d <distribution> -- <chemin du script>`. Le script fixe son `PATH`, relit la clé dans son fichier et
  exécute `mcp-remote` (version fixée) avec `--header 'Authorization:Bearer ${KEY}'` (apostrophes : `mcp-remote`
  substitue la variable lui-même). **Aucune substitution dans la configuration de Desktop** : `wsl.exe -- bash -lc "…"`
  repasse la commande par un premier shell qui expanse `$(…)` et `$PATH` (espaces du `PATH` de Windows : erreur de
  syntaxe) et recopie la clé dans le journal d'erreur de Desktop. Le `npx` de Windows peut aussi précéder celui de WSL
  dans le `PATH` : le pont tourne alors sous Windows et l'en-tête arrive vide (401).
- **Retirer des clients** les entrées directes des serveurs désormais derrière la passerelle : c'est ce qui fait que
  les clients « passent par le hub ». Garder les sauvegardes. **Ordre** : tant que les deux existent, chaque serveur
  tourne deux fois ; pour des serveurs qui ouvrent des connexions limitées (bases de données), retirer les entrées
  directes **avant** de brancher le hub, avec la sauvegarde pour retour arrière, plutôt que de laisser coexister.

**Vérifier** : dans Desktop et dans Claude Code, un outil de chaque serveur fédéré répond ; le journal de la passerelle
les montre.

## Reprise après blocage

Symptôme : un client affiche « Request timed out » ou « Server disconnected » alors que la passerelle répond à un client
neuf. Cause usuelle : chaque session ouvre une série de serveurs stdio, un client en ouvre plusieurs par lancement et en
relance à chaque expiration ; des séries orphelines saturent une ressource limitée, ce qui ralentit la série suivante.
1. **Fermer complètement les clients** (sans quoi ils relancent pendant le nettoyage).
2. Redémarrer la passerelle : toutes ses séries disparaissent. Vérifier qu'il ne reste ni lanceur ni conteneur de
   serveur, puis mesurer une session neuve.
3. Rouvrir **un** client, ne plus y toucher pendant deux minutes, lire le journal de la passerelle.

**Remède durable pour les serveurs qui tiennent des connexions limitées** (bases de données) : ne pas les lancer par
session. Les faire tourner en **un conteneur permanent**, en SSE sur la boucle locale, sous un service utilisateur
(arrêt : accord de l'humain), et les viser dans la passerelle par `sse: { host: 127.0.0.1, port, path }`. Toutes les
sessions partagent alors un pool ; vérifier que le nombre de connexions ouvertes ne croît plus avec les sessions.

## 5. Journal de la passerelle vers le journal HOLARCH

L'import existe dans le socle (`src/import/agentgateway.js`) : il lit le journal `json` de la passerelle et en tire
`tool.called` (serveur, outil, code HTTP, durée, session ; jamais les arguments). Dans `holarch/config.yaml` :
`import.agentgateway: { actif: true, fichier: <journal de la passerelle>, nom: <nom de la passerelle chez les clients> }`.
Le flux de la passerelle mêle ses lignes JSON et la sortie d'erreur des serveurs qu'elle lance : l'import écarte le texte
sans le compter comme refus. La passerelle fait alors foi pour les appels qui la traversent : l'import des transcriptions ne reprend plus les appels
au serveur `nom`. **Vérifier** : `node bin/holarch.js importer` puis la carte « Appels MCP » montrent les serveurs
fédérés, pas le nom de la passerelle ; un même appel n'y compte qu'une fois. Limite connue : la passerelle ne voit pas
l'échec d'un outil, seulement les échecs HTTP.

## 6. Consigner et ranger

1. Dans le profil privé : ce qui est propre au travail (serveurs, versions, chemins, choix faits).
2. Dans le socle : `essai-agentgateway.md` ou une nouvelle observation, **sans rien du travail** (versions, ce qui a
   marché, ce qui a coincé) ; `arbre/log.md` ; avancement de `etape-2-point-entree.md` ; le code et ses tests.
3. Avant tout commit dans le socle : relire le diff en cherchant tout nom ou chemin du travail (demander à l'humain la
   liste des noms à proscrire) ; `npm test` vert. **Pousser seulement si l'humain le demande.**
4. Le critère d'usage de l'étape (Desktop et Claude Code passent par le hub au quotidien) se lit ensuite au tableau
   de bord du site `travail` (carte « Appels MCP »).
