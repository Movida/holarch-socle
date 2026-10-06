---
type: spec
title: Étape 3 — Règles et projets
description: Les projets deviennent des entités suivies et outillées (accès distant à la demande, vue Projets), avant l'arbre des règles, la création de projet et l'audit de conformité.
status: draft
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/decisions/2026-10-05-cloture-etape-2.md, /arbre/decisions/2026-10-05-rattachement-projet.md, /arbre/decisions/2026-10-03-identite-projets.md, /arbre/conception/contrats/evenement.md, /arbre/conception/contrats/fiche-catalogue.md]
---

# Étape 3 — Règles et projets

**Sert** B1 (« ne plus redire ses règles ») et B2 par projet. **Critère d'usage** (architecture §10) : plus aucune règle
redictée d'un projet à l'autre pendant un mois ; un nouveau projet créé sans corvée manuelle hors gestes réservés.

L'étape avance par tranches, chacune utile seule ; seules les tranches ouvertes sont décrites ici. Les suivantes
(arbre des règles et de la configuration, adaptateurs, récolte, création de projet, audit de conformité, §5.2 et §5.8)
se spécifient quand elles s'ouvrent.

## Tranche 1 — Accès distant par projet

**Constat (2026-10-05).** L'auteur pilote ses sessions à distance (Remote Control, depuis un téléphone). Un seul serveur
Remote Control, lancé dans un dossier d'entrée commun, voit tous les dépôts, mais ses sessions ne chargent ni les
consignes, ni les serveurs MCP, ni la mémoire d'un projet, et le journal les rattache toutes au dossier d'entrée.
L'application ne montre qu'un appareil par machine ; un serveur lancé dans un dossier y fait apparaître une session
créée d'avance, nommée d'après ce dossier.

**Livre.** `holarch distant` : un serveur Remote Control par projet, **activable et désactivable à la demande**, jamais
d'office (un serveur actif coûte de la mémoire, environ 200 Mo).

| Commande | Effet |
|---|---|
| `holarch distant` | liste les projets dont l'accès distant est actif |
| `holarch distant activer <projet>` | déclare le dossier de confiance pour Claude Code, écrit le service utilisateur du projet, l'active et le démarre ; au démarrage, le serveur reprend la dernière session du dossier (`--continue`, moins de quatre heures environ), sinon en crée une |
| `holarch distant desactiver <projet>` | arrête et retire le service ; la déclaration de confiance reste |

`<projet>` est un projet du catalogue, désigné par son nom, un chemin ou son identifiant (décision `rattachement-projet`).
Le mode de permission des sessions se règle par site (`acces_distant.mode_permissions`, celui de Claude Code par
défaut). Un service écrit par HOLARCH porte une marque ; un service qu'il n'a pas écrit n'est jamais modifié ni retiré.

**Choix techniques (P12).**

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| un service systemd utilisateur par projet, écrit par HOLARCH | redémarre seul, survit à la session ; chemin et nom quelconques, contrairement à un service modèle | un site sans systemd (macOS : launchd), à ajouter comme adaptateur |
| `claude remote-control`, pas de serveur maison | le runtime le fait déjà (principe : autour des runtimes) | une option de Remote Control qui servirait plusieurs dossiers |

**Plus tard.** Devenir une étape de la création de projet (§5.8, « environnement : accès distant ») et de sa fin
(désactiver), quand la création de projet s'ouvrira.

## Tranche 2 — Vue Projets

Q14 qualifiée avec l'auteur le 2026-10-05. Pour chaque projet : où il en est (étape en cours, fait et reste à faire,
d'après sa spécification) ; ce qui l'attend (questions ouvertes, décisions à approuver) ; son activité récente
(dernières sessions, dernier commit, coût sur 7 et 30 jours) ; son état technique (commits non poussés, retard sur le
dépôt distant, modifications en cours) ; plus tard, ses écarts à ses règles (audit de conformité).

**Exigence.** Une session se rattache aux projets où elle a réellement travaillé (chemins de ses commandes et de ses
fichiers), pas seulement à son dossier de départ : un dossier d'entrée commun ne doit pas rendre la vue aveugle.

**Constat (2026-10-05, transcriptions du poste personnel).** Le répertoire courant d'une session change en cours de
route (un `cd` persiste) et chaque ligne de transcription le porte ; une session lancée du dossier d'entrée travaille
surtout par des commandes shell qui citent des chemins absolus, plus rarement par les outils de fichiers.

**Livre.**

1. **Rattachement à l'import** (module `projets`, décision `rattachement-projet`). Chaque appel d'outil d'une
   transcription (sous-agents compris) touche les projets dont le dépôt contient
   connus du catalogue que désignent ses chemins : `file_path`, `notebook_path`, `path`, et, pour une commande shell, les
   chemins absolus (ou `~/…`) et les cibles de `cd` et de `git -C`, relatifs au répertoire courant de la ligne ; sans
   chemin explicite, son répertoire courant. Un dépôt imbriqué l'emporte sur celui qui le contient.
   `session.finished` porte `data.projets` : `[{id, n}]`, `n` le nombre d'appels qui l'ont touché. Rien d'autre
   n'est gardé (ni chemin, ni commande, ni argument).
2. **Historique.** Une transcription déjà importée est relue une fois (version 5 de l'état d'import) ; si elle n'a pas
   changé, un `session.finished` **complémentaire** (`data.complement: "projets"`, mêmes données plus `projets`) s'ajoute
   au journal, qui ne se réécrit pas (contrat événement §1 : une correction est un nouvel événement). Les lectures
   ignorent le complément quand elles comptent les sessions.
3. **État technique du dépôt**, à l'inventaire (`depots-git`) : branche amont, commits non poussés (`en_avance`), retard
   sur l'amont (`en_retard`, d'après le dernier `fetch`, dont la date est gardée : l'inventaire n'interroge jamais le
   réseau), fichiers modifiés (déjà là).
4. **Avancement d'après l'arbre**, à l'inventaire (`arbre`) : pour une spécification d'étape
   (`conception/etape-<n>-….md`), les entrées de sa section « Avancement » (`- **Étiquette (date)** : texte`, sous-points
   compris) ; pour la racine (`arbre/index.md`), les questions ouvertes de `arbre/questions.md` (tableau avant
   « Résolues »). Textes tronqués, comme les descriptions.
5. **Lecture `projets`** (socle, interface, serveur MCP), par projet du catalogue :
   - *où il en est* : l'étape en cours (la plus haute sans entrée « Clôture », sinon la dernière), le nombre d'entrées
     « Fait », la dernière, les entrées « Reste » ;
   - *ce qui l'attend* : questions ouvertes, décisions en `draft` (à approuver) ;
   - *activité* : sessions et coût liste sur 7 et 30 jours, dernière session, dernier commit. Une session compte pour
     chaque projet qu'elle a touché ; son coût (sous-agents compris) se partage entre eux au prorata des appels ; une
     session sans projet touché se rattache au projet de son répertoire de départ, sinon à « hors projet ». Cette
     attribution est la seule : le tableau de bord, la consommation et les sessions la reprennent ;
   - *état technique* : point 3.
   Les projets se rangent par activité récente ; ceux sans activité sur 30 jours et sans rien en attente se replient.
6. **Interface** : page « Projets » (une carte par projet actif, un tableau pour les autres) ; un projet mène à ses
   sessions (filtre par projet) et à sa fiche. **MCP** : outil `projets`, en lecture, réponse bornée.

**Choix techniques (P12).**

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| rattacher à l'import, d'après les projets du catalogue | la transcription n'est lue qu'une fois et son contenu n'est pas gardé | un dépôt inventorié après l'import de ses sessions : il faut relire (version de l'état d'import) |
| partage du coût au prorata des appels | sans double compte : la somme par projet reste le coût du site | une mesure plus juste (tokens par appel) si elle devient lisible |
| complément plutôt que réécriture | le journal est en ajout seul | — |
| avancement lu dans la spécification, pas saisi ailleurs | la spécification est déjà tenue à jour par la méthode (CLAUDE.md, « Reprendre ») | un projet sans arbre : la carte ne montre alors que l'activité et l'état technique |

**Montages.** Sur le poste personnel, la plupart des sessions tournent dans des conteneurs de développement : leurs
chemins (`/home/vscode/<dépôt>/…`, `/workspaces/<dépôt>/…`) ne sont pas ceux de l'inventaire. Un chemin qui n'est sous
aucun dépôt connu se rattache donc par le nom : un segment égal au nom d'un dépôt du catalogue, si la suite du chemin
existe dans ce dépôt (le segment le plus profond d'abord). Le répertoire de départ, en repli, se rattache de même.

**Limites connues.** Un chemin relatif dans une commande, hors `cd` et `git -C`, est ignoré. Un dépôt hors des racines
de `depots-git` n'est pas au catalogue : il n'est pas un projet et ne peut pas recevoir de session.

## Avancement

- **Ouverture (2026-10-05)** : décision `cloture-etape-2` ; tranches 1 et 2 décrites.
- **Fait (2026-10-05)** : tranche 1, `holarch distant` (liste, activer, desactiver) : service utilisateur marqué par
  projet, dossier déclaré de confiance, mode de permission par site ; 2 tests (systemctl simulé). Essayé sur le poste
  personnel : la session du projet apparaît dans l'application, rangée sous l'appareil de la machine.
- **Fait (2026-10-05)** : tranche 2, vue Projets : sessions rattachées aux dépôts touchés (`data.depots`, montages de
  conteneur compris, complément pour l'historique), écart à l'amont à l'inventaire, avancement et questions lus dans
  l'arbre, lecture `projets` (page « Projets », filtre des sessions par dépôt, outil MCP) ; 4 tests, test visuel
  étendu (à passer dans le conteneur du socle, sans Chromium ici). Essai à blanc sur une copie des données du poste
  personnel : 173 compléments et rien d'autre ; 57 sessions sur 30 jours rattachées au lieu de 13.
- **Fait (2026-10-05)** : sessions vides dans l'application : chaque démarrage d'un serveur Remote Control en crée une
  d'avance. Le service d'un projet reprend désormais la dernière session du dossier (`--continue`), et n'en crée une
  qu'à défaut (essayé : options acceptées, échec propre sans session récente ; ligne vérifiée sous systemd) ; `PATH` du
  service entre guillemets. Option plus radicale, `--no-create-session-in-dir` : Q15.
- **Fait (2026-10-05)** : décision `rattachement-projet` (approuvée) appliquée : module `projets` partagé ; lien
  `project` sur les fiches (éléments Claude Code d'un dépôt, mémoires, nœuds de l'arbre, conteneurs et volumes ; contrat
  fiche 0.4.0) ; `data.projets` remplace `data.depots` avant tout import réel (contrat événement 0.7.0) ; une seule
  attribution pour le tableau de bord, la consommation, les sessions et la vue Projets ; `holarch distant` et les
  outils MCP désignent un projet par nom, chemin ou identifiant ; nœuds de l'arbre identifiés par leur projet.
- **Fait (2026-10-06)** : test visuel passé dans le conteneur du socle (vert trois fois de suite) après correction
  d'une attente du test : il lisait le tableau de la page Projets avant que la page Sessions ne la remplace. Capture
  sur une copie des données du poste personnel : 7 projets en mouvement, aucune erreur ; 276 sessions « hors projet »
  sur 30 jours, presque toutes parties d'un dépôt retiré de la machine, donc absent du catalogue (limite connue).
- **Fait (2026-10-06)** : avis de l'auteur sur la page. Le « hors projet » vient d'une tentative antérieure, abandonnée,
  dont HOLARCH est une redéfinition : projet distinct, ses sessions restent hors projet (les rattacher fausserait le coût
  du socle) ; pas de détail par dossier de départ, la fenêtre de 30 jours les absorbe. Le faible nombre de sessions du
  socle sur ce site est attendu : une partie du travail se fait sur le site de travail, dont le journal reste le sien.
- **Reste** :
  1. **Tranches suivantes** : arbre des règles et de la configuration, adaptateurs, récolte, création de projet, audit
     de conformité (§5.2, §5.8), à spécifier à leur ouverture.
