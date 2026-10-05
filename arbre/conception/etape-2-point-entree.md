---
type: spec
title: Étape 2 — Un seul point d'entrée
description: Un serveur MCP propre à HOLARCH, les appels MCP au journal, et un hub de fédération adopté (agentgateway) là où sont les serveurs.
status: draft
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/decisions/2026-10-03-passerelle-par-site.md, /arbre/decisions/2026-10-03-forme-etape-2.md, /arbre/conception/contrats/evenement.md, /arbre/conception/contrats/fiche-catalogue.md, /arbre/decisions/2026-10-03-cloture-etape-1.md]
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

- **Fait (2026-10-03)** : serveur MCP de HOLARCH sur le SDK officiel v2, en stdio (`holarch mcp`) : sept outils en
  lecture (`etat`, `catalogue`, `fiche`, `sessions`, `consommation`, `journal`, `arbre`), réponses bornées ; déclaré au
  projet (`.mcp.json`) ; testé de bout en bout par le client officiel (18 tests).
- **Fait (2026-10-03)** : appels MCP au journal (`tool.called` : serveur, outil, issue ; jamais les arguments ni la
  réponse), importés des transcriptions ; connecteurs claude.ai au catalogue (noms gardés par Claude Code) et tout
  serveur appelé, avec son usage ; carte « Appels MCP » au tableau de bord, Journal filtrable par serveur ; 19 tests.
- **Fait (2026-10-03)** : essai d'agentgateway dans un conteneur (`essai-agentgateway.md`) : fédération, journal sans
  arguments et tolérance aux pannes (`failOpen`) vérifiés.
- **Fait (2026-10-03)** : essai sur l'hôte WSL (`essai-agentgateway.md`) : site de l'hôte, passerelle sur 127.0.0.1
  seulement, Claude Desktop par pont stdio (`mcp-remote`) qui appelle les outils HOLARCH, accès depuis un conteneur par
  `host.docker.internal` sans ouvrir l'écoute.
- **Fait (2026-10-03)** : décision `passerelle-par-site` (pas de passerelle durable sur le poste personnel, clé d'accès
  et protection DNS rebinding au travail) ; configuration de Claude Desktop trouvée aussi en installation MSIX, sous
  Windows et depuis WSL (Q7) ; test visuel qui échoue vite sans Chromium.
- **Fait (2026-10-03)** : ici, Claude Desktop branché en direct sur le serveur HOLARCH (entrée stdio par `wsl.exe`, plus
  de pont vers la passerelle) ; l'hôte passé en Node 24 LTS, sans drapeau ; un appel de Desktop vérifié. Le test visuel
  reste au conteneur du socle.
- **Fait (2026-10-03)** : import du journal `json` de la passerelle vers `tool.called` (`import.agentgateway`), écrit et
  testé ici sur le format réel ; la passerelle fait foi pour les appels qui la traversent (pas de double compte avec les
  transcriptions) ; elle ne voit pas l'échec d'un outil, seulement les échecs HTTP.
- **Fait (2026-10-05)** : procédure du site de travail exécutée de bout en bout (`essai-site-travail.md`) : profil privé,
  site, passerelle protégée par clé (service utilisateur), Claude Desktop et Claude Code branchés, journal de la
  passerelle importé ; serveurs de bases de données partagés (SSE) ; index SQLite sûr à plusieurs processus. Quinze constats,
  questions Q8 à Q12.
- **Fait (2026-10-05)** : plusieurs comptes Claude Code par site (Q11) : la part de chaque compte se suit dans `holarch etat`.
- **Fait (2026-10-05)** : cibles ignorées par la passerelle au journal (`system.degraded`, Q9), visibles dans `holarch etat`
  et au tableau de bord.
- **Fait (2026-10-05)** : pont stdio du socle (`holarch pont`) pour les clients stdio ; ré-identification au catalogue
  par le nom (Q12).
- **Clôture (2026-10-05)** : étape close sur l'usage au travail (décision `cloture-etape-2`) : la passerelle sert au
  quotidien. Le critère « ici » reste ouvert : serveur HOLARCH à brancher pour toutes les sessions du site, index à
  rafraîchir.

## Hors périmètre

Écriture par les outils MCP, règles appliquées, filtrage par contexte dans le hub : étapes suivantes.
