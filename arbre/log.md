# Journal de l'arbre

## 2026-10-09

* **Tranche 12 : deux décisions, livraison A** : le brouillon `environnement-d-execution` réécrit en deux, à approuver :
  `partage-et-bac-a-sable` (P7 étendu à la part partageable d'un projet, §5.4 : une session distante est une
  exécution ; l'accès sur l'hôte vaut dérogation jusqu'à D) et `environnement-d-execution` (mise en œuvre, livraisons A
  à E, chacune avec son critère). Q27 résolue sans lancer de serveur, par l'aide lue dans le binaire 2.1.295 :
  `--[no-]create-session-in-dir`, incompatible avec `--continue`. A livrée : `acces_distant.session_au_demarrage`
  (`aucune` par défaut, `reprendre`), une valeur inconnue refusée avant d'écrire l'unité ou la confiance (94 tests
  verts) ; copie de service posée. Le service du poste garde son ancienne unité jusqu'à ce que l'auteur relance
  `holarch distant activer holarch-socle` (la relance coupe les sessions servies) ; critère de A à vérifier ensuite.
  Noms de projets personnels et chemin du poste, venus du brouillon, retirés à la demande de la garde avant commit.
  Leçon de clôture : déroulé annoncé (deux décisions, A, commits sans envoi) ; réalisé. Ce qui a fait dévier : une
  substitution sur un repère qui se répète dans le fichier (`Choix techniques (P12)`), qui l'a dupliqué, réparé avant
  commit ; la confiance déclarée avant le contrôle du réglage, vue à la relecture et corrigée avec son test.
  Modèle et effort inscrits par livraison, à la demande de l'auteur, d'après l'usage mesuré (Opus 5.5 seul, `high`
  presque partout) : `high` pour A et E, `xhigh` pour B, C et D, contre-épreuve en `xhigh`. La session tournait en
  `high`, pas en `medium` comme supposé.
  Puis, l'auteur passé en permissions manuelles, trois actions choisies parmi celles proposées : les deux décisions
  approuvées (P7 et §5.4 réécrits ; l'accès distant sur l'hôte vaut dérogation jusqu'à D), les commits envoyés sur
  `origin/main`, et la relance de l'accès distant lancée en dernier, puisqu'elle coupe cette session. B attend une
  session en `xhigh`.

* **Constats des contre-épreuves corrigés** (A à H, puis 1 à 5 d'une troisième) : dix commits avec un test qui
  reproduit chacun (93 tests verts), envoyés sur `origin/main` sur demande de l'auteur. `gitLu` (inventaire, contrôles
  de l'audit) lit un dépôt quelconque sans rien exécuter de ce qu'il déclare : crochets, filtres et pilotes (passés par
  `GIT_CONFIG_COUNT`, un nom à « = » compris), programmes de signature, transport d'un clone partiel, sous-modules ;
  `git` reste normal pour les dépôts de l'auteur (régression d'X2 sur les écritures levée) ; la lecture de l'inventaire
  s'appelle `gitInventaire`. Un type inconnu ne compte que les en-têtes illisibles qui pouvaient être lui (indices
  `type` et `id` lus ligne à ligne, sans conclure sur un conflit) ; les autres de l'arbre du projet deviennent un signal.
  Deux en-têtes du socle cités (texte inchangé, dont une décision `stable`). Copie de service non posée : la copie de
  travail porte le travail en cours d'une autre session (tranche 12).
  Leçon de clôture : déroulé annoncé (A à D, E et F, G et H, contre-épreuve, pose) ; réalisé jusqu'à la contre-épreuve,
  qui a trouvé deux bloquants de plus (transport et signatures), corrigés ; la pose n'est pas atteinte. Ce qui a fait
  dévier : une neutralisation pensée par constat plutôt que par liste de ce qu'un dépôt peut faire lancer, et une
  attente de test qui se reconnaissait elle-même. La demande qui y aurait mené : « corrige A à H, en partant de tout ce
  qu'une configuration de dépôt peut faire exécuter ».

* **Environnement d'exécution, tranche 12 ouverte** : partie d'une session « injoignable au démarrage » (cause :
  l'auteur était sur un autre compte claude.ai ; la chaîne tient : tâche Windows à l'ouverture de session, WSL 18 s
  après Windows, accès distant relancé seul après un échec à 07:23). L'auteur a demandé ensuite un poste qui ne
  s'éteint pas sous une session distante, puis des sessions qui travaillent dans leur conteneur, un environnement
  partageable avec des collègues et la carte graphique partagée. Mesures : accès distant sur l'hôte en mode `auto`
  (secrets de l'hôte visibles), `~/.claude` monté en entier par le modèle de conteneur, session reprise à 135 000 tokens
  contre 50 000 à 65 000, veilles et arrêts sur 14 jours, délai de réponse de l'auteur (98 % sous 15 min). Décision
  `environnement-d-execution` en brouillon (P7 et §5.4 précisés avec l'accord de l'auteur sur le principe, clé
  `conteneur`, accès distant dans le conteneur, démarrage sans session, veille retardée, type `calcul-gpu`) ; essais
  Q23 à Q27 avant tout code. L'usage de la carte graphique d'abord attribué à un autre projet était celui du
  projet three.js (tests de rendu).
  Découpage revu à la demande de l'auteur : la décision groupait des choix indépendants ; proposé en deux décisions et
  cinq livraisons A à E (avancement de l'étape 3), validé par l'auteur ; travail repris à la session suivante. Leçon de clôture : aucun déroulé annoncé à
  l'ouverture (diagnostic lancé d'emblée) ; ce qui a fait dévier : la cause hors du poste (compte claude.ai), puis un
  sujet élargi demande après demande, et un projet confondu (rattrapé par vérification). La demande qui y aurait mené
  directement : « voici mes objectifs pour l'environnement des sessions (isolement, partage, carte graphique, accès
  distant, veille) : propose une architecture dans HOLARCH ».

## 2026-10-08

* **Essai de Q15 avorté, sessions coupées** (soir) : l'essai demandait d'arrêter le service distant de holarch-socle
  puis de lancer un serveur à la main dans le même dossier. L'arrêt a coupé toutes les sessions qu'il servait, celle de
  l'essai comme la session de travail, ce que la consigne ne disait pas. Le serveur manuel a été refusé deux fois par
  claude.ai (409, `already served`), qui garde le dossier inscrit après l'arrêt et montre encore les sessions comme
  disponibles (Q22). Les relances de 21:15 et 21:18 venaient de l'auteur, à la demande de la session, pas du minuteur
  de réveil (écart d'une minute, sous le seuil). La relance a repris par `--continue` la session de travail, pas celle
  de l'essai, rouverte ensuite au terminal (`claude --resume`) ; rien de perdu, poste vérifié (87 tests verts,
  services actifs, interface servie, copie posée). Refait dans un dossier jetable (`~/essai-rc`) : Q15 résolue (oui :
  « Nouvelle session » fait choisir le dossier ; rien à changer au service, `--continue` suffit) ; Q22 en partie :
  arrêté par Ctrl+C, le serveur se désinscrit et se relance aussitôt, reste l'arrêt par SIGTERM. Claude Desktop montre
  les sessions distantes rangées par dossier : idée I33 (vue Projets recentrée sur ce qu'il ne donne pas).
  Leçon de clôture : déroulé annoncé (arrêter, lancer à la main, regarder sur le téléphone, relancer) ; ce qui a fait
  dévier : une question de mode imprévue, l'inscription gardée par claude.ai, et un essai monté sur le service qui
  servait la conversation en cours. La demande qui y aurait mené : « fais l'essai sans toucher au service du projet ».

* **Constats de la contre-épreuve corrigés** (suite de la séance ; X2 sur le choix de l'auteur : neutraliser les pilotes
  déclarés par le dépôt plutôt que refuser le dépôt, aucun dépôt du poste n'en déclarant) : neuf constats et un détail,
  dix commits avec un test chacun, 87 tests verts ; test visuel passé dans un conteneur jetable de l'image du socle.
  Seconde contre-épreuve par un sous-agent neuf : huit corrections complètes ; X2 et E2 incomplets (crochet
  `post-index-change` et filtre d'un sous-module encore exécutés, régression latente sur les écritures dans un dépôt à
  filtre local, en-tête illisible d'un projet sans rapport qui bloque, `erreur_entete` montrée nulle part), au Reste.
  Leçon de clôture : déroulé annoncé (corrections (2) à (9), X2 au choix de l'auteur, contre-épreuve, pose, puis le
  projet privé) ; réalisé jusqu'à la contre-épreuve, le projet privé n'est pas atteint. Ce qui a fait dévier : X2 étendu
  sans le dire de la lecture des dépôts tiers à toutes les commandes git, écritures comprises (la question posée portait
  sur l'inventaire), et le test visuel, qui a demandé de reconstituer un navigateur hors du conteneur. La demande qui y
  aurait mené : « corrige les constats ; X2 seulement pour ce que l'inventaire lit ».

* **Corrections courtes des garde-fous** (choix de l'auteur, avant la pose dans le projet privé) : X2, X3, N1 avec E1,
  E2, E3, un commit et un test qui reproduit chacune (`test/garde-fous.test.js`, 78 tests verts). Contre-épreuve par un
  sous-agent neuf avant de rendre (D) : X2 et E2 incomplets (un filtre de git déclaré en local s'exécute encore ; un
  en-tête YAML illisible efface toujours des règles en silence, tous deux reproduits), plus trois points à corriger et
  quatre mineurs ; laissés à la session suivante (contexte au-delà du seuil). Test visuel non passé (pas de Chromium sur
  l'hôte). Leçon de clôture : déroulé annoncé (état des lieux, synthèse, type et règles, pose, corrections) ; réalisé
  jusqu'à la synthèse, puis les corrections avancées par l'auteur ; la pose n'est pas atteinte. Ce qui a fait dévier :
  le choix de l'auteur de corriger d'abord, et la contre-épreuve qui a trouvé deux corrections incomplètes, ce que la
  relecture seule de l'agent n'avait pas vu.

* **Autres éléments proposés pour le projet privé** (question de l'auteur ; il retient les cinq recommandés) : alléger ses documents
  d'état (19 % de la dépense à relire le dépôt), mesurer ses sous-agents (56 %), regarder moins d'images, sous-ensemble
  rapide de ses vérificateurs de tailles dans sa vérification, tests tirés des redites (cohérence entre scènes, parité
  à plusieurs tailles d'ordinateur, place d'un contrôle), clavier et mouvement réduit, Lighthouse CI, crochet de
  démarrage (récupérer, démarrer et vérifier le serveur), scripts de capture dans le dépôt, déclaration du projet et ses
  trois écarts. Recommandés : documents d'état, vérificateur rapide, tests des redites, crochet de démarrage, déclaration.

* **État des lieux P2 de l'outillage d'interface (C)** (décision `revue-page-blanche`) : deux sous-agents en lecture,
  chiffres porteurs revérifiés. Le projet privé le plus coûteux n'a aucune régression visuelle automatique ; 73 % des
  images regardées sont des captures jetables hors du dépôt ; ses bons vérificateurs d'interface restent hors de sa
  vérification d'ensemble. Choix de l'auteur : adopter la comparaison d'images native de Playwright, une skill `verify`
  du projet (lancée par Claude Code avant chaque commit), un sous-agent relecteur UX, un essai de Playwright CLI ;
  règles dans l'arbre du projet (type au deuxième projet web) ; corrections courtes des garde-fous d'abord.

* **Revue page blanche (B4)** (demande de l'auteur : couvrir tout le code, prendre de la hauteur) : passe par famille
  sur tout `src/` (N, C, R, M à l'avancement, seconde vague en cours) et revue de hauteur par un sous-agent neuf. Aucune
  étape close sur son critère, l'outil sert surtout à se construire, P2 peu appliqué à ce qui écrit chez les autres.
  Décision `revue-page-blanche` approuvée : critère de l'étape 3 tenu, module pour l'UX/UI du projet privé le plus
  coûteux en premier (après un état des lieux P2), puis corrections avec contre-épreuve par tranche. Idée I31 (parcours
  de l'arbre dans les deux sens, idée de l'auteur).

* **Idée I30, banc par modèle** (idée de l'auteur) : rejouer les cas de référence avec et sans chaque règle à chaque
  nouveau modèle, pour retirer ce qui est devenu natif ; retenue pour l'étape 4, rien construit.

* **Annonce unique des sessions coupées** (choix de l'auteur) : la question de 12 h 20, tranchée le soir même, revenait
  à chaque reprise (trois annonces). Une coupure n'est plus annoncée quand une autre session du dossier s'est ouverte
  après elle (elle l'a reçue à sa reprise) ; sans état à tenir, lu au début des transcriptions ; 1 test qui reproduit le
  cas.

* **Q19 résolue** (mesure) : RTX 5070 Ti de 16 Go visible depuis WSL. Envoi de f91dffb (accord de l'auteur).

* **Corrections de la passe globale** (choix de l'auteur) : A1 à A5, A7, A8 corrigés avec un test chacun, T1 à T3
  écrits (70 tests verts). Trouvé en route : un inventaire lancé depuis le crochet de commit lirait les autres dépôts
  avec l'index du commit en cours ; la garde relit donc l'arbre seul, en mémoire. A6 : décision `routines-posees`
  approuvée telle quelle (une routine coupée à la main reste coupée à la pose du service), corrigée avec un test.

* **Passe globale** (accord de l'auteur) : trois relectures du code écrit depuis `a9c40e6` ; huit défauts réels sur des
  chemins qui écrivent ou décident (A1 à A8 dans l'avancement), trois tests prioritaires manquants, trois contrats en
  usage jamais approuvés. Corrections choisies par l'auteur (A1 à A5, A7, A8, T1 à T3 ; A6 par décision), puis une passe
  plus profonde par famille de défaut. Envoi de Q21 et I29 (accord de l'auteur).

* **Sessions arrêtées en route (I29)** (accord de l'auteur) : la reprise annonce les sessions du même dossier, dans les
  24 h, finies sur un appel d'outil sans résultat, avec la question restée sans réponse (une session du matin, coupée par
  une veille puis le redémarrage de l'accès distant) ; 8 cas sur 309 sessions en 30 jours ; 1 test.

* **Q21 résolue** : deux veilles du poste vues par le minuteur `holarch-reveil` et suivies d'un redémarrage ; projet
  joignable ensuite depuis l'application (constaté par l'auteur).

* **Catalogue relu quand l'arbre change (I28)** (choix de l'auteur) : `holarch regles`, `audit`, `recolte` et la reprise
  refont l'inventaire avant de lire quand un fichier d'un arbre connu est plus récent que le catalogue (comparaison
  des dates seules, inventaire sans audit ni import) : 0,62 s au lieu de 0,31 s quand il a changé ; 1 test qui
  reproduit le cas. L'interface et le serveur MCP lisent encore le catalogue de l'heure.

* **Idée I28** (accord de l'auteur) : `holarch regles` lisait un catalogue périmé après une règle ajoutée, jusqu'à
  un inventaire à la main ; notée dans la boîte, pas corrigée.

* **Forme des réponses (I11)** (idée de l'auteur, élargie) : réglages de sortie déclarés au profil, écrits en style de
  sortie de Claude Code ; une seule redite de forme en 30 jours (choix cliquables). Rien construit : l'auteur attend la
  récolte du 2026-10-12. Envoi du socle et du second projet (accord de l'auteur).

* **Défaut à l'usage (I3)** (choix de l'auteur) : sur 7 défauts consignés depuis l'étape 2, tous de code et presque
  tous corrigés avec un test, un seul revenu : le `PATH` réduit d'un service, quatre fois avant sa mise en commun. Pas
  de mécanisme ; règle `defaut-a-l-usage` proposée au type `methode-holarch` (test qui reproduit le défaut, règle ou
  contrôle en brouillon quand la cause peut toucher ailleurs), environ 300 caractères par tour. Approuvée telle quelle
  par l'auteur, écrite dans le socle et dans le second projet (`regles appliquer`).

* **Permissions par projet (I26) non construites** (avis suivi par l'auteur) : sur 7 jours, 37 refus d'approbation,
  tous dans un banc d'essai du 2026-10-03 ; les 446 de 30 jours viennent surtout du projet antérieur, en `acceptEdits` ;
  le reste sont des garde-fous voulus. Suite : I3, une règle ou un contrôle proposé à chaque défaut trouvé à l'usage.

* **Statuts des huit brouillons du profil écrits** (mode manuel, chaque écriture approuvée par l'auteur) : 4 règles
  approuvées (`reformuler-avant-de-decider`, `donner-la-commande-systematiquement`, `verifier-avant-depense-api`,
  `agents-paralleles`), 4 refusées ; l'audit voit les 4 fichiers de règle à écrire au compte.

* **Règles sur déclencheur abandonnées** (avis suivi par l'auteur) : les rappels pèsent 2 % du contexte relu par tour ;
  charger les deux seules règles à déclencheur net (envoi, commit) n'en ôterait que 0,07 %, et un texte injecté avant un
  outil arrive après lui. Rien construit ; le levier reste l'oubli progressif (I27).

* **Coût des rappels** (accord de l'auteur) : décision « règles sur déclencheur » à proposer en premier (mesure des
  rappels à déclencheur net ; chargement sur action à construire) ; oubli progressif retenu en idée I27 (étape 5).

* **Récolte hebdomadaire** (accord de l'auteur) : minuteur `holarch-recolte` le lundi, posé par la copie de service.
  Huit brouillons du profil : 4 à approuver, 4 à refuser (I26) ; écriture des statuts refusée à l'agent par le
  garde-fou, à faire par l'auteur. Envoi du socle et du profil (accord de l'auteur).

## 2026-10-07

* **Tranche 11 livrée** (récolte) : décision `recolte` approuvée telle quelle ; `holarch recolte --proposer` écrit les
  redites nouvelles en règles brouillon au nœud commun de leurs sources, la reprise les annonce. Première passe : 7
  règles proposées au profil, une contradiction tranchée par l'auteur (reformuler la demande avant de décider).

* **Rejeu de la récolte** (tranche 11, point 2) : sur l'historique d'avant le 6, 7 puis 8 consignes attendues sur 8
  retrouvées en deux passes, 2 fausses alertes sur 20 (exigences de produit), 0,25 $ la passe ; avec les règles
  connues, 12 redites sur 28 rattachées à une règle existante. Décision `recolte` proposée en brouillon.

* **Tranche 11 ouverte** (récolte, choix de l'auteur) : détecteur livré, `holarch recolte` ; consignes reformulées,
  donc regroupées par `claude -p` (une mesure lexicale n'en trouve aucune) ; à blanc : 578 messages, 28 mémoires de
  retour sur 30 jours. Suite : rejeu avant le 2026-10-06.

* **Reprise de l'accès distant après une veille** (tranche 1 de l'étape 3) : le serveur Remote Control restait en vie
  mais injoignable après une mise en veille du poste ; minuteur `holarch-reveil` et `holarch distant reveil`, qui
  redémarre les accès distants actifs après un écart de plus de cinq minutes. Essai réel à faire (Q21).

* **Idée I25 retenue** par l'auteur ; envoi des commits du socle (accord de l'auteur).

* **Mesure intermédiaire de la passation** (tranche 7) : sessions commencées après sa pose (8, 651 tours) : contexte
  relu par tour 137 k contre 239 k sur les 7 jours d'avant (19 sessions), 2 sessions au-dessus du seuil contre 10 ;
  échantillon court, critère toujours le 2026-10-14. Idée I25 proposée (décisions remises en cause sur mesure).

* **Copie de service** (idée I16) : décision `copie-de-service` approuvée telle quelle ; `holarch service poser` pose
  une copie du socle tirée d'un commit vérifié, que lancent l'import, l'interface, les crochets, le serveur MCP et la
  garde. Posée sur le poste (accord de l'auteur) ; critère tenu avec la copie de travail cassée.

* **Type `projet-dormant` approuvé** par l'auteur ; envoi du socle, du profil et d'okf-bundle-template (accord de
  l'auteur).

* **Migration des projets non déclarés terminée** : okf-bundle-template déclaré par la commande (accord de l'auteur),
  types `depot-public` et `projet-dormant` (nouveau, en brouillon : ni conteneur ni accès distant) ; `arbre/` retiré à
  l'instanciation du template ; `NOTICE` soustrait au contrôle par `depot-public`. Défaut corrigé : l'audit tient
  aussi pour public un projet que ses couches déclarent public (choix de l'auteur) ; audit conforme.

* **okf-phoenix retiré** : supprimé sur GitHub par l'auteur, dossier local supprimé après vérification de la
  sauvegarde. okf-bundle-template à blanc : identité locale à retirer par l'auteur ; conteneur et accès distant en
  question pour un projet peu actif.

* **pacs-montage-video retiré** (choix de l'auteur) : sortie et retour d'expérience gardés dans les vidéos de
  Windows, le reste supprimé. Profil hors de la liste des projets (avis partagé). Exception de la LICENSE portée par le
  type `depot-public` (accord de l'auteur).

* **Envoi** des commits du profil et du socle (accord de l'auteur). okf-phoenix sauvegardé ; sa suppression sur GitHub
  est refusée par une règle `deny` du compte, valable dans tous les modes : à faire par l'auteur depuis GitHub.

* **Idée de l'auteur** (I24, boîte à idées) : réglages des dépôts local et distant paramétrables ; mesure : 8 dépôts
  GitHub aux valeurs par défaut, seule la visibilité varie ; avis : pas avant un premier réglage voulu. Envoi de 4
  commits (profil, socle) et suppression d'okf-phoenix en attente de l'auteur.

* **Tranche 10 livrée** (création de projet) : `holarch projet creer`, huit étapes rejouables, à blanc sans écriture ;
  clé de déploiement en geste réservé (choix de l'auteur) ; clé `creation` (contrat config 0.3.0) portée par les types ;
  critère au prochain vrai projet. Règle `lecon-de-cloture` inversée (décision du profil approuvée), écrite au compte.

* **Retrait de deux projets** (okf-phoenix, okf-bundle-template, accord de l'auteur) : suppression d'okf-phoenix
  refusée par la permission de l'outil, à lancer par l'auteur ; okf-bundle-template gardé (auteur),
  encore utilisé par un projet actif. Règle `lecon-de-cloture` à inverser (plan annoncé à l'ouverture), décision à écrire.

* **Décision `creation-de-projet` approuvée** telle quelle ; okf-phoenix et okf-bundle-template périmés (auteur), à
  retirer, portée à préciser.

* **Tranche 10 ouverte** (création de projet) : décision `creation-de-projet` proposée, sur la mesure des 9 dépôts
  (oublis rattrapés de 1 à 158 jours, quatre projets non déclarés) ; deux identités locales non anonymes relevées.

* **Tranche 10 choisie** (création de projet, choix de l'auteur sur mesure : environ un projet par semaine, critère de
  l'étape) : une commande d'abord ; formulaire de l'interface (I22) et paramétrage depuis l'interface (I23) dans la
  boîte.

* **Décision `relancer-interface` approuvée** telle quelle : règle `verifier-avant-de-rendre` étendue à la relance de
  l'interface en service, écrite dans le projet (`regles appliquer`) ; audit du socle conforme.

* **Interface relancée** à la demande de l'auteur ; décision `relancer-interface` proposée (la règle
  `verifier-avant-de-rendre` étendue à la relance du service) ; idée I21 (demandes répétées de l'auteur, proposées en
  skill) dans la boîte.

* **Boîte à idées lue** : la phase visée commence par l'étape (choix de l'auteur) ; la reprise et la vue Projets
  montrent les idées de l'étape en cours, 11 pour l'étape 3.

* **Idées de l'auteur** (boîte à idées) : I19, autorisation d'envoi paramétrable (décision à prendre, elle touche une
  règle approuvée) ; I20, petits modèles locaux spécialisés, avis donné, deux faits à compléter.

* **Boîte à idées** (accord de l'auteur) : registre `arbre/idees.md`, 18 idées reprises du Reste avec leur phase
  visée ; lecture par la reprise et la vue Projets à faire.

* **Idées retenues** (skills qui évoluent, charte UI/UX, travaux déterministes) pour leur phase ; boîte à idées
  proposée (registre `arbre/idees.md`), à décider ; étape 3 à clore après la mesure du 2026-10-14 (accord de
  l'auteur). Envoi des 3 commits de la tranche 9 ; interface relancée, elle sert les échecs.

* **Idées de l'auteur** : skills ajustés aux habitudes, charte UI/UX paramétrable, automatisation par outil
  déterministe quand le gain est mesuré ; avis donné, à décider (avancement, Reste).

* **Échecs au journal** (tranche 9 close) : erreurs d'outil, tests rouges, refus de la garde et refus d'approbation
  au journal, comptés au tableau de bord et sur la carte d'un projet ; 30 jours sur le poste : 1 007 échecs, dont 226
  tests rouges sur 1 242 (199 invisibles au code de sortie), et 450 refus d'approbation, à 2 près d'une mesure
  indépendante ; un vrai refus de la garde vu au journal.

* **Tranche 9 ouverte** (échecs au journal) : décision `echecs-au-journal` proposée ; mesure sur 30 jours : 338 refus
  de permission non reconnus, 22 des 24 tests rouges du socle invisibles au code de sortie.

* **Règles approuvées** : `commits-pousses` et `reglage-mesure` (profil) ; contrôle actif, aucun écart. Incident :
  `regles appliquer --help` lancé pour voir l'aide (contraire à `outil-verifie`), rien n'a été écrit.
  `reglage-mesure` écrite au compte ensuite (accord de l'auteur).

* **Habitudes (a, b)** : leçon de clôture demandée par l'avis de passation seulement quand sa règle s'applique ;
  contrôle `commits-pousses` (écart au-delà de 4 h, branche sans amont non disponible), règle de profil proposée.
  Seuil confirmé par la mesure du délai d'envoi (90 % des envois en moins de 0,4 h dans le socle, de 10,6 h dans un
  autre projet). Idée de l'auteur : réglages proposés d'après les habitudes ; règle `reglage-mesure` proposée,
  mécanisme placé avec la récolte.

* **Habitudes paramétrables** : leçon de clôture de l'avis de passation à rattacher à sa règle, contrôle des commits
  non poussés, règles « choix cliquables » et « défaut à l'usage » retenus par l'auteur (avancement, Reste) ; un
  `core.hooksPath` vers un chemin de conteneur retiré, crochet posé.

* **Identité de commit** (tranche 8 close) : identité déclarée au profil, posée en réglage local là où elle diffère,
  gardée au commit (règle `identite-de-commit`, bloquante) et à l'audit ; cinq projets déclarés gardés ; un réglage à
  la main divergent signalé puis résolu ; un crochet impossible à poser ne bloque plus `regles appliquer`.

* **Tranche 8 approuvée** : décision `identite-par-contexte` approuvée ; Q18 résolue (identité fixe par contexte,
  adresse anonyme GitHub du compte de chaque contexte) ; idée « échecs » placée en tranche 9.

* **Idée de l'auteur** : identifier les échecs, puis chercher des solutions ; avis donné, à décider (avancement, Reste).

* **Tranche 8 ouverte** (configuration, identité de commit) : décision `identite-par-contexte` proposée ; Q18 ouverte.

* **Intégration continue** d'un projet détectée par l'inventaire, montrée sur sa carte et dans le résumé de reprise.

* **Reprise après `/clear`** constatée (tranche 7) ; l'état du dépôt dans le résumé se lit en direct, celui de
  l'inventaire pouvait dater d'une heure. Reste la mesure du 2026-10-14.

* **Passation** : avis constaté en vraie session ; compaction avancée retirée (avis de l'auteur) ; règles de profil
  `lecon-de-cloture` et `proposer-automatisations` approuvées ; « profil de travail » proposé, non retenu pour l'instant.

* **Économie du contexte** (tranche 7, décision `passation-sereine`, idée de l'auteur) : au-delà de 150 000 tokens,
  avis de passation (arbre à jour, puis `/clear`) ; reprise sur un résumé du projet au démarrage ; compaction à 300 000
  en filet ; réglages de Claude Code posés depuis le profil ; mesure au tableau de bord. Registre de configuration
  créé (Q5 résolue). Mesure de l'effet le 2026-10-14.

* **Consolidation** (tranche 6) : briques communes, matérialisation et audit en modules propres, réglages des
  contrôles ; relecture adverse par un sous-agent (une régression trouvée et corrigée) ; comportement inchangé sur le
  site réel. Registre des clients et superviseur interchangeable écartés tant qu'un seul client et un seul système.

* **Veille de sécurité et de versions** (tranche 5) : décision `veille-securite-versions` ; contrôles des dépendances
  vulnérables (osv-scanner, gravité élevée ou critique) et des versions des outils du poste, interrogés une fois par
  jour ; deux règles de profil approuvées, trois projets déclarés ; premier audit : 27 paquets à failles. Une mise à
  jour de dépendance critique a résolu son écart : tranche close.

* **Interface depuis le téléphone** : l'interface admet un relais HTTPS de réseau privé déclaré par son nom
  (`web.hotes_admis`) ; `holarch interface` la tient en service ; publiée par Tailscale Serve sur le poste personnel.

* **Audit de conformité réalisé** (tranche 4 close) : contrôles des règles (données personnelles, secrets par
  gitleaks, journal tenu), audit après chaque inventaire avec écarts au journal, crochet `pre-commit` de git, lectures
  de secrets refusées au compte. Trois règles passées du rappel au contrôle avec l'accord de l'auteur ; `LICENSE`
  soustrait au contrôle ; essais réels réussis (commit refusé, forcé puis vu et résolu, faux secret refusé, `.env`
  illisible).

* **Audit de conformité** (étape 3, tranche 4) ouvert : décision `controles-de-regles` approuvée sur quatre choix de
  l'auteur (liste privée déduite et complétée par le profil, crochet `pre-commit` de git et permissions de Claude Code,
  gitleaks pour les secrets, écarts au journal) ; contrats règle 0.3.0 (`check`) et événement 0.8.0 (`rule.resolved`).

* **Règles approuvées** : les 18 règles de la tranche 3 (profil, types `methode-holarch` et `depot-public`, socle)
  approuvées par l'auteur, une à une, sur avis ; trois retouches (deux doublons retirés, mémoire remplacée déclarée).
  Puis appliquées avec son accord : 4 au compte, 14 au socle, 7 au second projet ; cinq mémoires couvertes retirées,
  `CLAUDE.md` réduit à ce qui est propre au socle. Tranche 3 close sur son critère.

* **Règles ajoutées au profil** (sur proposition, approuvées) : `outil-verifie`, `sessions-concurrentes`,
  `secrets-hors-contexte`, chacune née d'un fait de la session. La ligne de commande refuse une option inconnue avant
  d'agir et affiche l'aide sur `--help` (une commande lancée « pour voir l'aide » avait écrit des fichiers).

* **Second projet d'essai** : une autre personne travaille sur sa branche principale ; les commits d'essai de HOLARCH
  (type déclaré, règles générées) vivent sur une branche dédiée, poussée, que le clone local garde extraite.

## 2026-10-06

* **Arbre des règles, réalisation** (tranche 3) : règle effective calculée (profil, contexte, types, projet ;
  provenance, dérogations, règles non dérogeables), écrite pour Claude Code dans `~/.claude/rules/holarch/` et
  `.claude/rules/holarch/` (fichiers marqués, retirés quand leur règle disparaît) ; `holarch regles`, page « Règles »,
  outil MCP. Types transverses `methode-holarch` et `depot-public`, règles du socle, profil et second projet branchés ;
  toutes les règles en brouillon, en attente d'approbation.

* **Arbre des règles** : décision `arbre-des-regles` proposée (draft) d'après la consigne de l'auteur : profil en
  racine des règles, socle en types transverses (`methode-holarch`, `depot-public`), appartenance d'un projet déclarée
  par son contexte (lien côté le plus fermé), règles matérialisées dans les portées de Claude Code ; approuvée par
  l'auteur. Q16 (second projet d'essai) et Q17 (dépôt du profil, créé) résolues.
  Conséquences appliquées : contrats nœud et règle 0.2.0, registre des types 0.2.0 (`template`), architecture §5.2,
  portée de la décision `classification`. Tranche 3 spécifiée d'après une récolte des consignes (mémoires, `CLAUDE.md`).

* **Cartes projet** : à leur hauteur naturelle (avis de l'auteur).

* **Test visuel de la vue Projets** : passé dans le conteneur du socle après correction d'une attente du test (course
  entre deux pages) ; sur une copie des données réelles, la page s'affiche sans erreur, le « hors projet » vient
  surtout d'un dépôt retiré de la machine. Avis de l'auteur : ce dépôt est un projet antérieur distinct, il reste hors
  projet ; la tranche 2 est close à l'usage.

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
