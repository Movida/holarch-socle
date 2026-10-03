---
type: observation
title: Essai d'agentgateway comme hub de fédération
description: Ce que l'essai du 2026-10-03 a montré d'agentgateway 1.6.0 (fédération, journal, panne, ports) et ce qui reste à essayer sur l'hôte.
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
au format `json` (`config.logging.format`) ; `config.adminAddr`, `config.statsAddr` et `config.readinessAddr` sur la boucle
locale ou `off`. Procédure de l'essai sur l'hôte : `procedure-essai-hote.md`.

**Reste à essayer, sur l'hôte.** Claude Desktop (Windows) par un pont stdio vers le point d'entrée ; l'accès depuis un
conteneur de développement à une passerelle qui tourne dans WSL. Puis le déploiement sur le site de travail.
