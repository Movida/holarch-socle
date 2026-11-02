---
type: decision
title: Les services du poste, membres du hub par des capsules
description: "Comment un service du poste qui ne parle pas MCP devient lisible depuis une session ou une page : une capsule en lecture seule, fédérée par la passerelle comme holarch et okf-hub ; un seul contrat commun, l'outil `etat` à sortie déclarée."
status: draft
links:
  derives_from: [/arbre/conception/etape-2-point-entree.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-03-passerelle-par-site.md, /arbre/decisions/2026-10-03-sources-hote.md, /arbre/decisions/2026-10-14-sorties-mcp-des-chiffres.md]
  supported_by: [/arbre/conception/essai-agentgateway.md]
---

# Les services du poste, membres du hub par des capsules

**Contexte (2026-11-02, I46).** L'auteur a refusé qu'un script de sauvegarde dépose un fichier d'état pour qu'une page
le lise : ce serait greffer au script une action hors de son rôle. Le manque est plus général : aucun moyen standard de
lire l'état d'un service du poste (sauvegardes, tâches planifiées, contrôle de santé). Une proposition rédigée dans un
fil claude.ai part d'un constat juste : la passerelle du poste fédère déjà `holarch` et `okf-hub` (I42), et un serveur de
plus s'y déclare par une entrée de sa configuration, au profil. Elle appelle « capsule » un petit serveur MCP qui parle
à un service par son interface native, et demande un contrat commun.

Faits relevés :

- `holarch_etat` existe : un bilan d'usage sur une période (inventaire, sessions, coût, dégradations de la passerelle),
  pas un état normalisé. `sorties-mcp-des-chiffres` permet d'y ajouter des champs, pas d'en renommer.
- Le serveur MCP de holarch annote déjà ses outils (`readOnlyHint`, `destructiveHint`, `src/mcp/serveur.js`) ; le SDK
  du socle (`@modelcontextprotocol/server` 2.3.0) publie un schéma de sortie (`outputSchema`) et valide chaque réponse
  contre lui (code du paquet).
- Le catalogue ne voit pas les cibles de la passerelle : elles n'apparaissent qu'au journal, par l'import de celui de la
  passerelle (`tool.called`, `system.degraded`). L'écart à P4 est déjà ouvert pour `okf-hub`.
- Le socle dit « non disponible » pour un état qu'il ne peut pas établir (contrôles, audit).

**Avis.**

| Voie | Pour | Contre |
|---|---|---|
| **Capsules membres du hub, contrat réduit à l'outil `etat`** | rien à construire autour : la passerelle fédère, filtre et journalise ; une capsule se retire sans que le service le remarque ; la sortie de `etat` se vérifie par son schéma | une capsule n'a pas de mémoire : elle dit l'état présent, pas depuis quand |
| La proposition telle quelle : description de capsule maison, outil `_metriques`, statut `inconnu` | tout est prévu d'avance | la description refait ce que MCP porte (nom et version à l'initialisation, risque dans les annotations) ; `_metriques` sans lecteur (P8) ; un second mot pour « non disponible » |
| Un adaptateur de plus dans l'inventaire de HOLARCH, comme `sources-hote` | historique et alertes au journal, sans nouveau serveur | HOLARCH déborde l'usage de Claude et dépend de chaque service ; aucune action possible plus tard |
| Le service dépose un fichier d'état | rien à écrire côté MCP | refusé par l'auteur le 2026-11-02 : le rôle du service est tordu |

La première est recommandée. La troisième reste la voie de l'historique s'il vient à manquer (« Ce qui le ferait
changer »).

**Décision.**

| Point | Choix |
|---|---|
| Membre du hub | un serveur MCP fédéré par la passerelle d'un site. Deux sortes : un service qui parle MCP lui-même (`holarch`, `okf-hub`), ou une capsule |
| Capsule | un serveur MCP qui parle à **un** service par son interface native (commande à sortie JSON, API, journal lu) et ne fait rien d'autre : elle ne stocke rien, ne modifie ni le service ni sa configuration, se retire sans qu'il le remarque ; lecture seule sur les disques de l'hôte (`sources-hote`) |
| Contrat commun | chaque membre expose un outil `etat` (préfixé par la passerelle : `<membre>_etat`), sortie déclarée par `outputSchema`, rendue en `structuredContent` et en texte JSON pour les clients qui ne lisent que le texte : `statut` (`ok`, `alerte`, `panne`, `non disponible`), `derniere_activite` (horodatage ISO ou `null`), `resume` (une phrase) ; tout autre champ est libre, propre au membre. Contrat `etat-de-membre` 0.1.0, écrit à l'approbation |
| Description | aucune description maison : nom et version viennent de l'initialisation MCP, le risque des annotations des outils, que la passerelle transmet telles quelles |
| Composition | chez le client (agent, page) ; un membre n'en appelle jamais un autre ; la passerelle reste le seul point de politique et de journal (P4, P6). Une capsule qui agrège d'autres membres seulement quand une même composition revient, mesurée |
| `holarch` | `etat` garde sa forme, gagne `statut`, `derniere_activite`, `resume` (ajout de champs) et son schéma de sortie ; le statut se tire de ce que `etat` calcule déjà (âge du dernier inventaire, dégradations de la passerelle), seuils fixés en tranche 1 sur une mesure |
| `okf-hub` | autre projet : l'outil `etat` lui est proposé dans son dépôt, hors de cette décision |
| Code des capsules | un dépôt dédié **privé** (choix de l'auteur, 2026-11-02), créé par `holarch projet creer` ; ce qui est propre au poste (chemins, dépôts de sauvegarde) dans la configuration du profil (P3, P7) ; Node ≥ 22.13 et le SDK MCP du socle, déjà sur le poste (P12) |
| Portabilité | une capsule ne dépend que de l'interface de son outil (commande et sortie JSON) : son code est le même sous Windows, Linux, macOS, ou de WSL vers Windows ; ce qui varie d'un système à l'autre (emplacement du programme, dossier de lancement, source d'un secret) vit dans la configuration du site (P3, comme `sources-hote`) ; un service propre à un système (tâches planifiées) garde le contrat `etat` et a une mise en œuvre par système, choisie par la configuration, `non disponible` ailleurs ; les tests passent par un faux programme, sur tout système (choix de l'auteur, 2026-11-02) |
| Ordre | les sauvegardes, puis les tâches planifiées et le contrôle de santé ; un squelette commun extrait au deuxième cas ; un moteur déclaratif (commande décrite → outil) seulement au troisième, si les cas se ressemblent |
| Catalogue | les cibles de la passerelle s'inventorient depuis sa configuration (emplacement désigné par la configuration du site), ce qui ferme l'écart à P4 pour tous les membres ; après la première capsule |
| Hors de ce lot | le gestionnaire de mots de passe : même sans valeurs, les titres de ses éléments sont des données personnelles, à classer (P6) avant toute exposition ; tout outil qui écrit (lancer une sauvegarde), refusé par son nom dans la passerelle ; l'exposition de la passerelle hors du poste (tunnel, OAuth). Chacun par une décision à part |
| Secrets | jamais en argument ni dans une réponse ; un secret d'exécution vient d'un emplacement du profil ou du gestionnaire de mots de passe, jamais d'un dépôt |

**Raison.** La passerelle fait déjà la fédération, le filtrage et le journal (P2) ; le seul manque est une forme
commune pour dire si un service va bien, et MCP sait déclarer cette forme.

**Ce qui le ferait changer.** Une question d'historique (« depuis quand ») posée sur un membre : l'inventaire horaire
appelle alors les `*_etat` au travers de la passerelle et les journalise, sans second adaptateur. Des identifiants
de la session Windows illisibles depuis WSL (Q39) : le même code tourne alors directement sous Windows, et la passerelle
le joint en HTTP plutôt qu'en stdio (Node sous Windows, programme lancé à l'ouverture de session, port local protégé par
une clé, chemin réseau de WSL vers Windows) ; la décision se revoit sur le lancement, pas sur le contrat.

**Vérifications (tranche 0, 2026-11-02).** Faits tirés de pages ouvertes et du code d'agentgateway au tag v1.6.0, par
deux sous-agents ; les trois points sur la passerelle relus dans le code par l'agent principal.

| # | Question | Résultat |
|---|---|---|
| 1 | Une capsule lancée par le service systemd de la passerelle (WSL) joint-elle les programmes Windows des services et les identifiants de la session Windows ? | oui pour les programmes : une unité transitoire du gestionnaire systemd de l'utilisateur (`systemd-run --user`, le cadre du service de la passerelle) a lancé `cmd.exe`, qui a rendu la version de Windows (essai de l'auteur sur le poste, 2026-11-02). Deux contraintes pour la capsule : le dossier courant hérité est un chemin de WSL, que `cmd.exe` refuse (chemin UNC) avant de se replier sur le dossier de Windows, avec un avertissement, donc un programme Windows se lance depuis un dossier Windows ; les messages de `cmd.exe` sortent dans la page de codes OEM, pas en UTF-8, donc la capsule lit les sorties JSON des outils, pas leurs messages. Les deux outils de sauvegarde ne sont pas dans le `PATH` vu de ce cadre. [À COMPLÉTER : leurs chemins, et l'accès aux identifiants de la session Windows (Q39)] |
| 2 | Les outils de sauvegarde listent-ils leurs instantanés sans nouveau secret ? | l'outil du dépôt local garde le mot de passe dans le Gestionnaire d'identifiants Windows (forum de l'outil, propos d'utilisateurs) ; hors de la session (tâche planifiée, SSH), des utilisateurs disent qu'il le redemande. L'outil du dépôt distant exige le mot de passe à chaque commande (fichier ou commande, documentés). [À COMPLÉTER : essai sur le poste (Q39)] |
| 3 | Serveurs MCP existants (P2) | aucun trouvé pour l'outil du dépôt local ; pour celui du dépôt distant, un seul candidat en lecture seule, d'un particulier, publié le 2026-10-23, sans usage connu, à relire avant de le préférer à une capsule écrite ; le serveur officiel du gestionnaire de mots de passe ne couvre pas les coffres et a des outils qui écrivent ; adaptateurs génériques « commande → outil » : un seul sérieux sur la sécurité, en Python, version 0.1.0 |
| 4 | Filtrer les outils dans la passerelle | `mcpAuthorization` (règles CEL `allow`, `deny`, `require`) dans les politiques de la section `mcp`, pas par cible ; variables de l'outil : `mcp.tool.target`, `mcp.tool.name` ; la règle filtre `tools/list` et l'appel. Aucun filtre sur les annotations : un outil qui écrit se refuse par son nom |
| 5 | Schéma de sortie et annotations au travers de la passerelle | `merge_tools` (`crates/agentgateway/src/mcp/handler.rs`) ne change que le nom de l'outil : `outputSchema` et `annotations` passent ; rien ne réécrit `structuredContent` (lecture du code, à confirmer par un appel réel en tranche 1) |
| 6 | Cible stdio | `cmd`, `args`, `env`, `clear_env` (`crates/agentgateway/src/types/agent.rs`) ; aucun dossier de travail : la capsule n'en dépend pas, ou se lance par un petit lanceur |

**Conséquences.** À l'approbation : contrat `etat-de-membre` 0.1.0. Tranche 1 : vérifications 1 et 2 sur le poste ;
dépôt des capsules créé ; capsule des sauvegardes ; `etat` de holarch complété ; capsule déclarée dans la configuration
de la passerelle (profil) ; essai sur le poste. Critère : depuis une session reliée au poste, `<capsule>_etat` rend la
date et l'état du dernier instantané de chaque dépôt de sauvegarde, sans qu'aucun script de sauvegarde ait changé ni
qu'aucun fichier intermédiaire soit écrit.
