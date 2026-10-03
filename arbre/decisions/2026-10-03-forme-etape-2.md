---
type: decision
title: L'étape 2 se découpe selon le lieu où chaque partie sert
description: Un serveur MCP propre à HOLARCH et les appels MCP au journal servent partout ; la fédération adopte agentgateway, essayée ici, déployée là où sont les serveurs.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « ok pour tes recommandations » (avis rendu point par point)" }
links:
  derives_from: [/arbre/decisions/2026-10-03-cloture-etape-1.md]
  modifies: [/docs/architecture.md]
---

# L'étape 2 se découpe selon le lieu où chaque partie sert

**Contexte.** L'architecture (§10) donne à l'étape 2 « un hub MCP fédérant les serveurs existants et exposant le
catalogue », tenu au critère « Desktop et Claude Code passent par le hub au quotidien ». Sur le poste personnel, les
serveurs MCP utilisés sont des connecteurs claude.ai : gérés par le compte et appelés depuis l'infrastructure
d'Anthropic, ils ne peuvent pas passer par un hub local. Les serveurs MCP locaux (un par API, un conteneur chacun)
sont au travail, où les bases de connaissances sont des dépôts privés.

Recherche du 2026-10-03 (P2) : aucune passerelle ne couvre tout ; agentgateway (Linux Foundation, Apache-2.0, un
binaire) fédère stdio et HTTP, préfixe les outils, porte des règles d'accès et journalise outil et serveur sans les
arguments. Claude Desktop ne joint pas un serveur local par URL : il lui faut un pont stdio (`mcp-remote`, `.mcpb`).
Le SDK MCP officiel (TypeScript, v2, Apache-2.0) suffit pour un serveur sans chaîne de construction.

**Décision.**

| # | Partie | Sert | Choix |
|---|---|---|---|
| 1 | Serveur MCP de HOLARCH, en lecture : catalogue, journal, sessions, coûts, arbre | partout | écrit sur le SDK officiel ; les mêmes lectures que l'interface |
| 2 | Appels MCP au journal (`tool.called` : serveur et outil, jamais les arguments), connecteurs claude.ai au catalogue avec leur usage | partout | importés des transcriptions, sans proxy |
| 3 | Hub de fédération | là où sont les serveurs | **adopter agentgateway**, après un essai ici (serveur HOLARCH et serveur de démonstration, Desktop par pont stdio, accès depuis un conteneur) ; n'écrire que la traduction de ses journaux vers le contrat événement |

**Critère d'usage, par lieu.** Au travail : Desktop et Claude Code passent par le hub au quotidien. Ici : les agents
interrogent le serveur HOLARCH plutôt que de fouiller (mesuré par les appels `mcp__holarch__*` au journal).

**Conséquences.** Le poste de travail est un site à part, avec ses données et sa configuration propres (P6, trois
couches) ; ses bases de connaissances restent des dépôts privés. Le filtrage par contexte dans le hub vient quand deux
contextes partagent un même hub (P8).
