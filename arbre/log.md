# Journal de l'arbre

## 2026-10-03

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
