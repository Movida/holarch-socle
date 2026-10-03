---
type: observation
title: Essai d'agentgateway comme hub de fédération
description: Ce que l'essai du 2026-10-03 a montré d'agentgateway 1.6.0 (fédération, journal, panne, ports), en conteneur puis sur un hôte WSL avec Claude Desktop.
status: draft
as_of: 2026-10-03
links:
  derives_from: [/arbre/conception/etape-2-point-entree.md]
  supported_by: [/arbre/decisions/2026-10-03-forme-etape-2.md]
---

# Essai d'agentgateway comme hub de fédération (2026-10-03)

**Montage.** agentgateway 1.6.0 (binaire Linux officiel, somme SHA-256 vérifiée), dans un conteneur de développement.
Deux serveurs stdio fédérés derrière un point d'entrée HTTP : le serveur MCP de HOLARCH et un serveur de démonstration.
Client : le client MCP officiel (TypeScript v2), en HTTP.

| Vérifié | Résultat |
|---|---|
| Fédération | les outils des deux serveurs sont servis ensemble, préfixés par serveur (`holarch_etat`, `demo_echo`) ; les annotations (lecture seule) sont conservées ; les appels aboutissent |
| Journal | une ligne par appel : serveur (`mcp.target`), outil (`gen_ai.tool.name`), statut, durée, session ; **aucun argument** (vérifié par une chaîne témoin) ; format `json` disponible pour la traduction vers le contrat événement |
| Panne d'un serveur | par défaut (`failureMode: failClosed`), un seul serveur défaillant fait échouer tout le point d'entrée ; avec **`failureMode: failOpen`**, il est ignoré (avertissement au journal) et les autres restent servis |
| Ports | ports d'administration fixes (15000, 15020, 15021) : deux instances sur une machine entrent en conflit ; le port de statistiques écoute sur toutes les interfaces |
| Adresse d'écoute | la section `binds` employée ici (marquée obsolète par le schéma) écoute sur **toutes les interfaces** ; `gateways` accepte `bindAddress: 127.0.0.1` |

**Retenu pour la configuration du hub.** `gateways` avec `bindAddress: 127.0.0.1` ; `failureMode: failOpen` ; journal
au format `json` (`config.logging.format`) ; `mcp.dnsRebindingProtection: true` (essai sur l'hôte) ; `config.adminAddr`, `config.statsAddr` et `config.readinessAddr` sur la boucle
locale ou `off`. Procédure de l'essai sur l'hôte : `procedure-essai-hote.md`.

## Sur l'hôte (WSL), le 2026-10-03

Procédure : `procedure-essai-hote.md`. Hôte Windows, WSL 2 (transfert localhost par défaut), Docker Desktop.

| Élément | Version |
|---|---|
| agentgateway | 1.6.0 (binaire Linux officiel, somme SHA-256 vérifiée) |
| `mcp-remote` (pont stdio) | 0.14.3 |
| Claude Desktop | 2.16120.0.0 (paquet MSIX) |
| Node sur l'hôte | 22.11 |

| Vérifié | Résultat |
|---|---|
| Site de l'hôte | `config.hote.yaml` sur le modèle de la décision `sources-hote` ; l'inventaire du site `hote` donne des fiches `container`, `volume` et `connector` (portée `desktop`), rien « non vu » ; le catalogue du site `local` est inchangé |
| Écoute | `gateways` avec `bindAddress: 127.0.0.1` : point d'entrée MCP et administration sur la boucle locale seulement ; statistiques et disponibilité à `off` |
| Fédération et journal | client officiel en HTTP : `holarch_*` et `demo_echo` listés, `holarch_etat` répond ; le journal `json` donne serveur et outil, **jamais** la chaîne témoin passée à `demo_echo` |
| Claude Desktop | entrée `command` (`wsl.exe -e bash -lc "npx -y mcp-remote@0.14.3 http://127.0.0.1:3900/mcp"`) ; après redémarrage, Desktop liste les outils et les appelle (`etat`, `consommation`, `journal`, `sessions`) ; chaque appel figure au journal de la passerelle. Bruit au démarrage : les sondages de `mcp-remote` (406, « session ID is required ») et les `resources/list` / `prompts/list` non servis, ignorés grâce à `failOpen` |
| Windows vers WSL | `curl.exe` sur `http://127.0.0.1:3900/mcp` depuis Windows : 406 (réponse de la passerelle à un GET sans `Accept: text/event-stream`), donc joignable par le transfert localhost |
| DNS rebinding | sans protection, une requête `Host: evil.example` / `Origin: http://evil.example` est **servie** (200) : une page web ordinaire pourrait appeler les outils fédérés. Avec `mcp.dnsRebindingProtection: true`, hôte ou origine non locaux sont refusés (403) ; le client local et le pont de Desktop passent toujours |
| Depuis un conteneur | depuis un conteneur de développement, `http://host.docker.internal:3900/mcp` joint la passerelle **qui n'écoute que sur 127.0.0.1** : Docker Desktop relaie vers la boucle locale de WSL (`src.addr` 127.0.0.1 au journal), rien à ouvrir. Avec la protection contre le DNS rebinding, ce nom d'hôte est refusé (403) ; le client doit présenter `Host: localhost:3900` pour passer. À trancher pour le déploiement : en-tête forcé côté conteneur, ou clé d'accès (`apiKey` du schéma) à la place du contrôle d'hôte |

**Constats en marge.**

- Claude Desktop installé en paquet MSIX garde sa configuration sous
  `%LOCALAPPDATA%\Packages\Claude_<éditeur>\LocalCache\Roaming\Claude\`, pas sous `%APPDATA%\Claude\` : l'emplacement
  documenté ne la trouve pas, `inventaire.claude-desktop.config` la désigne (Q7).
- Sous Node 22.5 à 22.12, `node:sqlite` exige `--experimental-sqlite` (sans drapeau depuis 22.13) : la passerelle lance
  donc le serveur HOLARCH avec ce drapeau sur un tel hôte. `engines` passe à `>=22.13`.
- L'API Docker rend `Labels: null` pour un objet sans étiquette : l'adaptateur Docker plantait dessus, corrigé.

**Reste.** Traduction du journal de la passerelle vers `tool.called` ; lancement durable de la passerelle et du site de
l'hôte (aujourd'hui à la main) ; déploiement sur le site de travail.
