---
type: spec
title: Étape 2 — Un seul point d'entrée
description: Un serveur MCP propre à HOLARCH, les appels MCP au journal, et un hub de fédération adopté (agentgateway) là où sont les serveurs.
status: draft
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/decisions/2026-10-03-forme-etape-2.md, /arbre/conception/contrats/evenement.md, /arbre/conception/contrats/fiche-catalogue.md, /arbre/decisions/2026-10-03-cloture-etape-1.md]
---

# Étape 2 — Un seul point d'entrée

**Sert** B2 (« voir ce qui est en place et ce qui se passe ») depuis les agents eux-mêmes, et prépare B1 (les règles
passeront par le même point d'entrée). **Critère d'usage, par lieu** (décision `forme-etape-2`) : au travail,
Desktop et Claude Code passent par le hub au quotidien ; ici, les agents interrogent le serveur HOLARCH plutôt que de
fouiller.

## Livre

1. **Serveur MCP de HOLARCH**, en lecture : état et coûts d'une période, catalogue (recherche, fiche et son
   historique), sessions, consommation, journal (par famille, par session), arbre. Les mêmes lectures que l'interface,
   des réponses bornées. Transport stdio (`holarch mcp`) pour Claude Code ; HTTP quand le hub l'appellera.
2. **Appels MCP au journal** : l'import des transcriptions émet `tool.called` (serveur, outil, session ; jamais les
   arguments) ; les serveurs appelés, connecteurs claude.ai compris, entrent au catalogue avec leur usage.
3. **Hub de fédération** : essai d'agentgateway ici (serveur HOLARCH, serveur de démonstration, Desktop par pont stdio,
   accès depuis un conteneur), puis déploiement sur le site de travail ; traduction de ses journaux vers le contrat
   événement.

## Choix techniques (principe P12)

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| SDK MCP officiel TypeScript v2 (`@modelcontextprotocol/server`) | officiel, compilé d'avance (pas de chaîne de construction), suit la spécification | un besoin qu'il ne couvre pas |
| agentgateway pour la fédération | fédère stdio et HTTP, préfixe, règles d'accès, journal sans arguments ; un binaire | un essai qui échoue sur Desktop, un conteneur ou le journal |

## Avancement

- **À faire, dans cet ordre** : 1. serveur MCP de HOLARCH ; 2. appels MCP au journal ; 3. essai d'agentgateway, puis
  site de travail.

## Hors périmètre

Écriture par les outils MCP, règles appliquées, filtrage par contexte dans le hub : étapes suivantes.
