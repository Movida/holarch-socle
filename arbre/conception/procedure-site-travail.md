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
| `holarch/config.yaml` | configuration du site `travail` : racines des dépôts, grille de tarifs (recopiée du site personnel, elle est publique), adaptateurs |
| `holarch/passerelle.yaml` | configuration de la passerelle, **sans la clé** |
| `holarch/serveurs.md` | la liste des serveurs MCP fédérés : nom, rôle, transport, qui l'entretient |
| `README.md` | comment relancer la passerelle, où vit la clé, comment revenir en arrière |

`$HOLARCH_HOME/config.yaml` est un lien vers `holarch/config.yaml` : une seule source, versionnée en privé.

## 2. Site de travail

1. `node bin/holarch.js inventaire` puis `importer` (avec `HOLARCH_HOME` et le site `travail`).
2. **Vérifier** : le catalogue liste les serveurs MCP configurés aujourd'hui (Claude Code, Claude Desktop, en paquet
   MSIX compris) ; le journal reçoit les sessions ; l'interface (`npm run voir`) s'ouvre sur 127.0.0.1.
3. Relever, pour la suite, les serveurs MCP à fédérer et leur transport (stdio, conteneur, HTTP).

## 3. Passerelle protégée (décision `passerelle-par-site`)

1. Binaire agentgateway de la version consignée dans `essai-agentgateway.md` (ou plus récente, à consigner), somme
   SHA-256 vérifiée, installé hors des dépôts (par exemple `~/.local/opt/agentgateway`). **Arrêt** si la somme diffère.
2. `holarch/passerelle.yaml`, en suivant le schéma officiel sans rien supposer :
   - point d'entrée sur **127.0.0.1** (`gateways`, `bindAddress`) ;
   - **`dnsRebindingProtection: true`** ;
   - **clé d'accès** (politique `apiKey` du schéma) : la clé, générée aléatoirement, vit dans un fichier local en droits
     `600` hors des dépôts ; si le schéma ne lit pas une variable d'environnement, la configuration effective se
     produit au lancement depuis le modèle versionné, dans un fichier non versionné ;
   - cibles : les serveurs relevés au §2 **et** le serveur HOLARCH (`bin/holarch.js mcp`) ;
   - `failureMode: failOpen` ; journal au format `json`, écrit dans un fichier sous `$HOLARCH_HOME/passerelle/` ;
     `adminAddr`, `statsAddr`, `readinessAddr` sur 127.0.0.1 ou `off`.
3. Lancement durable : un service utilisateur systemd dans WSL si systemd y est actif ; sinon, proposer à l'humain
   une autre voie (tâche planifiée Windows qui démarre WSL) et attendre son choix.

**Vérifier**, et consigner chaque résultat :
- `ss -ltnp` : la passerelle n'écoute que sur 127.0.0.1 ;
- sans clé : refus ; avec la clé : la liste d'outils contient ceux de chaque serveur, préfixés, et ceux de HOLARCH ;
- `Host: evil.example` : refus (403) ;
- un appel avec une chaîne témoin : le journal montre serveur et outil, jamais la chaîne ;
- un serveur arrêté : les autres restent servis.

## 4. Clients

Pour chaque client, **montrer le changement et attendre l'accord**, sauvegarder la configuration d'avant.

- **Claude Code (WSL)** : une entrée HTTP vers la passerelle avec l'en-tête de la clé (`claude mcp add --transport http
  … --header …`), la clé lue depuis son fichier, jamais écrite en clair dans un dépôt.
- **Claude Code dans un conteneur de développement** : `host.docker.internal` ; la protection contre le DNS rebinding
  impose l'en-tête `Host: localhost:<port>` ; tester les deux en-têtes ensemble et consigner.
- **Claude Desktop** : une entrée stdio qui lance dans WSL le pont `mcp-remote` (version fixée) vers la passerelle, avec
  l'en-tête de la clé lu depuis son fichier (`wsl.exe -e bash -lc '…'`).
- **Retirer des clients** les entrées directes des serveurs désormais derrière la passerelle : c'est ce qui fait que
  les clients « passent par le hub ». Garder les sauvegardes.

**Vérifier** : dans Desktop et dans Claude Code, un outil de chaque serveur fédéré répond ; le journal de la passerelle
les montre.

## 5. Journal de la passerelle vers le journal HOLARCH

L'import existe dans le socle (`src/import/agentgateway.js`) : il lit le journal `json` de la passerelle et en tire
`tool.called` (serveur, outil, code HTTP, durée, session ; jamais les arguments). Dans `holarch/config.yaml` :
`import.agentgateway: { actif: true, fichier: <journal de la passerelle>, nom: <nom de la passerelle chez les clients> }`.
La passerelle fait alors foi pour les appels qui la traversent : l'import des transcriptions ne reprend plus les appels
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
