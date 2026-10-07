---
type: spec
title: Étape 3 — Règles et projets
description: Les projets deviennent des entités suivies et outillées (accès distant à la demande, vue Projets), puis l'arbre des règles, la création de projet et l'audit de conformité.
status: draft
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/decisions/2026-10-05-cloture-etape-2.md, /arbre/decisions/2026-10-05-rattachement-projet.md, /arbre/decisions/2026-10-06-arbre-des-regles.md, /arbre/conception/contrats/regle.md, /arbre/decisions/2026-10-03-identite-projets.md, /arbre/conception/contrats/evenement.md, /arbre/conception/contrats/fiche-catalogue.md]
---

# Étape 3 — Règles et projets

**Sert** B1 (« ne plus redire ses règles ») et B2 par projet. **Critère d'usage** (architecture §10) : plus aucune règle
redictée d'un projet à l'autre pendant un mois ; un nouveau projet créé sans corvée manuelle hors gestes réservés.

L'étape avance par tranches, chacune utile seule ; seules les tranches ouvertes sont décrites ici. Les suivantes
(configuration, adaptateurs de hooks, récolte continue, création de projet, audit de conformité, §5.2 et §5.8) se
spécifient quand elles s'ouvrent.

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

**Interface depuis le téléphone (2026-10-07).** Demande de l'auteur : lire et cliquer confortablement hors du poste.
L'interface n'écoute qu'en local et refuse tout nom d'hôte étranger (DNS rebinding) ; elle reste ainsi. Un relais HTTPS
d'un réseau privé (Tailscale Serve : appareils du compte seulement, certificat émis par le réseau) la publie, et son nom
se déclare nommément dans `web.hotes_admis` (réglage du site, jamais versionné) : seul ce nom est admis, et une
écriture n'y est acceptée que depuis son origine HTTPS. `holarch interface activer|desactiver` tient `holarch voir` en
service utilisateur marqué, qui relit la même configuration. Essayé : le relais transmet son nom d'hôte et
`x-forwarded-proto: https` ; Windows atteint le port de WSL. Limites : le poste doit être allumé ; tout appareil du
réseau privé atteint l'interface, sauf règle d'accès (ACL) du réseau.

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

## Tranche 3 — Arbre des règles

Décision `arbre-des-regles` (approuvée le 2026-10-06) : le profil est la racine des règles, le socle fournit des types
transverses, un contexte déclare ses projets, les règles se matérialisent dans les portées de Claude Code. Essai sur
HOLARCH et sur un second projet privé du contexte personnel, un bundle de connaissances (Q16).

**Constat (2026-10-06, poste personnel).**

- 44 mémoires de consignes dans 13 dossiers de projet. La même consigne revient sous des noms différents : donner un
  avis argumenté avant d'appliquer une consigne de conception (4 projets), suivre le modèle prévu pour chaque étape
  (3), vérifier l'intégration continue après un envoi (2 mémoires d'un même projet) ; une mémoire existe en deux
  exemplaires (dossier vu d'un conteneur et de l'hôte).
- La méthode (brouillon jusqu'à approbation consignée, fait inconnu marqué, rien à l'avance, contrainte changée par
  décision, revue qui suspend, journal) est écrite deux fois, dans le `CLAUDE.md` du socle et dans le protocole d'agent
  du second projet, avec des chemins et un vocabulaire différents.
- Le second projet est un bundle OKF : son arbre est à la racine du dépôt (`index.md` portant `okf_version`), pas sous
  `arbre/` ; d'autres agents que Claude Code lisent son `CLAUDE.md`, pas `.claude/rules/`. Il pose une règle à
  respecter : aucune complexité ajoutée au seul motif de rendre la méthode plus générale.
- Aucune consigne au niveau du compte (`~/.claude/CLAUDE.md` absent) ; des skills personnelles non versionnées.

**Livre.**

1. **Profil** (dépôt privé de l'auteur) : racine `arbre/index.md` (`id: profil`), contexte `arbre/contextes/perso.md`
   qui déclare ses projets (`projects`), et les règles récoltées dans `rules.yaml` à côté de la racine, en `draft`
   (`source: harvest`, avec les mémoires qu'elles remplacent) jusqu'à l'approbation de l'auteur.
2. **Types transverses du socle**, un dossier chacun sous `arbre/types-transverses/` (`index.md`, nœud `template`, et
   `rules.yaml`) : `methode-holarch` et `depot-public`. Une règle de type dit un comportement et désigne un registre
   par son rôle (« le registre des questions ouvertes du projet ») ; le projet dit où il est dans ses propres consignes.
   Un réglage (`config`) cité par la règle viendra quand un cas l'exigera.
3. **Racine de l'arbre d'un projet** : `arbre/index.md`, sinon l'`index.md` d'un bundle OKF à la racine du dépôt.
   Elle déclare ses `types` et porte les règles propres au projet.
4. **Inventaire** (adaptateur `arbre`, qui lit déjà les nœuds) : une fiche `rule` par règle
   (`holarch:rule:<id de l'arbre>/<nœud>/<id>`, sans nœud pour la racine, l'`id` du nœud s'il en a un) : nœud porteur,
   niveau, statut, classification, lien `project` du dépôt qui la porte. D'un bundle OKF, seule la racine est lue. Un
   `rules.yaml` illisible est signalé sur son nœud, sans faire échouer l'inventaire.
5. **Règle effective** (module `regles`, socle) d'un projet : profil, puis le contexte qui le déclare, puis sa racine
   et ses sous-nœuds, ses types venant dans l'ordre déclaré, juste au-dessus de lui. Même `id` : le plus spécifique
   l'emporte, sauf règle non dérogeable ; dérogations `{rule, why, by, at}`. Chaque règle porte sa provenance. Seules
   les règles `stable` s'appliquent, les `draft` se montrent comme proposées. La taille de ce qui serait chargé à chaque
   tour (`reminder`) est comptée.
6. **Adaptateur Claude Code** : `holarch regles <projet>` montre la règle effective et ce qui serait écrit, et où ;
   `holarch regles appliquer <projet>` écrit un fichier par règle `reminder` ou `guided` :
   - règles du profil et du contexte (valables pour tous les projets du site) → `~/.claude/rules/holarch/` ;
   - règles du projet et de ses types, si leur classification permet le dépôt → `.claude/rules/holarch/`, à commiter ;
   - règle d'un sous-nœud → avec `paths:` ;
   chaque fichier porte la marque « généré par HOLARCH » ; un fichier généré sans règle correspondante est retiré ; un
   fichier non marqué n'est jamais touché, `CLAUDE.md` non plus. Les niveaux `blocking` et `verified`, et `guided`
   sans chemins, sont signalés comme non appliqués (hooks et skills : tranche suivante). Claude Code additionne les
   portées sans les remplacer : une règle de projet qui redéfinit une règle du compte le dit dans son fichier, et une
   dérogation à une règle du compte est signalée sans effet tant que la portée locale n'existe pas.
7. **Interface et MCP** : page « Règles » (ce qui vaut pour le compte, les projets qui ont des règles) ; la carte d'un
   projet mène à sa règle effective (provenance, taille des rappels, où Claude Code la lit) ; outil MCP `regles`, en
   lecture.

**Critère de la tranche.** Les règles récoltées, approuvées, sont appliquées aux deux projets ; les mémoires qu'elles
remplacent sont retirées avec l'accord de l'auteur ; le `CLAUDE.md` du socle ne garde que ce qui lui est propre. Le
second projet garde son `CLAUDE.md` tant que ses autres agents n'ont pas d'adaptateur.

**Choix techniques (P12).**

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| `.claude/rules/` et `~/.claude/rules/`, un fichier par règle | portées natives de Claude Code (P2) ; une règle se retire en retirant son fichier ; le `CLAUDE.md` écrit à la main reste intact | une portée que le runtime ne lit plus |
| règles du profil à la portée du compte | un seul contexte par site aujourd'hui | deux contextes sur un même site : portée locale par projet (`CLAUDE.local.md` ou import depuis le compte) |
| `rules.yaml` lu par l'inventaire, pas une base | les règles se relisent et se versionnent avec leur arbre (contrat règle) | — |
| règle de type en comportement, registre désigné par son rôle | une même règle sert des projets à structures différentes, sans réglage à tenir | une règle qui doit citer un chemin exact : réglage `config` du projet |

**Limites connues.** Les règles du compte valent pour tous les projets du site, même ceux qu'aucun contexte ne déclare.
Les autres agents d'un projet (hors Claude Code) ne reçoivent rien tant qu'ils n'ont pas d'adaptateur.

## Tranche 4 — Audit de conformité

Décision `controles-de-regles` (approuvée le 2026-10-07) : une règle désigne ses contrôles ; le blocage passe par le
crochet de git et les permissions de Claude Code, la détection des secrets par gitleaks ; les écarts vont au journal.

**Constat (2026-10-07).** Les règles appliquées sont toutes des rappels : 5 057 caractères relus à chaque tour dans le
socle (21 règles), 3 284 dans le second projet (14), et rien ne vérifie qu'elles sont tenues. Le dépôt du socle est public : une donnée personnelle commitée ne se reprend pas,
et seule l'attention de l'agent l'en garde. Aucun outil de détection de secrets n'est installé. Les fichiers générés
peuvent dériver de la règle effective sans que rien ne le dise ; des mémoires qu'une règle remplace peuvent rester.

**Livre.**

1. **Registre des contrôles** (module `controles`, socle) : un contrôle reçoit un projet (dépôt, règle effective,
   réglages) et un moment (`avant-commit` ou `audit`), et rend des écarts `{regle, controle, fichier?, ligne?, message}`
   ou « non disponible » avec sa raison. Premiers contrôles :
   - `donnees-personnelles` : termes de la liste privée, en mots entiers, sans casse, dans les lignes ajoutées et les
     noms de fichiers (avant commit), dans les fichiers suivis (audit). Liste déduite (nom et adresse de l'identité git,
     nom d'utilisateur et dossier personnel, dossiers des comptes Claude Code, noms des projets qu'un contexte déclare et
     dont l'arbre n'est pas public ; jamais le nom du projet contrôlé) et complétée par le réglage `donnees_personnelles`
     du profil (`termes` à ajouter ; `exceptions` : un terme à retirer, ou un fichier à soustraire, chacune avec sa
     raison). Les réglages des couches se fusionnent : objets clé à clé, listes allongées (une exception du projet
     s'ajoute aux termes du profil) ;
   - `secrets` : gitleaks (8.30.1, lu dans son aide) : `gitleaks git --pre-commit --staged` avant commit, `gitleaks dir`
     sur le contenu suivi du dernier commit (exporté par `git archive`) à l'audit ; secrets masqués (`--redact`), sortie
     JSON ; un code de sortie autre que 0 (rien) ou 1 (fuites listées) rend le contrôle non disponible ;
   - `journal-tenu` : un jour où des commits changent l'arbre du projet sans entrée datée de ce jour dans son journal.
2. **Audit** (`holarch audit [<projet>]`) : pour chaque projet qui a des règles, les contrôles de ses règles stables
   `blocking` et `verified`, et trois vérifications de la matérialisation, qui ne sont pas des règles :
   - fichiers générés à jour (même plan que `holarch regles appliquer`, rien n'est écrit) ;
   - crochet de git et permissions posés là où une règle le demande ;
   - mémoires encore présentes qu'une règle stable déclare remplacer.
   Il suit chaque inventaire (minuterie horaire comprise) ; un écart apparu s'écrit `rule.violated`, un écart disparu
   `rule.resolved` (contrat événement 0.8.0).
3. **Garde avant commit** : `holarch regles appliquer <projet>` pose `.git/hooks/pre-commit` (marqué, il appelle
   `holarch garde avant-commit`) si une règle `blocking` du projet a un contrôle `avant-commit`. Un crochet non marqué
   n'est jamais remplacé : c'est signalé. Le refus dit la règle, le fichier, la ligne et l'énoncé de la règle, sans
   répéter le terme trouvé. HOLARCH injoignable : le crochet laisse passer et le dit (l'audit rattrape).
4. **Permissions** : une règle `blocking` sans contrôle de commit et portant `match: { action: read, paths: [...] }`
   devient des entrées `permissions.deny` (`Read(...)`) à sa portée (`~/.claude/settings.json` pour le compte). Les
   entrées posées sont listées dans un manifeste à côté des règles générées ; seules celles-là se retirent.
5. **Interface et MCP** : la règle effective d'un projet montre ses écarts ouverts, chacun avec sa date d'apparition
   (l'audit suit chaque inventaire, dont la date dit celle du dernier contrôle) ; la carte d'un projet en donne le
   nombre ; la lecture `regles` (page, outil MCP) les porte, sans nouvel outil.
6. **Règles passées au contrôle**, une fois les contrôles éprouvés et avec l'approbation de l'auteur :
   `rien-de-personnel` → `blocking`, `check: [donnees-personnelles, secrets]` ; `secrets-hors-contexte` → `blocking`,
   lecture des fichiers de secrets refusée (`match: { action: read, paths }`, motifs gitignore ancrés à la racine,
   `//**/.env` par exemple) ; `journal-du-projet` → `verified`, `check: [journal-tenu]`, avec le réglage `journal` de
   chaque projet. Elles quittent les rappels.

**Critère de la tranche.** Dans le socle, un commit qui contient un terme de la liste privée ou un faux secret est
refusé ; forcé (`--no-verify`), il apparaît à l'audit suivant et au journal, puis s'y résout une fois retiré. Claude
Code ne peut pas lire un fichier de secrets d'essai. L'audit des deux projets ne remonte que des écarts réels (chaque
faux positif est corrigé dans le contrôle ou dans le profil, avec sa raison). Les trois règles sont passées au
contrôle, et les rappels de chaque projet ont diminué d'autant.

**Choix techniques (P12).**

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| crochet `pre-commit` de git, par clone | arrête tous ceux qui commitent ; mécanisme du runtime (P2) | un dépôt qui a déjà son gestionnaire de crochets : s'y inscrire plutôt que le remplacer |
| gitleaks pour les secrets | outil de référence, un binaire ; rien à écrire ni à tenir | un outil plus juste sur nos faux positifs |
| liste déduite, complétée par le profil | presque rien à tenir ; le profil privé garde ce que la machine ignore | des faux positifs répétés sur un terme déduit |
| audit après chaque inventaire | pas de nouvelle minuterie ; le journal reçoit l'apparition et la fin des écarts | un audit trop lent pour l'heure |

**Limites connues.** Une permission de lecture refusée couvre les outils de fichiers de Claude Code et les commandes du
shell qui nomment le fichier (`cat`, `head`, `tail`, `sed`, redirections), pas une commande qui lit sans le nommer
(`grep -r`) ni un script (documentation des permissions de Claude Code, lue le 2026-10-07) ; le bac à sable de Claude
Code le ferait au niveau du système. Un commit fait ailleurs que dans le clone local (édition sur GitHub) n'est vu qu'à
l'audit. Le crochet fige les chemins de node et de HOLARCH à son écriture : vu d'un conteneur où ils n'existent pas, il
laisse passer et le dit.

## Tranche 5 — Veille de sécurité et de versions

Décision `veille-securite-versions` (approuvée le 2026-10-07) : failles connues des dépendances et retard des outils du
poste, en contrôles de l'audit portés par le profil, sources interrogées une fois par jour.

**Constat (2026-10-07).** Six projets ont des dépendances verrouillées (npm, uv) ; l'un porte 104 avis de failles
connues, toutes gravités confondues, que rien ne signalait. gitleaks et osv-scanner viennent d'être installés à la main,
sans rien pour dire quand ils prennent du retard.

**Livre.**

1. **Contrôle `dependances-vulnerables`** (audit) : fichiers de verrouillage suivis par git (npm, pnpm, yarn, uv,
   poetry, pip, Go, Cargo, Bundler, Composer), `osv-scanner scan source -L … --format json` (2.6.0, lu dans son aide :
   0 rien, 1 failles, 128 aucun paquet, le reste une panne) ; un écart par paquet qui porte un groupe de failles de
   gravité au moins égale au seuil (`dependances.seuil_cvss`, 7 par défaut ; à défaut de score, la gravité déclarée
   `HIGH` ou `CRITICAL`). L'écart nomme le fichier de verrouillage, le paquet, sa version, le nombre de failles, la pire
   et son identifiant.
2. **Contrôle `outils-a-jour`** (audit, portée site) : pour chaque outil de `outils_surveilles` (profil :
   `{nom, commande, github | node: lts}`), la version que donne sa commande contre la dernière publiée ; un écart par
   outil en retard ou introuvable. Il s'exécute une fois, au compte, pas dans chaque projet.
3. **Une fois par jour** : résultats gardés dans `<données>/cache/` (par projet et empreinte de ses fichiers de
   verrouillage ; versions publiées) et relus pendant 24 heures.
4. **Règles du profil** `dependances-saines` et `outils-a-jour` (`verified`), et déclaration dans le contexte perso des
   projets à surveiller (choix de l'auteur : cinq projets à dépendances, en plus des deux déjà déclarés).

**Critère de la tranche.** L'audit montre, sur la carte de chaque projet surveillé, les paquets à failles élevées ou
critiques, et au compte les outils en retard ; une seconde exécution dans la journée ne réinterroge pas les sources ;
une mise à jour qui corrige une faille résout son écart au journal.

**Choix techniques (P12).**

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| osv-scanner et la base OSV | tous les écosystèmes en une fois, avis agrégés (GitHub, PyPA, Go…) | un écosystème qu'il ne lit pas |
| un écart par paquet, au-dessus d'un seuil | lisible et actionnable ; un paquet à jour résout son écart | trop d'écarts : un par fichier de verrouillage |
| versions par l'API publique de GitHub et l'index de node | sans jeton, une fois par jour, loin de la limite horaire | un outil publié ailleurs : une source de plus |

**Limites connues.** Une faille sans score ni gravité déclarée ne fait pas d'écart. Claude Code et Tailscale se mettent à
jour seuls et ne sont pas suivis. Un projet que le contexte ne déclare pas n'est pas audité.

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
- **Ouverture de la tranche 3 (2026-10-06)** : consigne de l'auteur, un arbre des règles pour tous les projets
  (nouveaux projets conformes d'office, sous-niveaux d'un projet, HOLARCH lui-même) ; décision `arbre-des-regles`
  proposée (profil en racine, socle en types, lien entre arbres côté le plus fermé, matérialisation dans les portées
  de Claude Code) ; Q16 et Q17 ouvertes.
- **Fait (2026-10-06)** : tranche 3, points 1 à 7. Adaptateur `arbre` : racine d'un bundle OKF, identité de l'arbre,
  fiches `rule` ; module `regles` (règle effective, portée du compte, rappels comptés, et ceux des proposées) ;
  adaptateur Claude Code (`holarch regles`, `holarch regles appliquer`) ; page « Règles », lien depuis la carte d'un
  projet, outil MCP `regles` ; 3 tests, test visuel étendu (passé dans le conteneur). Contenu : types
  `methode-holarch` (7 règles) et `depot-public` (1), règles propres au socle (6), profil (4 règles récoltées,
  contexte personnel déclarant les deux projets), type déclaré à la racine du second projet (son vérificateur passe,
  son journal le dit). Toutes les règles sont en brouillon : rien n'est encore écrit pour Claude Code.
- **Fait (2026-10-07)** : les 18 règles approuvées par l'auteur, une à une, sur avis : trois retouches pour retirer des
  doublons lus à chaque tour (`fait-inconnu-marque` perd la phrase sur les choix de méthode, déjà dans `avis-argumente` ;
  `principes` perd celle sur les contraintes, déjà dans `contrainte-changee-par-decision`) et déclarer la mémoire que
  `coherence-globale` remplace. Règle effective : 18 pour le socle, 11 pour le second projet, aucune proposée.
- **Fait (2026-10-07)** : `holarch regles appliquer` sur les deux projets (accord de l'auteur) : 4 règles dans la portée
  du compte (836 caractères à chaque tour), 14 dans le socle, 7 dans le second projet ; fichiers générés commités.
- **Fait (2026-10-07)** : critère de la tranche 3 atteint. Avec l'accord de l'auteur, cinq mémoires entièrement couvertes
  par une règle sont retirées ; celles qui disent plus que leur règle restent (détails propres à un projet), celles du
  projet antérieur aussi. `CLAUDE.md` du socle réduit à ce qui lui est propre : où vivent les règles, les questions,
  les décisions et les contrats, et le format du journal. Écart relevé : la règle `modele-par-etape` déclare remplacer
  `feedback-model-per-step`, la mémoire réelle s'écrit `feedback_model_per_step` (laissée en place, elle dit plus).
- **Ouverture de la tranche 4 (2026-10-07)** : audit de conformité ; décision `controles-de-regles` approuvée sur
  quatre choix de l'auteur (liste privée déduite et complétée, crochet de git et permissions, gitleaks, écarts au
  journal) ; contrats règle 0.3.0 et événement 0.8.0.
- **Fait (2026-10-07)** : tranche 4, points 1 à 5. Module `controles` (liste privée, gitleaks, journal tenu ; un
  gitleaks en panne se dit non disponible, jamais « rien trouvé »), `holarch audit` après chaque inventaire, écarts au
  journal (`rule.violated`, `rule.resolved`), `holarch garde avant-commit` et crochet marqué, lectures refusées au
  compte (manifeste des entrées posées), écarts sur la page « Règles », la carte d'un projet et l'outil MCP ; réglages
  fusionnés entre couches ; 6 tests, dont un commit fautif refusé, forcé, vu par l'audit puis résolu. gitleaks 8.30.1
  installé sur le poste personnel (somme de contrôle vérifiée). Test visuel non passé (pas de Chromium sur l'hôte).
- **Fait (2026-10-07)** : point 6 et critère de la tranche, sur avis de l'auteur. `rien-de-personnel` bloquante
  (données personnelles et secrets), `secrets-hors-contexte` bloquante (sept motifs de lecture refusés),
  `journal-du-projet` vérifiée ; journal déclaré par chaque projet ; `LICENSE` soustrait au contrôle (titulaire du droit
  d'auteur) ; six mémoires gardées parce qu'elles disent plus retirées des `replaces`. Essais réels dans le socle : un
  commit avec un terme de la liste privée refusé, forcé puis vu par l'audit et résolu au retrait ; un faux secret
  refusé ; un `.env` d'essai illisible par l'outil de lecture et par `cat`. Audit des deux projets sans faux positif ;
  le seul écart réel (un jour de commit sans entrée au journal du second projet) corrigé. Rappels : 5 057 → 4 377
  caractères dans le socle, 3 284 → 2 869 dans le second projet. Tranche close.
- **Fait (2026-10-07)** : interface depuis le téléphone (tranche 1) : `web.hotes_admis`, `holarch interface`, relais
  Tailscale Serve publié sur le poste personnel ; 2 tests.
- **Ouverture de la tranche 5 (2026-10-07)** : veille de sécurité et de versions, décision `veille-securite-versions`
  approuvée sur les choix de l'auteur ; osv-scanner 2.6.0 installé (somme de contrôle vérifiée).
- **Reste** :
  1. **Tranche 5** : points 1 à 4, puis son critère.
  2. **Tranches suivantes** : configuration, adaptateurs, récolte, création de projet (§5.2, §5.8), à spécifier à
     leur ouverture.
