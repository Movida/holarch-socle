# Journal de l'arbre

## 2026-10-03

* **Import du journal de la passerelle** : `tool.called` depuis le journal `json` d'agentgateway, la passerelle faisant
  foi pour les appels qui la traversent ; constat : elle ne voit pas l'échec d'un outil.

* **Procédure du site de travail** : `procedure-site-travail.md` (profil privé, passerelle protégée, clients,
  import du journal de la passerelle), sans rien du travail dans le socle.

* **Étape 2, poste personnel** : Claude Desktop appelle HOLARCH en direct (stdio par `wsl.exe`) ; hôte en Node 24 LTS.
  Reste le site de travail.

* **Après l'essai sur l'hôte** : Q7 résolue (Claude Desktop en paquet MSIX, sous Windows et depuis WSL) ; test visuel qui
  échoue vite sans Chromium au lieu de rester suspendu ; avancement de l'étape 2 aligné sur `passerelle-par-site`.

* **Essai du hub sur l'hôte** : site `hote` inventorié ; passerelle sur 127.0.0.1, `dnsRebindingProtection` posé
  (hôte ou origine étrangers refusés) ; Claude Desktop par pont stdio appelle HOLARCH ; un conteneur la joint par
  `host.docker.internal` en se présentant `localhost` ; Q7 (Desktop MSIX), `Labels: null` Docker corrigé, Node ≥ 22.13.

* **Interface, quatrième revue** : la page en cours compte dans l'usage, une navigation dépassée n'écrase plus la
  page, modèles regroupés (intermédiaire signalé), coût « équivalent API » détaillé par type de tokens, taux d'échec MCP,
  outils refusés vers le Journal, `ui.viewed` hors du flux par défaut, Arbre filtrable et repliable d'un geste.

* **Sécurité de l'interface** : refus du DNS rebinding (hôte non local) et des écritures venues d'un autre site
  (origine), relevés par une revue et vérifiés avant correction.

* **Procédure de l'essai sur l'hôte** : `procedure-essai-hote.md`, pour une session lancée dans WSL ; écoute de la
  passerelle limitée à 127.0.0.1 (constat ajouté à l'essai).

* **Essai d'agentgateway** : fédération, journal sans arguments, `failOpen` contre la panne d'un serveur ; reste
  Desktop et le réseau sur l'hôte (`essai-agentgateway.md`).

* **Appels MCP au journal** : `tool.called` importé des transcriptions, connecteurs claude.ai et serveurs appelés au
  catalogue avec leur usage, carte au tableau de bord.

* **Serveur MCP de HOLARCH** : sept outils en lecture sur le SDK officiel v2, `holarch mcp`, `.mcp.json`.

* **Ouverture de l'étape 2** : recherche des passerelles MCP existantes ; décision `forme-etape-2` (serveur HOLARCH,
  appels MCP au journal, agentgateway après essai ; critère par lieu) ; spécification `etape-2-point-entree.md`.

* **Clôture de l'étape 1** : close sur sa livraison (décision `cloture-etape-1`) ; pages consultées au journal
  (`ui.viewed`, contrat événement 0.6.0) ; critère d'usage ouvert, mesuré en continu.

* **Système de design** : interface sur Pico CSS, servi en local (décision `interface-pico`).

* **Interface, troisième revue** : liens pour creuser d'une vue à l'autre, Journal par session et par famille, Arbre
  repliable, Catalogue triable, débordement de Sessions ; mémoires en lien plus comptées deux fois.

* **Identité et coûts** : projets identifiés par leur premier commit, `element.moved` (contrat événement 0.5.0,
  décision `identite-projets`) ; prix liste des identifiants `anthropic/…` ; coût par tour ; période au choix.

* **Interface, seconde revue** : histogramme daté, tris, doublons de mémoires, statut d'arbre au catalogue ; test
  visuel Playwright (`npm run test:visuel`).

* **Revue de l'interface** : barres de progression et barre latérale réparées, guillemet des hooks, descriptions
  coupées à la fin d'un mot avec « … », milliards en « Md », projet réel des mémoires (lu dans les transcriptions).

* **Refus et approbations** : refus d'outil au journal (`tool.denied`, contrat événement 0.4.0, décision `refus`) ;
  manifeste, principes, besoins fondateurs, registre des types et décision `sources-hote` approuvés, avis rendus point
  par point.

* **Relecture des nœuds de base** : registre des types aligné sur l'arbre réel (un contrat dérive aussi d'un besoin ou
  d'un contrat) ; P3 distingue la configuration du système (arbre) de celle d'une installation (site, hors dépôt).
* **Approbation** : décision `sources-hote` ; contrat fiche du catalogue 0.3.0 (kinds `container`, `volume`).

* **Sources de l'hôte** : adaptateurs Docker et Claude Desktop ; décision `2026-10-03-sources-hote.md` en brouillon
  (kinds `container` et `volume`), corrigée : l'hôte devient un second site plutôt qu'un proxy Docker ; configuration
  par site (`config.<site>.yaml`, `HOLARCH_SITE`) ; Q6 ouverte.

* **Approbations** : contrats événement, fiche du catalogue et acteurs, décision coût liste ; Q1 résolue
  (`decisions/2026-10-03-classification.md`) ; Q5 reportée à la première clé `config` d'un nœud.

* **Tarifs** : grille officielle relevée et citée (configuration du site, hors dépôt) ; coût liste calculé à
  l'indexation ; `cache_write_1h` dans le contrat événement (0.3.0) ; décision `2026-10-03-cout-liste.md` en brouillon.

* **Étape 1, première tranche** : spécification `conception/etape-1-voir.md` ; inventaire (Claude Code, dépôts Git, arbre),
  import des transcriptions Claude Code, journal JSON Lines par site, index SQLite, interface web en lecture, 8 tests ;
  contrats fiche et événement complétés (types `memory`, `instructions`, `plugin*`, champ `attributes`, `inventory.finished`).

* **Synchronisation** : décision (Q3 résolue) ; champ `site` dans les contrats événement et fiche (0.2.0).

* **Fondation** : dépôt créé ; architecture macro (`docs/architecture.md`) ; ligne directrice, manifeste, principes,
  besoins fondateurs ; registre des types ; contrats en brouillon (nœud, règle, fiche du catalogue, événement,
  acteurs) ; décisions fondatrices approuvées ; cinq questions ouvertes.
