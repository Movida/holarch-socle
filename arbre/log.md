# Journal de l'arbre

## 2026-10-06

* **Test visuel de la vue Projets** : passé dans le conteneur du socle après correction d'une attente du test (course
  entre deux pages) ; sur une copie des données réelles, la page s'affiche sans erreur, le « hors projet » vient
  surtout d'un dépôt retiré de la machine.

## 2026-10-05

* **Sessions vides** : le service d'accès distant d'un projet reprend sa dernière session (`--continue`) au lieu d'en
  créer une à chaque démarrage ; Q15 ouverte sur `--no-create-session-in-dir`.

* **Rattachement au projet** : décision `rattachement-projet` approuvée et appliquée (projet = notion unique, dépôt = son
  support) : module `projets`, lien `project` des fiches (contrat 0.4.0), `data.projets` (contrat événement 0.7.0), une
  seule attribution pour toutes les lectures. Règle de cohérence globale ajoutée à `CLAUDE.md`.

* **Vue Projets** (étape 3, tranche 2) : une session se rattache aux dépôts que ses appels d'outils ont touchés, y
  compris vus d'un conteneur (par le nom du dépôt, si la suite du chemin y existe) ; l'historique reçoit des
  `session.finished` complémentaires, rien n'est réécrit. Page « Projets » : étape en cours, reste, questions,
  décisions à approuver, activité 7 et 30 jours (coût partagé entre dépôts touchés), dépôt non commité, non poussé ou
  en retard ; outil MCP `projets`.

* **Ouverture de l'étape 3** : `etape-3-regles-projets.md`, tranches 1 (accès distant par projet) et 2 (vue
  Projets, Q14 résolue). Tranche 1 livrée : `holarch distant`, un serveur Remote Control par projet, à la demande.

* **Import vu de deux montages** : un même répertoire de transcriptions lu depuis un conteneur puis depuis l'hôte
  était importé deux fois (état et identifiants fondés sur le chemin absolu) ; ils se fondent désormais sur le chemin
  relatif au compte, l'état ancien est repris. Constaté sur un site réel : les événements en double ont été retirés
  du journal (exception au contrat, ajout seul, consentie par l'auteur ; journal sauvegardé avant), puis l'import
  corrigé n'a repris que ce qui manquait. Poste personnel branché : serveur HOLARCH pour toutes les sessions,
  inventaire et import horaires.

* **Clôture de l'étape 2** : close sur l'usage au travail (décision `cloture-etape-2`) ; retour sur le critère de
  l'étape 1 (une journée de consultation, mesure faussée par un défaut de branchement) : il n'est plus une condition ;
  l'usage attendu de l'interface est le suivi des projets (Q14). Le critère « ici » de l'étape 2 reste ouvert.

* **Pont du socle** (`holarch pont`, Q8) : reprend une session expirée, ferme la sienne en partant, lit la clé dans un
  fichier ; remplace `mcp-remote` pour Claude Desktop. **Q12** : la ré-identification au catalogue exige le même nom.
  Minuterie d'import horaire sur le site de travail.

* **Cibles ignorées par la passerelle** (Q9) : `system.degraded` tiré de son journal, signalé par `holarch etat` et la
  carte « Appels MCP » ; l'historique du jour réapparaît (verrou de l'index, coffre de secrets, saturation des bases).

* **Plusieurs comptes Claude Code par site** (Q11) : `comptes_claude_code`, compte dans les fiches et les événements,
  sessions et coût par compte dans `holarch etat`, compte présent mais non lu signalé ; les événements importés avant
  restent « non attribués » (journal en ajout seul). Test à deux comptes.

* **Essai du site de travail** : procédure exécutée de bout en bout (profil privé, site, passerelle protégée en service
  utilisateur, Claude Desktop et Claude Code, import du journal de la passerelle) ; quinze constats dans
  `essai-site-travail.md`, cinq questions ouvertes (Q8 à Q12) ; `procedure-site-travail.md` corrigée d'après
  l'essai (compte Claude Code, tarifs, empreinte de clé, `PATH` du service, script de lancement de Desktop, reprise après
  blocage). Serveurs de bases de données en conteneur permanent partagé (SSE) : plus de saturation, 4 sessions en 5 à 9 s.
  Défaut corrigé : l'index SQLite se reconstruisait sans attendre le verrou, et des serveurs HOLARCH lancés ensemble
  mouraient (test à plusieurs processus). Registre des connecteurs absorbé par le profil du site, plus d'entrée directe
  dans les clients ; Q6 résolue. Serveur de bases de connaissances fédéré sans préjuger de la brique Savoir (Q13) ;
  connecteurs à secrets en serveur partagé. Rien du travail dans le socle.

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
