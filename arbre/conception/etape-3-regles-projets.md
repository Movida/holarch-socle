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
| `holarch distant activer <projet>` | déclare le dossier de confiance pour Claude Code, écrit le service utilisateur du projet, l'active et le démarre ; au démarrage, le serveur n'ouvre aucune session (`--no-create-session-in-dir`), ou reprend la dernière du dossier si le site le règle (tranche 12, livraison A) |
| `holarch distant desactiver <projet>` | arrête et retire le service ; la déclaration de confiance reste |
| `holarch distant reveil` | lancé chaque minute par un minuteur posé avec le premier accès distant : après une veille du poste (écart de plus de cinq minutes entre deux passages), redémarre les accès distants actifs |

`<projet>` est un projet du catalogue, désigné par son nom, un chemin ou son identifiant (décision `rattachement-projet`).
Le mode de permission des sessions se règle par site (`acces_distant.mode_permissions`, celui de Claude Code par
défaut), comme la session au démarrage (`acces_distant.session_au_demarrage` : `aucune` par défaut, `reprendre` pour
`--continue`). Un service écrit par HOLARCH porte une marque ; un service qu'il n'a pas écrit n'est jamais modifié ni retiré.

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
   « Résolues ») et les idées de la boîte, `arbre/idees.md` (identifiant, idée, source, phase visée, gain, statut).
   Textes tronqués, comme les descriptions.
5. **Lecture `projets`** (socle, interface, serveur MCP), par projet du catalogue :
   - *où il en est* : l'étape en cours (la plus haute sans entrée « Clôture », sinon la dernière), le nombre d'entrées
     « Fait », la dernière, les entrées « Reste » ;
   - *ce qui l'attend* : questions ouvertes, décisions en `draft` (à approuver) ; à part, les idées de l'étape en cours
     (phase visée qui commence par elle, ni prises ni écartées), que le résumé de reprise nomme aussi ;
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

## Tranche 6 — Consolidation

Demande de l'auteur (2026-10-07) : que ce qui est conçu soit paramétrable et modulaire. Un audit du code (sous-agent,
lecture seule) a relevé des doublons, une écriture des règles faite deux fois, des valeurs en dur et un `socle.js` qui
mêle tout ; une partie vient des tranches 4 et 5.

**Livre.**

1. **Module commun** (`src/commun.js`) : guillemets du shell et de systemd, marque d'un fichier généré (une seule
   façon de la reconnaître), lecture et écriture atomique de JSON, recherche d'un outil (sans shell), appel de git,
   chemin de `.claude.json` d'un compte, clé d'un serveur MCP. Chaque doublon relevé disparaît au profit de lui.
2. **Matérialisation en un seul endroit** (`src/materialisation.js`) : le plan de ce qui s'écrit pour Claude Code (fichiers
   de règles, lectures refusées, crochet de git), au compte et par projet ; `holarch regles appliquer` l'écrit, l'audit
   le lit à blanc et en tire ses écarts.
3. **Audit hors de `socle.js`** (`src/audit.js`) : contexte d'un contrôle, garde avant commit, écarts ouverts, audit ;
   le socle n'en garde que l'entrée.
4. **Réglages des contrôles** (`controles:` dans la configuration du site, avec défauts) : chemins de gitleaks et
   d'osv-scanner, durée de la mémoire des sources, fenêtre du journal tenu, taille maximale d'un fichier lu, délais,
   adresses des sources de versions.
5. **Services utilisateur** : une seule fabrique d'unité marquée et un seul `PATH` pour l'accès distant et l'interface.
6. **Affichage de la ligne de commande** à part (`bin/affichage.js`).

Rien ne change de comportement : la suite de tests reste la mesure, sans test affaibli.

**Écartés pour l'instant (règle « rien à l'avance »).** Un registre des clients (`RUNTIMES`) et un superviseur
interchangeable (systemd, launchd) : un seul client et un seul système à servir aujourd'hui. Ce qui les ferait venir :
un second client à adapter, ou un site sous macOS.

## Tranche 7 — Configuration : économie du contexte

Décision `passation-sereine` (approuvée le 2026-10-07) : alerte de passation, reprise au démarrage, compaction en
filet, réglages de Claude Code posés depuis le profil, mesure au tableau de bord. C'est la première tranche
« configuration » (§5.2) : des réglages portés par l'arbre et écrits dans les portées du runtime.

**Livre.**

1. **Registre de configuration** (`contrats/config.md`) : les clés `config` en usage, qui les lit, leur fusion.
2. **`holarch contexte alerte --seuil N`** (crochet `UserPromptSubmit`) : lit la taille du contexte dans la transcription
   (dernier usage d'une réponse : entrée, cache lu, cache écrit) ; au-delà du seuil, un avis à l'agent
   (`additionalContext`) et à l'auteur (`systemMessage`) ; rien sous le seuil ; jamais d'échec qui bloque un message.
3. **`holarch contexte debut`** (crochet `SessionStart`, au démarrage, après `/clear` ou une compaction) : résumé du
   projet du dossier de travail, 1 500 caractères au plus, tiré des mêmes lectures que la vue Projets.
4. **Réglages Claude Code du compte** : la section `claude_code` de la configuration effective du profil (`reglages` :
   clés de `settings.json` ; `passation` : seuil, reprise) devient des clés et des crochets de `~/.claude/settings.json`,
   par `holarch regles appliquer`, avec un manifeste de ce que HOLARCH a posé ; une valeur posée à la main n'est jamais
   remplacée (signalée) ; l'audit signale ce qui manque.
5. **Mesure** : au tableau de bord, le contexte moyen relu par tour sur 7 et 30 jours, et les sessions de la semaine
   au-dessus du seuil, avec le conseil de passation.
6. **Profil** : `claude_code: { passation: { seuil_tokens: 150000, reprise: true } }` (la compaction avancée à 300 000,
   d'abord posée, est retirée à la demande de l'auteur : une compaction coûte des tokens).

**Critère de la tranche.** Une session qui dépasse le seuil reçoit l'avis ; après `/clear`, la session suivante démarre
avec le résumé du projet ; après une semaine, le contexte moyen par tour est mesuré
et comparé à celui d'avant (référence : 30 jours au 2026-10-07).

**Limites connues.** La taille du contexte lue dans la transcription a un tour de retard. Seul l'auteur peut lancer
`/clear`. Les sessions des autres clients (Claude Desktop) ne sont pas concernées.

## Tranche 8 — Configuration : identité de commit

Décision `identite-par-contexte` (approuvée le 2026-10-07). Deuxième tranche « configuration » (§5.2) : un
réglage porté par l'arbre, appliqué par le mécanisme de git, gardé au commit.

**Livre.**

1. **Registre de configuration** : clé `identite` (`{nom, email}`), portée par le profil, un contexte ou un projet ;
   lue par l'adaptateur git et le contrôle `identite-de-commit`.
2. **Application** (`holarch regles appliquer`) : dans chaque dépôt déclaré, l'identité effective (`git config
   user.name`, `user.email`, lus dans le dépôt) est comparée à la déclarée ; si elle diffère, `user.name` et
   `user.email` sont posés en réglage local, avec un manifeste de ce que HOLARCH a posé ; un réglage local posé à la
   main est laissé et signalé ; HOLARCH ne retire que ce qu'il a posé.
3. **Garde** : règle de profil `identite-de-commit`, bloquante ; `holarch garde avant-commit` compare l'auteur du
   commit (`git var GIT_AUTHOR_IDENT`) à l'identité déclarée et refuse l'écart (forçable, écart au journal).
4. **Audit** : la même comparaison sur la configuration du dépôt, après chaque inventaire ; écart sur la page
   « Règles » et la carte du projet (mécanismes de la tranche 4).
5. **Profil** : `identite` déclarée au profil (valeur par défaut, celle de l'identité globale actuelle) ;
   le seul dépôt déclaré à réglage local divergent est signalé ; l'auteur décide de le retirer.

**Critère de la tranche.** Un commit sous une autre identité que celle de son contexte est refusé dans un dépôt
déclaré ; le réglage divergent du dépôt déclaré est signalé, puis résolu au retrait ; l'audit des projets déclarés
est sans écart d'identité.

**Hors tranche.** La réécriture de l'historique déjà publié (adresse personnelle dans 8 commits de `holarch-socle` et
tous ceux d'un autre dépôt public) : geste de l'auteur, à décider à part. Le contexte professionnel : déclaré avec son premier projet (Q18). Les dépôts
non déclarés restent hors d'atteinte tant qu'aucun contexte ne les cite.

## Tranche 9 — Échecs au journal

Décision `echecs-au-journal` (approuvée le 2026-10-07, idée de l'auteur) : compter les échecs avant d'en chercher les
solutions, qui viendront avec la récolte (§6, boucles « Règles » et « Progrès et recul »).

**Livre.**

1. **Import des transcriptions** (état d'import version 6) : `tool.failed` pour un résultat d'outil en erreur qui
   n'est pas un refus (motif d'une liste fixe, code de sortie et nom du programme pour une commande shell) ; tests
   rouges reconnus au code de sortie ou au résumé du lanceur ; `tests: {lances, rouges}` en fin de session ;
   complément pour les transcriptions déjà importées.
2. **Refus reconnus** : origine `approbation` (demandes d'approbation) et blocages de crochet au format du projet
   antérieur, ajoutés à la liste de la décision `refus`.
3. **Garde** : `holarch garde avant-commit` écrit `rule.enforced` à chaque refus.
4. **Comptes** : échecs sur 7 et 30 jours par famille et motif au tableau de bord, à côté des refus ; échecs du projet
   sur sa carte ; contrat événement 0.9.0.

**Critère de la tranche.** Sur le poste personnel, les comptes du tableau de bord sur 30 jours égalent ceux d'une
mesure indépendante des transcriptions (référence du 2026-10-07 : 24 tests rouges sur 183 dans le socle, 338 refus
d'approbation sur le poste) ; un refus réel de la garde et un test rouge passé par un tube apparaissent au journal.

**Hors tranche.** Les leçons de clôture (texte de l'agent, avec la récolte) ; les solutions aux échecs répétés.

## Tranche 10 — Création de projet

Décision `creation-de-projet` (approuvée le 2026-10-07) : `holarch projet creer` déroule les étapes de mise en place
d'un projet ; rejouée, elle fait ce qui manque et rien d'autre. Valeurs par défaut tirées de la mesure des 9 dépôts du
poste (décision) : dossier sous le répertoire personnel (9 sur 9), branche `main`, dépôt GitHub privé sauf type
`depot-public` (6 privés, 3 publics), licence MIT pour un dépôt public (2 sur 3 ; Apache pour le troisième), conteneur de
développement (6 sur 9) sur le modèle le plus récent (image de base Debian, `gh`, `~/.claude` partagé, `~/.ssh` et la
configuration de `gh` en volumes nommés, `deploy-key.sh`).

**Livre.**

1. **Commande** `holarch projet creer <nom> [--contexte <c>] [--type <t>…] [--description <phrase>] [--a-blanc]`
   (sans description, une marque `[À COMPLÉTER]`) : `--contexte` peut manquer
   quand le profil n'en a qu'un ; `--a-blanc` dit ce qui serait fait et n'écrit rien (à montrer avant de lancer). Chaque
   étape dit son résultat : faite, déjà là, désactivée, ou geste réservé (avec la commande ou le lien prêts) ; une étape
   en échec n'arrête pas les suivantes qui n'en dépendent pas.
2. **Étapes, dans l'ordre où elles dépendent l'une de l'autre** (l'identité vient avant le premier commit, qui donne
   au projet son identifiant ; la déclaration avant les règles) :
   1. dépôt local, branche `main`, identité de commit du contexte posée (`identite-git.js`) ;
   2. fichiers de base : README (titre et description), `.gitignore` (secrets d'environnement), CLAUDE.md généré (où
      vivent les règles, comment les changer), LICENSE si `depot-public`, conteneur de développement et
      `deploy-key.sh` d'après le modèle ; avec un type et sans arbre, racine `arbre/index.md` qui les déclare, et son
      journal si `methode-holarch` ; premier commit ;
   3. déclaration du projet dans le contexte du profil (une ligne `projects`), commit de ce seul fichier dans le profil ;
   4. inventaire, puis règles et crochet (`regles appliquer` sur le projet), commit des fichiers générés ;
   5. dépôt GitHub par `gh` (visibilité d'après les types, propriétaire : le compte actif de `gh` ou `creation.github`),
      remote `origin` en SSH, envoi de `main` ;
   6. clé de déploiement : elle se crée dans le conteneur, son enregistrement sur GitHub est un geste réservé (choix
      de l'auteur, 2026-10-07), vu comme fait quand le dépôt porte une clé de déploiement ;
   7. accès distant (`distant activer`) ;
   8. audit du projet : aucun écart attendu hors gestes réservés.
3. **Configuration** : clé `creation` au registre de configuration (contrat config 0.3.0) : `dossier`, `etapes`
   (`github`, `conteneur`, `distant` : oui ou non), `github` (`proprietaire`), `licence` ; portée par le profil, le
   contexte et les types, fusionnée comme les autres clés.
4. **Modèles** dans le socle (`modeles/projet/`) : conteneur, `deploy-key.sh`, `.gitignore`, CLAUDE.md, licences.

**Critère de la tranche** (décision). Le prochain vrai projet est créé par la commande : seuls les gestes réservés
restent à la main, et l'audit du jour est sans écart.

**Hors tranche.** Le formulaire de l'interface (I22) et le paramétrage depuis l'interface (I23) ; la migration des
quatre projets non déclarés, projet par projet, avec l'accord de l'auteur (la même commande, rejouée) ; la fin de
projet (§5.8).

## Tranche 11 — Récolte

Ouverte le 2026-10-07, sur le choix de l'auteur (la récolte sert directement le critère de l'étape : plus aucune règle
redictée). Méthode choisie par l'auteur sur mesure : une proximité lexicale entre messages de sessions différentes ne
trouve aucune consigne redite sur 30 jours (34 paires, toutes des messages recopiés par une reprise ou des invites
d'essai) ; les consignes reviennent reformulées. Décision `recolte` à proposer sur le résultat du rejeu (point 2).

**Livre.**

1. **Détecteur** (`src/recolte.js`, `holarch recolte`) : extraction déterministe des candidats, messages de l'auteur
   (ni sous-agents, ni textes injectés, ni acquiescements, ni collages ; un message recopié par une reprise compte une
   fois) et mémoires `feedback` du catalogue ; candidats où gitleaks voit un secret retirés, rien ne part sans gitleaks ;
   regroupement par sens par `claude -p` (sans outils ni serveur MCP ni session gardée, dépense plafonnée, JSON validé
   par un schéma), règles connues passées pour dire ce qui est déjà couvert ; redites comptées par le socle (deux
   sessions ou deux projets). Rien n'est écrit au journal.
2. **Rejeu sur l'historique** antérieur au 2026-10-06 (`--jusqua`), règles connues à cette date seulement : la récolte
   retrouve-t-elle les consignes devenues règles les 6 et 7 octobre ? Résultat : mesure de référence de la tranche.
3. **Décision `recolte`** sur ce résultat : seuil de redite, nœud de la règle proposée, forme de la proposition.
4. **Propositions branchées** (règle en brouillon, page « Règles », reprise), selon la décision.

**Critère de livraison** (sur l'historique, sans attendre) : le rejeu retrouve les consignes connues, chiffres à
l'appui (retrouvées sur attendues, fausses alertes). **Critère d'usage** (différé, ne bloque pas les tranches
suivantes) : une consigne récoltée et approuvée n'est plus redite ensuite.

## Tranche 12 — Environnement d'exécution

Ouverte le 2026-10-09, sur la demande de l'auteur (session joignable au démarrage, poste qui ne s'éteint pas sous une
session distante, sessions qui travaillent et exécutent dans leur conteneur, carte graphique partagée) ; deux décisions
approuvées : `partage-et-bac-a-sable` (P7 et §5.4) et `environnement-d-execution` (mise en œuvre, contexte mesuré).

**Livre**, en cinq livraisons utiles seules (critère de chacune dans la décision `environnement-d-execution`), essais
préalables menés sans toucher au service du projet en cours (leçon du 2026-10-08) :

- **A. Démarrage sans session** : le serveur démarre sans session ouverte (`--no-create-session-in-dir`, Q27) ; réglage
  du site `acces_distant.session_au_demarrage` (`aucune` par défaut, `reprendre`).
- **B. Veille retardée** (Q25) : règle du profil et son adaptateur (crochets d'état des sessions, demande d'éveil côté
  Windows, états au journal).
- **C. Conteneur généré** (I32, Q23) : conteneur du socle réparé, clé `conteneur` (contrat config 0.6.0), génération
  du `devcontainer.json` par `holarch projet creer` ; l'audit compare ; `modeles/projet/devcontainer.json` retiré.
- **D. Accès distant dans le conteneur** (C, Q24) : `devcontainer up` sur le conteneur existant, `claude
  remote-control` par `devcontainer exec`, connexion Claude dans un volume du conteneur ; `reveil` inchangé.
- **E. Type `calcul-gpu`** (C, Q26), adopté par le projet three.js de l'auteur après la mesure.

**Choix techniques (P12).**

| Choix | Raison | Ce qui le ferait changer |
|---|---|---|
| `devcontainer.json` généré, clés du format reprises telles quelles | format standard (VS Code, ligne de commande `devcontainer`, Codespaces), aucun vocabulaire refait | un besoin que le format ne porte pas |
| ligne de commande `devcontainer` (`up`, `exec`) | elle lit le même fichier que VS Code et réutilise son conteneur par étiquette | un conteneur dupliqué malgré l'étiquette (Q23) |
| service systemd de l'hôte qui lance le conteneur, pas une politique de redémarrage de Docker | Docker ne relance que la commande principale, pas `postStartCommand` ; le lancement reste hors du dépôt, donc rien de personnel n'est partagé | un site sans systemd |
| retarder la veille de Windows plutôt qu'éteindre le poste soi-même | un adaptateur arrêté rend la main à Windows, il n'éteint jamais au mauvais moment | l'auteur veut un arrêt complet plutôt qu'une veille |

**Hors tranche.** Le service de modèles partagé et la file d'attente des entraînements (I20, après l'étape 4) ;
l'avertissement à l'arrêt manuel du poste (Windows le permet, l'utilisateur garde « Arrêter quand même »), à proposer
sur mesure ; un pare-feu du conteneur, tant que les domaines de Remote Control sont inconnus (Q24).

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
  service entre guillemets. Option plus radicale, `--no-create-session-in-dir` : Q15, résolue le 2026-10-08 (joignable, rien à changer :
  `--continue` rattache en plus la dernière conversation après une relance).
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
- **Fait (2026-10-07)** : tranche 5, points 1 à 4. Contrôles `dependances-vulnerables` (seuil, gravité déclarée à défaut
  de score, un écart par paquet et version) et `outils-a-jour` (portée site, au compte) ; résultats gardés un jour ;
  3 tests. Règles `dependances-saines` et `outils-a-jour` approuvées, outils suivis listés au profil, trois projets à
  dépendances déclarés au contexte perso (deux dossiers sans dépôt git restent hors d'atteinte). Premier audit réel :
  27 paquets à failles élevées ou critiques (23 dans un projet, 3 et 1 dans deux autres), outils à jour ; une seconde
  exécution ne réinterroge rien ; écarts sur la carte des projets, y compris depuis le téléphone. Critère : reste à
  constater qu'une mise à jour qui corrige une faille résout son écart (le mécanisme de résolution est celui de la
  tranche 4, déjà éprouvé).
- **Fait (2026-10-07)** : critère de la tranche 5 tenu. Une dépendance à faille critique d'un projet déclaré, mise à
  jour avec l'accord de l'auteur (verrou seul, tests du projet passés), a résolu son écart au journal. Défaut trouvé à
  l'usage : un audit lancé par le service de l'interface, au `PATH` réduit, déclarait les outils introuvables ; la
  recherche d'un outil est désormais la même pour tous les contrôles, et le service reçoit le `PATH` du poste.
  Tranche close.
- **Ouverture de la tranche 6 (2026-10-07)** : consolidation, sur demande de l'auteur ; audit du code par un
  sous-agent ; injection possible par un nom d'outil (réglage de l'arbre passé au shell) corrigée aussitôt.
- **Fait (2026-10-07)** : tranche 6, points 1 à 6. `commun.js` (guillemets, marque, JSON atomique, outil sans shell
  ni entrée relative du PATH, git, `.claude.json`, clé MCP) remplace dix doublons ; `materialisation.js` est la seule
  définition de ce que `regles appliquer` écrit, l'audit la lit à blanc ; `audit.js` sort de `socle.js` (452 → 310
  lignes) ; réglages `controles:` avec défauts ; une fabrique d'unité et un `PATH` pour les services ;
  `bin/affichage.js`. Relecture adverse par un sous-agent : une régression réelle trouvée et corrigée (marque d'un
  fichier de règle à long en-tête non reconnue), trois écarts de comportement rétablis (sortie `--json`, code de
  sortie sur `settings.json` illisible, références vérifiées avant toute écriture). 47 tests ; site réel inchangé
  (mêmes fichiers, crochet, permissions, écarts). Tranche close.
- **Ouverture de la tranche 7 (2026-10-07)** : économie du contexte, décision `passation-sereine` sur l'idée de
  l'auteur (une passation plutôt qu'une compaction seule) ; registre de configuration créé, contrat nœud 0.3.0.
- **Fait (2026-10-07)** : tranche 7, points 1 à 6. `contexte.js` (taille lue dans la transcription, avis de passation,
  résumé de reprise de 1 500 caractères au plus), `holarch contexte alerte|debut`, réglages et crochets de Claude Code
  écrits au compte depuis la section `claude_code` du profil (manifeste, valeur posée à la main laissée, retrait de ce
  que HOLARCH a posé), mesure au tableau de bord ; 3 tests. Posé sur le poste personnel : compaction à 300 000, alerte à
  150 000, reprise au démarrage. Crochets essayés à la main sur la transcription de la session en cours : avis à 608 k
  tokens, résumé de reprise de 767 caractères. Référence de mesure au 2026-10-07 : contexte moyen relu par tour
  232 k sur 30 jours, 272 k sur 7 jours ; 10 sessions au-dessus du seuil cette semaine. Q5 résolue (registre de configuration).
- **Fait (2026-10-07)** : avis de passation constaté dans une vraie session (617 k tokens). À la demande de l'auteur,
  compaction avancée retirée (passation et `/clear` seulement), et deux règles de profil approuvées : `lecon-de-cloture`
  (à la clôture d'un sujet, la demande qui aurait mené au résultat ; reprise dans l'avis de passation) et
  `proposer-automatisations` (proposer sans exécuter). Proposé, non retenu pour l'instant : un « profil de travail »
  (biographie) dans le profil privé.
- **Fait (2026-10-07)** : reprise constatée après un vrai `/clear` : le résumé du projet ouvre la session suivante,
  qui reprend sur lui et l'avancement. Défaut trouvé à l'usage : l'état du dépôt venait de l'inventaire horaire et
  annonçait 4 fichiers non commités dans un dépôt propre ; le résumé le lit désormais en direct (fonction `etatDepot`,
  partagée avec l'inventaire) ; 1 test étendu.
- **Fait (2026-10-07)** : intégration continue d'un projet détectée par l'inventaire (décision de l'auteur : détectée
  plutôt que déclarée, une déclaration vieillit) : configuration GitHub Actions ou GitLab CI présente dans le dépôt,
  pas la preuve qu'elle tourne. Sur la carte d'un projet, dans l'outil MCP `projets` et dans le résumé de reprise
  (« aucune » : rien à lire après un envoi). Sur le poste personnel : 3 dépôts sur 12 en ont une. Test visuel passé dans
  le conteneur du socle (utilisateur `node`, qui a Chromium).
- **Ouverture de la tranche 8 (2026-10-07)** : configuration, identité de commit, sur demande de l'auteur (choix de
  l'identité parmi identité et réglages Claude Code par projet, ceux-ci en tranche 9) ; décision
  `identite-par-contexte` proposée ; Q18 ouverte (contexte professionnel).
- **Fait (2026-10-07)** : décision `identite-par-contexte` approuvée telle quelle ; Q18 résolue (identité fixe par
  contexte, adresse anonyme GitHub du compte de chaque contexte ; contexte pro déclaré avec son premier projet ; dépôt
  mixte laissé non déclaré). Idée « échecs » placée en tranche 9, avant les réglages de Claude Code par projet.
- **Fait (2026-10-07)** : tranche 8, points 1 à 5 et critère. Contrôle `identite-de-commit` (auteur du commit avant le
  commit, identité que git prendrait à l'audit ; un écart dit ce qui diffère, jamais les adresses ; projet non déclaré :
  non disponible), `identite-git.js` (réglage local posé là où l'identité effective diffère, noté dans
  `holarch.identite` ; réglage à la main laissé et dit), clé `identite` au registre de configuration (0.2.0) ; 1 test.
  Profil : identité par défaut et règle `identite-de-commit`, bloquante, approuvée. Appliquée aux cinq projets déclarés
  (accord de l'auteur) : crochet posé dans deux de plus. Le seul réglage local divergent (un projet à dépendances),
  signalé puis résolu quand l'auteur l'a retiré ; un commit sous une autre identité refusé dans le socle ; audit sans écart
  d'identité. Défaut trouvé à l'usage : un crochet impossible à poser (`core.hooksPath` d'un dépôt vers un chemin de
  conteneur absent de l'hôte) interrompait toute la commande ; il est désormais dit, et les autres projets passent.
  Ce `core.hooksPath` retiré ensuite (accord de l'auteur) : crochet posé, écart résolu. Tranche close.
- **Fait (2026-10-07)** : habitudes paramétrables, points a et b. L'avis de passation ne demande la leçon de clôture
  que si la règle `lecon-de-cloture` s'applique au dossier de travail (règle effective lue au-delà du seuil seulement,
  nommée sans recopier son texte ; une règle illisible ne retient pas l'avis). Contrôle `commits-pousses` (audit) :
  un écart quand le plus ancien commit non poussé a plus de `non_pousses_heures` (4 h par défaut, choix de l'auteur ;
  une session de travail passe sans bruit) ; branche sans amont : non disponible (choix de l'auteur) ; même lecture
  de l'amont que la reprise et le badge de la carte. Règle de profil `commits-pousses` (`verified`) proposée, en
  brouillon. Sur le poste : aucun écart à 4 h (un projet à 2 commits locaux depuis environ 2 h, écart à 1 h) ; 2 tests.
- **Fait (2026-10-07)** : idée de l'auteur, réglages proposés d'après ses habitudes. Mesure du délai entre commit et
  envoi (reflog de l'amont) : 90 % des envois en moins de 0,4 h dans le socle, 0,8 h dans le profil, 10,6 h dans un
  projet à dépendances (un oubli de 56 jours) ; le seuil de 4 h tient. Règles de profil `commits-pousses` (`verified`)
  et `reglage-mesure` (rappel : mesurer l'habitude avant de proposer un réglage) approuvées ; le contrôle tourne à
  l'audit sur les cinq projets déclarés, sans écart. `reglage-mesure` écrite au compte (`regles appliquer`, accord de
  l'auteur) ; audit du compte sans écart.
- **Ouverture de la tranche 9 (2026-10-07)** : échecs au journal, idée de l'auteur ; décision `echecs-au-journal`
  proposée, sur une mesure des transcriptions de 30 jours : 338 refus de permission non reconnus par `tool.denied`, 22
  des 24 tests rouges du socle sortis en code 0 derrière un tube. Leçons de clôture proposées hors tranche.
- **Fait (2026-10-07)** : tranche 9, points 1 à 4 et critère, décision `echecs-au-journal` approuvée telle quelle (refus
  non reconnus en origine `approbation`, leçons de clôture avec la récolte). Import en version 6 : `tool.failed` (motif
  d'une liste fixe, code de sortie, nom du programme), tests en fin de session, refus d'approbation ; `holarch garde`
  écrit `rule.enforced` ; compte unique `echecs` lu par le tableau de bord (carte « Échecs ») et la carte d'un projet
  (badge sur 7 jours) ; filtre par motif et famille `rule` au journal ; contrat événement 0.9.0 ; 1 test ajouté, 1
  étendu ; test visuel passé dans le conteneur. Sur le poste, 30 jours : 1 007 échecs (595 sorties non nulles, 226
  tests rouges sur 1 242 lancements, dont 199 sans code de sortie non nul, 117 autres), 450 refus d'approbation ; une
  mesure indépendante des transcriptions donne 1 005, 452 et 226 sur 1 251 (la session en cours n'est pas importée ;
  deux messages d'approbation d'une forme non listée, motifs élargis, restent `autre` dans l'historique). Commit sous
  une autre identité refusé dans le socle : `rule.enforced` au journal, compté sur la carte. Tranche close.
- **Fait (2026-10-07)** : boîte à idées lue (accord de l'auteur, puis son choix de rattachement) : la phase visée
  commence par l'étape quand elle est connue (« étape 3, récolte »), neuf phases réécrites ainsi ; l'inventaire lit
  `arbre/idees.md` sur la racine ; la vue Projets porte les idées de l'étape en cours, ni prises ni écartées (carte :
  badge dépliable sous le Reste ; outil MCP `projets`) ; le résumé de reprise les nomme. Sur le socle : 11 idées pour
  l'étape 3, résumé de 1 156 caractères ; 2 tests étendus ; test visuel passé dans le conteneur. Toute idée nouvelle va
  dans la boîte, pas dans ce Reste.
- **Ouverture de la tranche 10 (2026-10-07)** : création de projet, choix de l'auteur sur mesure (environ un projet par
  semaine ; critère de l'étape) ; commande d'abord, formulaire de l'interface et paramétrage depuis l'interface dans la
  boîte (I22, I23). Décision `creation-de-projet` proposée, sur la mesure des 9 dépôts du poste : oublis rattrapés de 1 à
  158 jours, quatre projets non déclarés. Relevé au passage : deux dépôts ont une identité locale à adresse non anonyme,
  dont un public, hors du contrôle d'identité car non déclarés.
- **Fait (2026-10-07)** : règle `lecon-de-cloture` inversée, décision du profil approuvée telle quelle (déroulé annoncé
  à l'ouverture d'un sujet de plus d'une étape, leçon comparée au déroulé à la clôture) ; écrite au compte.
- **Fait (2026-10-07)** : tranche 10, points 1 à 4, sur le choix de l'auteur pour la clé de déploiement (geste réservé).
  `src/creation.js` (`holarch projet creer`, huit étapes rejouables, à blanc sans aucune écriture, catalogue compris) ;
  `configAvantProjet` (module `regles`) lit le contexte et les types avant que le projet existe ; clé `creation` au
  registre de configuration (contrat config 0.3.0), portée par les types `depot-public` (public, MIT) et
  `methode-holarch` (journal) ; modèles du socle (`modeles/projet/`) tirés du conteneur le plus récent ; la LICENSE d'un projet public créé
  est soustraite au contrôle des données personnelles dans sa racine, comme pour le socle (sans quoi son titulaire
  ferait un écart et bloquerait les commits suivants) ; 1 test (création,
  rejeu sans changement, dossier occupé jamais touché, fichier manquant rajouté seul). À blanc sur le poste : un projet
  neuf, et un projet existant (README et `.gitignore` manquants, accès distant absent). Critère : le prochain vrai projet.
- **Fait (2026-10-07)** : migration des quatre projets non déclarés terminée, projet par projet avec l'accord de
  l'auteur. Le profil n'est pas un projet (il paramètre HOLARCH). pacs-montage-video retiré : la sortie (deux vidéos
  finales, crédits) et le retour d'expérience gardés dans `D:\Videos\pacs-montage-video`. okf-phoenix retiré :
  sauvegardé (bundle vérifié et `settings.local.json` dans `~/.claude/backups/`), supprimé sur GitHub par l'auteur
  puis en local. okf-bundle-template déclaré par la commande, types `depot-public` et `projet-dormant` (nouveau type,
  approuvé par l'auteur : `creation.etapes` sans conteneur ni accès distant, pour un dépôt peu actif, 4 commits dont le
  dernier le 2026-09-21) ; identité locale divergente retirée (geste de l'auteur, lancé par l'agent à sa demande) ;
  son `INSTANTIATE.md` fait retirer `arbre/` à l'instanciation (sans quoi chaque base hériterait de la déclaration
  du template) ; audit : trois écarts sur le nom du hub que le template sert (public, mais déclaré sans type), levés
  par une exception du projet, un sur `NOTICE` (Apache-2.0), soustrait au contrôle par le type `depot-public` comme la
  LICENSE. Défaut trouvé à l'usage : l'audit ne tenait un projet pour public que si sa racine se classait `public`, ce
  que ni la commande ni le socle ne posent ; le nom du template entrait dans la liste privée du socle. Un projet est
  désormais public aussi quand ses couches le déclarent (`creation.visibilite`, porté par `depot-public`) : une seule
  notion avec la commande (choix de l'auteur) ; 1 test. Audit conforme pour le socle et le template.
  Ses 4 commits publics portent une adresse non anonyme, réattribution possible si l'auteur le demande.
- **Fait (2026-10-07)** : copie de service (idée I16, décision `copie-de-service` approuvée telle quelle, sur le choix
  de l'auteur : une copie par commit et un lien). Mesure : cinq points d'entrée (import horaire, interface, crochets de
  Claude Code, serveur MCP, garde des six dépôts) lançaient la copie de travail, dont trois écrivent au journal.
  `src/service.js` : `holarch service [poser [<commit>]]`, export du commit (`git archive`), `npm ci --omit=dev`, lien
  `courant` basculé d'un coup, la copie posée et la précédente gardées, retour arrière en reposant une copie présente ;
  une copie neuve se tire seulement de `HEAD` d'une copie de travail propre aux tests verts. `BIN` suit le lien ; le
  minuteur d'import devient une unité marquée ; la reprise dit le retard de la copie sur `HEAD`. Règle
  `verifier-avant-de-rendre` : poser la copie au lieu de relancer l'interface. 1 test. Posée sur le poste personnel
  (accord de l'auteur) : minuteur posé à la main mis de côté, interface, import, entrée MCP, garde des six projets et
  crochets du compte sur le lien ; l'audit a vu puis résolu les huit points restés un temps sur la copie de travail.
  Critère tenu sur le poste : copie de travail cassée, l'import, la garde d'un autre projet et l'interface relancée
  tournent normalement. Défaut trouvé à l'usage : le binaire attendu se tirait de `HOLARCH_HOME` du processus, pas de
  l'accueil de la configuration ; une fois le lien posé, deux tests (accueil temporaire) voyaient leur crochet périmé.
  Il se tire désormais de l'accueil que reçoit la matérialisation.
- **Fait (2026-10-07)** : tranche 1, reprise après une veille du poste. Constat : après une mise en veille de Windows,
  le serveur Remote Control du projet reste `active` des heures sans être joignable depuis l'application ; aucune
  règle `Restart=` n'y peut rien (rien ne s'arrête) et WSL ne voit pas la veille. Un minuteur marqué
  (`holarch-reveil.timer`, chaque minute, posé avec le premier accès distant et retiré avec le dernier) lance
  `holarch distant reveil` : un écart de plus de cinq minutes depuis son passage précédent redémarre les accès
  distants actifs. 1 test. Essai réel le 2026-10-08 : deux veilles (7,4 h et 5,8 h) vues et suivies d'un redémarrage,
  projet joignable ensuite depuis l'application (constaté par l'auteur) ; Q21 résolue.
- **Ouverture de la tranche 11 (2026-10-07)** : récolte, choix de l'auteur ; méthode sur mesure (lexical : aucune
  redite trouvée), détecteur en deux temps approuvé (extraction déterministe, regroupement par `claude -p`).
- **Fait (2026-10-07)** : tranche 11, point 1. `src/recolte.js` et `holarch recolte [--jours] [--jusqua] [--modele]
  [--budget] [--a-blanc]` ; `fichiers` (import) et `gitleaks` (contrôles) partagés ; 1 test (doublons, injections,
  sous-agents, période, secret retiré, référence inconnue ignorée, à blanc et sans gitleaks : rien n'est envoyé).
  Options de `claude -p` vérifiées dans l'aide et par un appel réel (`structured_output`, environ 1 200 tokens de base) ;
  `--bare` écarté (clé d'API exigée). À blanc sur le poste, 30 jours : 578 messages et 28 mémoires de retour, 93
  sessions, 125 k caractères, aucun secret retiré.
- **Fait (2026-10-07)** : tranche 11, point 2, rejeu (`holarch recolte --jusqua 2026-10-06 --jours 365`). Aucune règle
  connue à cette date (toutes approuvées le 7). 8 règles attendues (consigne présente dans deux sources avant le 6) :
  passe 1, 7 retrouvées (`modele-par-etape` manquée), 20 redites dont 2 fausses alertes (exigences de produit d'un
  projet), 0,25 $ ; passe 2, 8 sur 8 mais groupes fondus à leurs bords, environ 18 groupes communs. Avec les 28 règles
  connues (30 jours) : 12 redites sur 28 rattachées à une règle existante, deux redites contradictoires. Critère de
  livraison tenu. Décision `recolte` proposée (brouillon) : règle `draft` au nœud commun des sources, refus gardé.
- **Fait (2026-10-07)** : tranche 11, points 3 et 4. Décision `recolte` approuvée telle quelle ; contrat règle 0.4.0
  (`harvest`, refus en `deprecated`). `holarch recolte --proposer` : le regroupement rend aussi identifiant, raison et
  contradictions ; une redite nouvelle devient une règle `draft` au plus bas nœud commun de ses sources (arbre du projet
  posé s'il manque), ajoutée sans réécrire le fichier ; une contradiction sort « à trancher » ; règles proposées et
  refusées passées au regroupement. La reprise dit les règles à approuver. 1 test, 1 étendu. Première passe (30 jours,
  0,27 $) : 21 redites, 13 couvertes, 7 règles proposées au profil (toutes ont des sources hors projet), 1 contradiction,
  tranchée par l'auteur (reformuler avant de décider : `reformuler-avant-de-decider` proposée, la consigne contraire
  gardée refusée).
- **Fait (2026-10-08)** : récolte chaque semaine (accord de l'auteur) : `holarch-recolte.timer`, le lundi à 8 h,
  rattrapé au démarrage, posé par `holarch service poser` (même mécanique que le minuteur d'import, mise en commun).
  Avis sur les huit brouillons suivis par l'auteur : 4 à approuver, 4 à refuser (I26 pour l'un) ; l'écriture de ces
  statuts dans le profil a été refusée à l'agent par le garde-fou de Claude Code (un agent n'approuve pas ses propres
  consignes) : à faire par l'auteur.
- **Fait (2026-10-08)** : coût des rappels mesuré, décision « règles sur déclencheur » abandonnée (avis suivi par
  l'auteur). Les 21 rappels du socle font 9 340 caractères, environ 2,7 k tokens par tour, 2 % du contexte relu par
  tour ; les lignes « Pourquoi » en font 23 %. Deux règles seulement ont un déclencheur net (envoi, commit : 571
  caractères) ; sur 311 sessions de 30 jours, 75 % des tours précèdent le premier envoi et 45 % le premier commit (ou
  n'en ont pas) : gain d'environ 360 caractères par tour, 0,07 % du contexte. Un texte injecté avant un outil
  n'arrive qu'à côté de son résultat (documentation des crochets), trop tard pour un message de commit ; injecté au
  démarrage, il reste dans le contexte. Rien construit ; le levier est l'oubli progressif (I27).
- **Fait (2026-10-08)** : permissions par projet (I26) mesurées, tranche non ouverte (avis suivi par l'auteur). Sur 30
  jours, 446 refus d'approbation, surtout dans le projet antérieur (mode `acceptEdits`) ; sur 7 jours, 37, tous dans un
  banc d'essai du 2026-10-03 ; le travail courant tourne en mode `auto` et le mode des accès distants est posé par site
  (tranche 1). Les autres refus de la semaine sont des garde-fous voulus (41 du classifieur du mode `auto`, 6 lectures
  refusées par `secrets-hors-contexte`). Une approbation accordée ne laisse pas de trace sûre : non mesurée.
- **Fait (2026-10-08)** : idée I3 (défaut trouvé à l'usage), sur mesure et choix de l'auteur. Sept défauts consignés
  depuis l'étape 2, tous de code, presque tous corrigés avec un test ; un seul revenu, le `PATH` réduit d'un service
  (essai du site de travail, deux fois, tranches 1 et 5), jusqu'à sa mise en commun en tranche 6 ; deux autres relèvent
  déjà de `coherence-globale`. Aucun mécanisme : règle `defaut-a-l-usage` proposée au type `methode-holarch`
  (brouillon), vue par le catalogue dans les deux projets du type ; approuvée telle quelle par l'auteur et écrite dans
  les deux (`regles appliquer`).
- **Fait (2026-10-08)** : idée I28, choix de l'auteur. Défaut trouvé à l'usage : les lectures de l'arbre passaient par
  le catalogue de l'inventaire horaire ; une règle ajoutée restait « 0 proposée », et la reprise de cette session omettait
  I28 et le dernier fait du journal. `arbreModifieDepuis` (adaptateur de l'arbre, dates des fichiers et des dossiers,
  retrait compris) et `Socle.arbreAJour` refont l'inventaire quand un arbre connu est plus récent que le catalogue ;
  appelé par `holarch regles` (dont `appliquer`, qui écrivait d'après le catalogue de l'heure), `audit`, `recolte` et la
  reprise. Copie posée, mesuré sur le poste : `holarch regles` en 0,62 s quand un arbre a changé (inventaire compris,
  sans audit ni import), 0,31 s sinon ; la reprise nomme aussitôt le dernier fait. 1 test.
  Restent sur le catalogue de l'heure : l'interface et le serveur MCP.
- **Fait (2026-10-08)** : sessions arrêtées en route (idée I29, accord de l'auteur). Constat : une session du socle
  s'est arrêtée sur une question à l'auteur, le poste s'est mis en veille, et le redémarrage de l'accès distant au
  réveil l'a laissée sans réponse, sans que rien le signale. Mesure sur 30 jours : 8 sessions sur 309 finies sur un
  appel d'outil sans résultat, dont une sur une question. `sessionsCoupees` (`contexte.js`, lecture de la fin des
  transcriptions partagée avec la taille du contexte) : sessions du même dossier, dans les 24 h, dont le dernier message
  est un appel d'outil sans résultat (une interruption par Échap n'en est pas une) ; le résumé de reprise les annonce
  juste après son en-tête, avec la question restée sans réponse. 1 test ; essai sur le poste : la session du matin et sa
  question retrouvées. Limites : les sessions d'un conteneur (autre dossier) ne sont pas vues ; l'annonce se répète à
  chaque démarrage pendant 24 h.
- **Fait (2026-10-08)** : passe globale sur le code écrit depuis la consolidation (`a9c40e6`, 69 commits, 1 958 lignes),
  sur proposition de l'agent et accord de l'auteur : trois relectures en parallèle (doublons et lectures périmées,
  chemins qui écrivent, code mort et tests), vérifiées dans le code. Aucun code mort notable ; 61 tests verts.
  Défauts réels (à corriger, choix de l'auteur, un commit et un test chacun) :
  - A1 : une règle `draft` d'une couche plus basse remplace une règle `stable` de même `id` (`regles.js`, `fusionner`) ;
    une redite récoltée sous un `id` existant retirerait le crochet de commit et couperait l'audit, sans signal ;
  - A2 : reposer le commit en service supprime la copie de retour arrière (`service.js`, `garder`) ;
  - A3 : catalogue écrit sans atomicité et relu sans protection (`stockage/catalogue.js`), désormais par le crochet de
    démarrage aussi : un fichier coupé bloque inventaire, règles, audit et reprise ;
  - A4 : lectures périmées laissées par I28 : la garde avant commit et `projet creer` lisent le catalogue de l'heure
    (exception ajoutée refusée encore une heure ; geste « puis relancer » non repris ; règles commitées sans la couche du
    type) ; contrairement à ce que dit l'entrée I28, ce ne sont pas seulement l'interface et le serveur MCP ;
  - A5 : `projet creer` rejoué après un commit refusé dit « déjà » sans commit (fichiers présents mais non suivis ;
    règles indexées) ; licence vérifiée après `git init` ;
  - A6 : `service poser` réactive les minuteurs et l'interface coupés à la main (`enable --now`), aucun retrait de la
    récolte payante ; la décision stable `recolte` dit encore « routine proposée, pas posée » : modification à écrire en
    brouillon, pour l'auteur ;
  - A7 : un redémarrage en échec arrête `distant reveil` (les accès suivants ne sont pas relancés, l'heure est déjà
    écrite) ; l'unité de réveil n'est pas réécrite par `service poser` (peut lancer la copie de travail) ;
  - A8 : `claude` cherché de deux façons ; la récolte, en service au `PATH` réduit, ignore `acces_distant.claude`.
  Tests manquants prioritaires : création à blanc sur un projet existant (T1), déclaration au profil refusée et remise
  en état (T2), licence sans modèle (T3). Risques faibles, à la clôture : liste des projets sans filtre de site, compte
  Claude Code réglé à deux endroits, seuil de 150 000 en dur au tableau de bord, lecture de l'amont et `git config`
  recopiées, fichier temporaire de `~/.claude.json` à nom fixe, récolte sans gitleaks en code 0, `claude -p` lancé
  depuis `/tmp`, copies d'installation interrompues jamais retirées, import en double dans `bin/holarch.js`. Arbre :
  contrats `noeud` (0.3.0), `regle` (0.4.0) et `config` (0.3.0) en usage sans approbation ; Q4 à trancher ou reporter.
- **Fait (2026-10-08)** : corrections de la passe globale, un commit et un test chacune (70 tests verts).
  - A1 : un brouillon plus bas ne remplace plus une règle approuvée de même `id` ; l'approuvée tient, le brouillon se
    montre à côté (`proposee`) et compte parmi les règles à approuver (`aApprouver`, partagé par la reprise et la page) ;
  - A2 : reposer la copie en service garde celle du retour arrière ;
  - A3 : catalogue écrit d'un coup (`ecrireJson`, temporaire au numéro du processus) ; un instantané coupé se lit vide,
    et l'inventaire suivant le remplace sans fausses apparitions ;
  - A4 : la garde avant commit relit l'arbre changé en mémoire (`arbreFrais`), sans inventaire : dans un crochet de git,
    `GIT_INDEX_FILE` fausserait la lecture des autres dépôts ; `projet creer` lit l'arbre frais et remet le catalogue à
    jour avant les règles (celles du type écrit à la création) ;
  - A5 : `projet creer` rejouée commite les fichiers présents mais jamais commités, et les règles indexées sans commit ;
    une licence sans modèle arrête tout avant `git init` ;
  - A7 : au réveil, un redémarrage en échec n'arrête plus les suivants, il se dit (code de sortie 1) ; `service poser`
    réécrit l'unité de réveil ;
  - A8 : `claude` se cherche d'une seule façon (`binaireClaude`, réglage `acces_distant.claude` compris), pour la récolte
    comme pour l'accès distant ;
  - T1 à T3 : création à blanc sur un projet créé, déclaration refusée par le profil (contexte remis en état), licence
    sans modèle ; aucun nouveau défaut.
  - A6 : décision `routines-posees` (modifie `recolte` et `copie-de-service`), approuvée telle quelle par l'auteur :
    l'état d'activation de systemd fait foi. `service poser` réécrit une routine coupée à la main sans la rallumer
    (interface comprise) et le dit ; `holarch service` montre l'état des quatre routines ; 1 test (71 verts).
- **Fait (2026-10-08)** : passe par famille sur tout `src/` (accord de l'auteur, quatre sous-agents en lecture seule,
  constats les plus graves revérifiés dans le code). Rien corrigé ; choix à l'auteur. Chaque famille propose un contrôle
  automatique en brouillon (rapports dans la session du 2026-10-08, à réécrire en test à la correction).
  - **N, écritures non atomiques** : N1 journal lu sans tolérance (`stockage/journal.js:25`, code de l'étape 1) : une
    ligne coupée arrête inventaire, import horaire et reprise, en silence ; N2 inventaires et imports concurrents
    (crochet de session, minuteur, interface) : `element.retired` fantômes, événements en double, usage MCP doublé ;
    N3 `~/.claude.json` réécrit en entier pendant que Claude Code l'écrit (`service.js:73`, `distant.js:86`) ; N4 règles
    générées, unités systemd, crochet `pre-commit`, `rules.yaml` réécrits en place (fichier coupé pris pour étranger ou
    garde sautée). Contrôle : tout `writeFileSync` de `src/` passe par un helper atomique, exceptions nommées.
  - **C, catalogue qui décide** : C1 garde muette sur un dépôt déplacé ou un worktree jusqu'à l'inventaire suivant
    (`audit.js:58`) ; C2 création : identifiant de chemin périmé déclaré et commité dans le profil (`creation.js:158`) ;
    C3 `regles appliquer` recrée l'ancien dossier d'un dépôt déplacé ; C4 garde : règles fraîches, liste privée périmée
    (`audit.js:21`) ; C5 fraîcheur datée en fin d'inventaire et décision lue dans l'index (trouvé aussi par R). Contrôle :
    toute lecture du catalogue dans une fonction qui écrit ou décide dit pourquoi elle peut être périmée.
  - **R, rejeu qui dit « déjà »** : R1 « github : deja » avec des commits non poussés (`creation.js:209`, le banc le
    produit sans le vérifier) ; R2 « accès distant : service actif » sans regarder l'état (`creation.js:249`) ; R3 une
    pose interrompue passe pour « coupée à la main » et n'est plus rallumée (`distant.js:36`, correction A6) ; R4 un
    fichier de base ignoré par git bloque tous les rejeux (`creation.js:136`) ; R5 réponse « deja » à l'annonce unique
    des sessions coupées sans preuve de remise ; plus mineurs : clé de déploiement redemandée, état d'import avancé
    malgré des refus, crochet sans bit d'exécution dit en place. Contrôle : banc de rejeu après un geste qui défait,
    oracle lu dans l'état réel.
  - **M, réglage posé à la main écrasé** : M1 `distant activer` rallume le minuteur de réveil coupé (`distant.js:151`,
    trou de la décision `routines-posees`) ; M2 crochets et clés de `settings.json` remis ou doublés après un geste à la
    main ; M3 `service poser` repointe un serveur MCP `holarch` réglé ailleurs ; M4 unités modifiées à la main
    réécrites ; M5 identité git retirée à la main reposée ; M6 `ecrireJson` remplace un lien et perd les droits.
    Contrôle : tout écrivain d'un fichier partagé avec l'auteur nomme son test du geste à la main.
  - **V, deux vues, deux chiffres** (seconde vague) : V1 les projets retirés du catalogue sortent de la vue Projets
    (245,51 $ et 21 sessions sur 307 comptés nulle part en 30 jours ; identifiant brut au tableau de bord) ; V2 état du
    dépôt de l'heure dans l'interface et le MCP, en direct dans la reprise (2 contre 3 non poussés constaté) ; V3 « Tours »
    = session seule ou sous-agents compris selon la colonne et le MCP (88 sessions sur 307) ; V4 « écarts ouverts » de
    l'audit courant contre ceux du journal (contrôle indisponible jamais résolu, contenu figé à la première détection) ;
    V5 coût d'un projet en part datée sur la carte, en coût entier sur 90 j dans sa liste ; V6 histogramme par jour UTC
    contre sessions par jour de fin ; V7 deux « seuils de passation » pour deux mesures ; V8 reprise tronquée sans le
    dire (3 restes sur 7) ; V9 chiffres en infobulle, inaccessibles au toucher. Contrôle : bouclage de la vue Projets
    sur le total du tableau de bord (rouge aujourd'hui sur V1). Choix à l'auteur : où ranger un projet retiré, quelle
    notion de tour, état du dépôt en direct ou daté.
  - **E, erreurs avalées** (seconde vague) : E1 reconstruction de l'index sans annulation de la transaction
    (`stockage/index.js:20`) : avec N1, une ligne coupée laisse l'interface verrouiller l'index (import, MCP, reprise et
    garde en échec, rien au journal) ; E2 un `rules.yaml` illisible fait disparaître les règles bloquantes sans signal,
    et `regles appliquer` retire alors fichiers, crochet et refus de lecture des secrets ; E3 le contrôle des secrets se
    dit fait quand git échoue (`controles.js:110`) et ferme l'alerte ; E4 un adaptateur en erreur efface ses fiches du
    catalogue (règles de tous les projets pour une heure si l'arbre est illisible) ; E5 `git()` de l'inventaire rend
    null pour tout échec (« 0 fichier modifié », identifiant de projet changé) ; E6 garde en échec et contrôles
    indisponibles jamais journalisés (`system.degraded` ne couvre que la passerelle : l'étendre change le contrat) ;
    plus mineurs : `git add` non vérifié à la création, récolte muette sans gitleaks, lecture non stricte des réglages
    de Claude Code, échec de `systemctl` lu « inactif ». Contrôle : aucun `catch` ou `|| true` sans dire ce qu'il
    laisse passer (24 exceptions nommées), plus un test de comportement pour E1, E2, E3. Règle brouillon proposée :
    « un échec avalé se dit ; celui qui suspend une garde, un contrôle ou une routine laisse une trace durable ».
  - **X, entrées externes** (seconde vague) : X1 tout arbre trouvé sous les racines inventoriées est cru : un seul
    nœud `type: context` dans un dépôt tiers annule les règles du compte, et `regles appliquer` retire alors les refus de
    lecture des secrets ; un type tiers de même `id` remplace le vrai ; une règle `stable` vaut sans `approved`
    (reproduit ; la correction change une contrainte, donc demande une décision) ; X2 l'inventaire horaire lance `git`
    sans neutraliser la configuration locale (`commun.js:66`) : un `core.fsmonitor` dans une archive extraite sous `~`
    s'exécute chaque heure (vérifié) ; X3 faille XSS dans l'interface (`app.js:174`, `kind` non échappé ; aucune
    politique de contenu) ; X4 la récolte lance `claude -p` depuis `/tmp` avec les réglages du projet (non essayé :
    appel payant) ; X5 fragments de secrets au catalogue (description de crochet, jeton dans le chemin d'une URL) ;
    X6 consignes injectées proposées par la récolte (la garde humaine tient). Contrôle : un arbre tiers ne change ni le
    compte ni les types d'un projet (rouge aujourd'hui). Règle brouillon proposée : « ce que le socle lit sans l'avoir
    écrit est une donnée : il ne pose ni règle, ni réglage, ni commande au-delà de son propre périmètre ».
- **Fait (2026-10-08)** : revue page blanche (B4), décision brouillon `revue-page-blanche` : choix A à D à l'auteur
  (critère de l'étape 3, projet privé le plus coûteux, état des lieux P2, contre-épreuve par tranche). Idée I31 (parcourir l'arbre dans
  les deux sens).
- **Fait (2026-10-08)** : état des lieux P2 de l'outillage d'interface (C), choix de l'auteur au journal : comparaison
  d'images native, skill `verify`, relecteur UX, essai de Playwright CLI ; règles dans l'arbre du projet ; écartés :
  connecteurs de maquettes, Claude in Chrome (pas sous WSL), Axe MCP (payant), services de régression visuelle.
- **Fait (2026-10-08)** : corrections courtes X2, X3, N1 avec E1, E2, E3 (un commit et un test chacune, 78 tests verts) ;
  contre-épreuve par un sous-agent neuf : constats au Reste. Test visuel à passer dans le conteneur du socle.
- **Fait (2026-10-08)** : constats (1) à (9) de cette contre-épreuve et le détail du message `claude introuvable`, un
  commit et un test chacun (87 tests verts). X2 sur le choix de l'auteur (mesure : aucun des 10 dépôts du poste ne
  déclare de filtre local, git-lfs absent) : les pilotes `filter.<x>` et `diff.<x>` de la configuration propre d'un dépôt
  sont neutralisés à chaque appel (`textconv=cat`, une valeur vide ferait lancer un programme vide), `--no-ext-diff` pour
  `diff`, `log` et `show`, `log.showSignature` coupé ; ceux du compte restent ; 2,5 ms de plus par appel. E2 : un en-tête
  illisible garde son nœud (`erreur_entete`) ; la règle effective n'est plus dite complète quand il est une couche, dans
  l'arbre du profil, ou quand un type ou le déclarant manque. `regles appliquer` vérifie tout avant d'écrire
  (`appliquerRegles`) ; création : étape en échec ; refus journalisé ; `memoire-remplacee` indisponible ; écart du profil
  compté au compte seul ; index annulé aussi sur un échec du schéma ; trois insertions échappées dans l'interface, avec un
  contrôle statique. Test visuel passé (politique de contenu de X3 comprise) dans un conteneur jetable de l'image du socle,
  Chromium et 99 bibliothèques extraits de l'ancien conteneur (il ne démarre plus hors de VS Code). Seconde contre-épreuve
  par un sous-agent neuf : (3) à (10) complets, X2 et E2 incomplets, constats au Reste.
- **Fait (2026-10-09)** : constats (A) à (H) de la seconde contre-épreuve, puis (1) à (5) d'une troisième, un commit
  et un test chacun (93 tests verts), envoyés. `gitLu` pour lire un dépôt quelconque (inventaire, audit) : crochets,
  filtres, pilotes, signatures, transport et sous-modules neutralisés, réglages par `GIT_CONFIG_COUNT` ; `git` normal
  pour les dépôts de l'auteur ; `gitInventaire`. En-têtes illisibles : comptés seulement s'ils pouvaient être la couche
  manquante, signalés sinon ; deux en-têtes du socle cités. Copie de service non posée (travail en cours d'une autre
  session dans la copie de travail).
- **Fait (2026-10-09)** : tranche 12, livraison B commencée (Opus 5.5 `xhigh`) ; Q25 résolue par un essai depuis le
  téléphone : dans une session distante, les crochets de début et de fin de tour et de fin de session se déclenchent,
  et l'archivage arrête la session. Suite : mécanisme côté Windows qui retarde la veille. Copie de service à jour
  (05b39c7).
- **Fait (2026-10-09)** : tranche 12, livraison B, mécanisme et adaptateur (règle en brouillon, rien de posé au
  compte). État des lieux P2 : PowerToys absent ; l'API de Windows (`PowerCreateRequest`, `PowerSetRequest` avec
  `PowerRequestSystemRequired`, documentation lue) se tient par le PowerShell de Windows, sans rien installer ; une
  veille demandée à la main lève la demande (documenté). Essais : demande lue sans droits d'administrateur
  (`SystemExecutionState` 0x1 tenue, 0x0 avant et après ; `powercfg /requests` les exige) ; lancée depuis un service
  systemd, relâchée à la fin de son entrée standard comme à la mort de son lanceur (`kill -9`, moins de 4 s). Poste :
  veille sur secteur à 300 min, S3. Mesures sur 30 jours : 1 728 tours, 24 interrompus (`Stop` ne vient pas après une
  interruption, documenté), médiane 1,1 min, 99 % sous 65 min. `src/veille.js` : crochets `holarch veille noter`
  (`UserPromptSubmit`, `Stop`, `StopFailure`, `SessionEnd`, synchrones : une session distante tourne en `-p`, où un
  crochet en arrière-plan est tué), session distante reconnue à `CLAUDE_CODE_BRIDGE_SESSION_ID` ou
  `CLAUDE_CODE_ENVIRONMENT_KIND=bridge`, processus de la session noté (premier ancêtre non-shell, début lu dans
  `/proc`) ; tour interrompu et question à l'auteur lus à la fin de la transcription (`src/transcription.js`, partagé
  avec `contexte.js`) ; gardien `holarch veille tenir` (service `holarch-veille`, posé et retiré avec le réveil, posé
  par `service poser`) ; `power.held|released|failed` au journal (contrat événement 0.10.0) ; contrôle de site
  `veille-retardee` ; crochets générés quand la règle s'applique ; `holarch veille` dit l'état. 10 tests (104 verts).
  Essai réel dans un accueil temporaire : note d'une session (processus `claude` retrouvé), demande tenue (0x1),
  relâchée moins de 5 s après `SessionEnd` (0x0), deux événements au journal. Règle `veille-retardee` proposée au
  profil (brouillon, `blocking`, contrôle `veille-retardee`).
- **Fait (2026-10-09)** : relecture du fil des commits (point 6 de `idees-fondatrices`) par trois instances neuves
  en lecture seule (sommet, architecture, contrats et étapes), suspendue à 93 % du quota puis reprise : 197 objectifs
  relevés dans les premières versions du 2026-10-03, aucun sorti du texte, 6 changés de sens sans décision et 4 incertains
  (au Reste). La dérive est dans la pratique et le code, et dans des décisions dont le texte n'a pas suivi
  (`forme-etape-2` : §4 et §10 jamais réécrits ; `passerelle-par-site` sans `modifies`). Idée I34 (garde de quota), Q29.
- **Fait (2026-10-09)** : faille du conteneur (palliatif 7 de `modules-et-palliatifs`). Contrôle `montage-sensible`
  (configurations Dev Containers lues par `jsonc-parser`, celui de VS Code : `mounts`, `workspaceMount`, `-v` et
  `--mount` de `runArgs` ; un identifiant de l'hôte, même en lecture, le Docker de l'hôte, ou les données de HOLARCH en
  écriture font un écart ; Compose ou variable inconnue : non disponible) ; règle `conteneur-isole` en brouillon au
  profil (`verified`). Mesure en route : 209 sessions sur 305 en 30 jours tournent en conteneur, et leurs transcriptions
  et mémoires arrivent dans le `~/.claude` de l'hôte par ce montage ; un volume seul aurait rendu HOLARCH aveugle sur
  elles et privé les conteneurs des règles du compte. Choix de l'auteur, « la solution la plus propre et cohérente » :
  volume propre et `CLAUDE_CONFIG_DIR` (conseil d'Anthropic) ; de `~/.claude`, seulement le dossier de transcriptions
  du projet et `rules` en lecture (créés par `initializeCommand`) ; le contrôle n'admet que ces deux-là. Appliqué au
  modèle (`projet creer`), au conteneur du socle (`HOLARCH_HOME` de l'hôte n'y est plus) et, sur le choix de l'auteur,
  aux quatre autres conteneurs du poste d'un coup (trois commits locaux, un dossier sans git) ; un volume neuf
  appartient à root, rendu à l'utilisateur par `postCreateCommand` (essayé sur l'image du socle). 1 test, 1 étendu ;
  105 verts. Connexion à Claude à refaire une fois dans chaque conteneur reconstruit.
- **Fait (2026-10-09)** : corrections de B, les 17 constats de la contre-épreuve et le gardien qui suit la règle, un
  commit et un test chacun (114 tests verts). « Travaille » borné par l'activité de la transcription et de ses
  sous-agents (immobile 30 min : attente depuis la dernière écriture ; une attente suivie d'écritures travaille de
  nouveau) ; `PermissionRequest` et `Elicitation` notées comme attentes ; gardien relancé par `service poser`, posé
  seulement quand la règle s'applique au compte (retiré sinon, laissé si les règles sont illisibles ; `regles appliquer`
  le pose sans le relancer) ; interruption lue en tête d'un texte de l'auteur seulement ; transcription notée lue
  seulement si c'est un fichier sous `projects/` (une FIFO bloquait le gardien) ; note relue avant d'être effacée ;
  mécanisme cherché à chaque besoin ; `power.failed` réduit à `{motif, code}` ; essais espacés après une demande morte
  aussitôt ; `power.held` redit quand une session arrive ou part ; état du gardien (`veille-gardien.json`) comparé au
  besoin par le contrôle et `holarch veille` ; erreur du crochet gardée datée (`veille-erreur.json`), dite une semaine ;
  crochet absent imputé à la règle qui désigne le contrôle ; node lancé seulement pour une session distante ; lecture
  du vrai `/proc` éprouvée. Choix de l'auteur écrits dans `environnement-d-execution` : B couvre l'hôte ; contrat
  événement déclaré dans ses `modifies`. Contrat 0.10.0 (brouillon) aligné.
- **Fait (2026-10-09)** : Q29 résolue, non : la ligne d'état ne tourne qu'au terminal (aucun relevé de la session
  distante en cours, lancée en `claude --print`, ni d'une session neuve ouverte depuis l'application, ni d'une session de
  l'extension VS Code) ; posée au compte le temps de l'essai, retirée, `settings.json` revenu à l'identique. I34 cherche
  une autre source.
- **Fait (2026-10-09)** : corrections de la contre-épreuve du conteneur, sur quatre choix de l'auteur (retirer le
  `--privileged` ; le gardien de veille suit la seule règle ; lire les conteneurs construits plutôt que se dire non
  disponible dès une feature ; déployer par la CI, et toute variable de l'hôte passée au conteneur est un écart, quel
  que soit son nom). Les 7 majeurs, les mineurs 13 à 24 et 26, et le second envoi (accès distant sur un dépôt à conteneur), un
  commit et un test chacun (126 tests verts) : dossier de travail résolu sous `/workspaces/` ; `--mount` lu comme le CLI
  Docker (CSV, casse, booléens de Go), `-v` comme le démon ; options de `runArgs` lues comme pflag, privilèges (fichier,
  `runArgs`, features locales) ; variables résolues comme le CLI ; un contrôle lu en partie garde ses écarts sans rien
  résoudre (audit) ; dossiers personnels Windows ; volume `o=bind` ; lien au chemin admis ; conteneurs construits
  inspectés par l'inventaire Docker (montages, privilèges ; une feature publiée sans conteneur à inspecter : non
  disponible) ; `initializeCommand`, crochets des réglages du dépôt, accès distant de l'hôte sur le dépôt ; import
  robuste (fichier illisible ou au-delà de 400 Mo passé et compté, mesure : 152 Mo au plus sur 805 ; une transcription
  de conteneur ne se rattache qu'au projet de ce conteneur, `origine: conteneur`, textes bornés) ;
  `CLAUDE_CODE_PROJECT_DIR_NAME` et `chown` en `onCreateCommand` dans le modèle, le socle et trois dépôts du poste
  (commits locaux ; le dépôt sans git, fichier seul) ; dans le dépôt au `--privileged` : retiré, jetons sortis de
  `remoteEnv`, workflow manuel de déploiement du relais (secret limité à l'app). Sur le poste, seul écart restant :
  `acces-distant` du socle (le risque du majeur 6, réel jusqu'à D). B : mineur 1 corrigé (tenue reprise redite).
- **Fait (2026-10-09)** : B, mineurs 2 à 9 de la contre-épreuve, un commit et un test chacun (134 tests verts) : le
  gardien suit la seule règle (posé et retiré par `regles appliquer` et la pose de la copie de service, jamais par un
  accès distant ; le contrôle le veut actif dès que la règle s'applique) ; une question ne fait pas attendre une
  session dont un sous-agent écrit après elle ; activité lue à la dernière entrée datée (mesure : 38 transcriptions
  distantes sur 56 en 30 jours changent plus de 30 s après leur dernière entrée datée), `BOUGE` à 30 s ;
  `etatGardien`, une seule lecture pour le contrôle et `holarch veille` (heure locale, erreur du crochet dans la vue,
  demande peut-être tenue sans besoin) ; règle indéterminée sans profil unique (`indetermine`), gardien laissé et
  relancé s'il tourne ; erreur du gardien dite sur sa ligne sans interrompre `regles appliquer` ni `service poser` ;
  `bin/veille-noter.js`, point d'entrée léger des crochets, avec un repli shell qui écrit l'erreur si node ou ses
  modules ne se chargent pas, effacée à la note réussie suivante (`holarch veille noter` retiré) ; effacement d'une
  note par renommage. Deux défauts trouvés en écrivant les textes : `data.origine: conteneur` écrasé par l'origine
  d'un refus d'outil, renommé `data.environnement` (rien au journal réel) ; l'en-tête de `environnement-d-execution`
  illisible pour l'arbre depuis son approbation (« : » non cité), corrigé, test sur tous les en-têtes du socle.
  Textes : contrat événement, 0.10.0 marquée en attente d'approbation ; décision `veille-et-conteneur-precisions` en
  brouillon (ligne B, borne d'immobilité, règle `veille-retardee` réécrite, gardien, risque résiduel jusqu'à D,
  limites connues).
- **Fait (2026-10-09, soir)** : les six mineurs de la contre-épreuve des corrections de B et les deux choix de
  l'auteur, un commit et un test chacun (136 tests verts, chaque test éprouvé contre l'ancien code). Gardien posé
  seulement si un systemd utilisateur dit son état (`is-system-running`) : sans lui, « non posé », rien d'écrit, aucune
  erreur, et `holarch veille` le dit impossible ; essayé dans un conteneur jetable de l'image du socle, avec son faux
  `systemctl` (qui répond 0 à tout) et sans `systemctl` ; une erreur de lancement se dit (plus « code null »).
  Sous-agents lus à tout niveau (`subagents/workflows/wf_<id>/` : 187 agents de workflow en 30 jours, et 8 journaux de
  workflow, qui ne sont pas des transcriptions). Une note
  non faite garde l'erreur du crochet. Heure locale éprouvée à UTC+14. Exception du socle jusqu'à D :
  `montage_sensible.exceptions` (`{ecart, pourquoi}`, contrat de configuration 0.4.0) à la racine de l'arbre du socle ;
  vu sur le vrai socle, `montage-sensible` fait, sans écart ; D la retire. `regles appliquer` refuse d'écrire un compte
  sans profil unique (le compte réel en a un). Textes : une seule mesure datée (36 transcriptions distantes sur 53,
  jusqu'à 6 jours ; 4 silences de plus de 11 min pendant un tour, tous après un appel court, d'où « hors attente de
  permission »), règle proposée reformulée, en-tête du contrat événement en 0.9.0 avec 0.10.0 proposée, redite de la
  tenue précisée, limites reprises. Rien posé, rien poussé.
- **Fait (2026-10-09, soir)** : approbation de l'auteur (récapitulatif et choix cliquables) : décision
  `veille-et-conteneur-precisions` (stable ; `environnement-d-execution` amendée : ligne B, borne d'immobilité ; la
  livraison C prend la 0.5.0 du contrat de configuration, la 0.4.0 étant prise par `montage_sensible`), règle
  `veille-retardee` réécrite au profil, contrat événement 0.10.0 et son schéma. Pose : `holarch service poser`
  (`520a1df`, 80 commits de retard rattrapés, gardien posé), puis `holarch regles appliquer` (6 crochets de veille au
  compte, règle `approbation-recapitulee` écrite). Critère de B, temps 1 vérifié : les crochets sont repris à chaud par
  une session déjà ouverte (documentation : « normally picked up automatically by the file watcher ») ; la session
  distante en cours notée, demande d'éveil tenue, aucune erreur ; hors mode auto, une demande de permission la note
  « attend », comme prévu. Délai de veille non baissé : passation d'abord.
- **Fait (2026-10-10)** : critère de B tenu, dans une session distante (Opus 5.5 `xhigh`) ; livraison B close. Temps 2 :
  session notée, demande tenue (`power.held` à 09:27), délai de veille sur secteur baissé à 10 min à 09:28, tour fini ;
  au réveil programmé de 09:44, aucune saisie sur Windows depuis 31,7 min (`GetLastInputInfo` : sans la demande, le
  poste se serait endormi), aucune « veille de » du réveil (passé chaque minute), même session ; délai remis à 300 min
  à 09:44 et relu (`0x4650`). Temps 3 : `power.released` (`aucune-session`) à 10:15:17, 30,2 min après la dernière
  entrée de la transcription (09:45:08) ; le réveil suivant renote la session (`power.held` à 10:23). La veille
  effective après la levée n'est pas observée (elle couperait la session) ; elle est attestée par la levée.
- **Fait (2026-10-10)** : décision `exceptions-hors-du-depot` appliquée, un commit et un test chacun (143 tests verts,
  chaque test éprouvé contre son parent). Lecture commune des exceptions (`exceptions`, `regles.js`) : couche par
  couche, avec leur provenance ; sans raison, une exception ne vaut plus, `donnees_personnelles` compris (toutes celles
  du poste en ont une). `montage_sensible` lu au profil et au contexte seulement, hors du dépôt contrôlé ; porté par un
  type ou un projet, il n'est pas lu et la règle effective le dit. Exception dite dans le résultat du contrôle et par
  `holarch audit` ; périmée, elle devient un écart du compte (audit de tous les projets, sur ce site). Défaut trouvé à
  l'usage : un projet lu en partie (features publiées non lues, deux sur le poste) empêchait tout signal d'exception
  périmée ; l'accès distant et les crochets d'un dépôt, toujours lus en entier, se jugent donc partout. Profil :
  `conteneur-isole` en `derogable: false`, exception du socle déplacée au contexte personnel. Contrat de configuration
  0.5.0, C en 0.6.0, trois limites de B écrites dans `veille-et-conteneur-precisions`. Lu sur le poste : socle sans
  écart, exception utilisée, rien de périmé. Contre-épreuve (instance neuve en lecture seule, `xhigh`, scripts dans
  `/tmp/contre-epreuve-b3/`) : constats (1) à (9) tenus, sept avec réserve ; décision tenue à la lettre ; quatre
  majeurs nouveaux, dont une régression de `b7590da` (une clé de réglage `constructor` ou `toString` mettait garde et
  audit en panne, commit laissé passer), corrigée aussitôt (`f161457`). Copie de service non posée.
- **Fait (2026-10-10)** : contre-épreuve de `exceptions-hors-du-depot`, (b), (d) et quatre mineurs, un commit et un test
  chacun (146 tests verts ; chaque test échoue sur son parent, ou sur un mutant quand le parent ne se charge pas, et
  chaque branche nouvelle tuée par un mutant). (d) : le filtre « hors du dépôt » éprouvé par le contrôle lui-même (mutant
  M1 rouge). (b) : une exception s'applique aux projets que son nœud couvre (`projetsCouverts`, déclarés sous lui dans
  l'arbre du profil) ; elle n'est pas jugée si, dans l'un d'eux, le dépôt est absent de ce site, le projet hors du
  catalogue, le contrôle en échec, ou la chaîne du projet ne passe plus par son nœud. Mineur 1 : un écart non jugé ne
  retient que lui-même. Mineur 5 : branche `crochets` éprouvée (M5 rouge). Mineur 2 : une exception écrite dans le dépôt
  contrôlé, sans valeur, sans raison, ou portée par un type ou un projet, se dit à l'audit avec ce qui l'écarte
  (`lireExceptions`, `exceptions_ignorees`). Mineur 6 : un seul test « dedans » (`commun.js` ; l'ancien de `regles.js`
  prenait un dossier `..x` du dépôt pour l'extérieur) et une seule désignation d'un nœud (`designation`, `arbre:chemin`).
  Laissés, avec leur raison : `provenance` objet pour une règle, chaîne pour une exception (la chaîne est la forme d'un
  lien du contrat nœud §3, celle que portent l'écart au journal et l'affichage) ; `projets.js:24` teste « dedans » par un
  préfixe sur des chemins normalisés, dans la boucle de l'import (le changer changerait le sens d'un chemin relatif).
  Automatisation acceptée par l'auteur : `npm run eprouver -- parent|mutant …` (`bin/eprouver.js`), qui remplace les
  scripts que chaque session réécrivait dans `/tmp` ; témoin vert d'abord, un échec au seul chargement ne compte pas ;
  1 test (147 verts), essayé sur le socle (mutant du mineur 6 rouge, mutant de l'outil vu par son test). Copie de
  service posée à la demande de l'auteur (`5d1971a`) ; envoi refusé à l'agent par le classifieur du mode `auto`, puis
  fait en mode manuel sur approbation de l'auteur (`54fa3ed`).
- **Reste** :
  0. **Contre-épreuve de l'application de `exceptions-hors-du-depot`** (`8776398` à `0eebabc` et `bfc352f` du profil,
     2026-10-10, scripts dans `/tmp/contre-epreuve-b3/`, rapport dans la transcription `80c50cac`, sous-agent
     `aac2690360a154fe6`). (b), (d) et les mineurs 1, 2, 5, 6 faits (Fait ci-dessus). Copie de service posée le 2026-10-10
     (`5d1971a`), à reposer après les corrections de (a) et (c).
     Majeurs restants, reproduits :
     - (a) un nœud du dépôt qui porte `projects:` peut devenir le déclarant retenu (le premier par titre, `regles.js`,
       `regleEffective`) : la chaîne repart de la racine du dépôt, `conteneur-isole` disparaît sans dérogation ; en
       `type: context`, le dépôt devient un second profil, le compte indéterminé, l'audit dit « conforme » ; seul signal,
       dans la vue des règles. Défaut antérieur (famille X1) ; le corriger change qui peut déclarer un projet : décision.
       Piste du rapport : seul un nœud d'un arbre de profil hors du dépôt contrôlé déclare, toute ambiguïté est un écart
       (`projetsCouverts` lit déjà ainsi les déclarations).
     - (c) collision d'identifiant d'arbre (`id: profil` à la racine du socle) : le lien du contexte se résout vers elle,
       ses règles prises pour celles du profil, sans signal. Défaut antérieur ; piste : refuser deux racines de même `id`.
     Mineurs restants : exception utilisée visible seulement en ligne de commande (ni journal, ni interface, ni MCP) ; un
     nœud d'un autre dépôt peut déclarer un projet avec ses exceptions (tient à (a)) ; contrat de configuration :
     `donnees_personnelles` dit « profil, projet », posé au type, et la périmée « sur ce site, là où elle a été lue en
     entier » non dite (changer le contrat : décision) ; hors décision, les exceptions de `donnees_personnelles` se
     lisent dans le dépôt contrôlé (même menace). Premier lot, réserves : profondeur des agents de workflow bornée à 4 (le
     texte dit « à tout niveau ») ; `etatRoutines` et l'interface disent le gardien activé sans systemd ; trois formats de
     date dans l'interface web ; le contrôle `veille-retardee` ne dit pas « en relance » alors que la limite écrite le
     dit ; `holarch veille` dit « non tenue » sur un systemd injoignable ; marque de relance laissée si `restart` échoue,
     « en relance » affiché jusqu'à 2 min ; aucune assertion sur l'affichage ; dates en UTC (`creation.js:131`,
     `socle.js:409`) ; commentaire de `cleServeur` déplacé ; des tests écrivent `/a`. Tests qui ne prouvent rien :
     l'ajout de `f7aad0d` dans `veille` ; mutants verts du sous-agent : retrait de « en relance » (`affichage.js`), du
     message systemd (`affichage.js`), de l'effacement de la marque de relance (`veille.js`).
     Suite proposée, session neuve (Opus 5.5 `xhigh`) : (a) et (c) en une décision brouillon, avec le contrat de
     configuration et les exceptions de `donnees_personnelles`, à approuver avant le code ; puis les mineurs restants, un
     commit et un test chacun ; puis pose et contre-épreuve. Chaque test s'éprouve par `npm run eprouver` (parent ou
     mutant, sur une copie de la copie de travail). Test « un commit fautif est refusé
     par le crochet » : 0 rouge sur 25 suites entières le 2026-10-10, 1 sur 42 en tout, cause inconnue.
     - Déploiement du relais, fait le 2026-10-09 à la demande de l'auteur : le jeton exporté par le `~/.bashrc` de
       l'hôte était déjà limité à l'app (il lit son état, pas la liste des apps ; il ne peut pas créer de jeton) ; posé
       tel quel en secret GitHub `FLY_API_TOKEN` (par l'image officielle de flyctl, valeur jamais affichée), puis sa
       ligne retirée du `~/.bashrc`. Son expiration est inconnue (20 ans par défaut) : un jeton neuf d'un an demandera
       un `fly auth login`. Le workflow attend l'envoi du commit local. Reconstruire les conteneurs corrigés à leur
       prochaine ouverture.
  0. **Pour C** : dans le conteneur du socle, le volume `~/.ssh` vise encore `/home/vscode` alors que l'image tourne sous `node`
     (réparation en C) ; C reprend les deux montages de l'hôte dans la génération (clé `conteneur.connexion_claude`).
  0. **Relecture du fil des commits (2026-10-09), à proposer à l'auteur un par un** (rétablir, ou retirer par une
     décision). Changés sans décision : (1) interface web, cliente du hub sans canal privé (§4) : serveur HTTP direct,
     constat 6 de `revue-page-blanche` non tranché ; (2) un conteneur par brique (fondation n° 3) : un programme Node et
     des services systemd, noté dans la seule spec ; (3) règles sur déclencheur (`guided`, `trigger`) abandonnées le
     2026-10-08 sans la décision annoncée (garder comme palier de I27, ou retirer du contrat) ; (4) carnet d'idées réduit
     à un registre : ni fiche `idea` ni `idea.*` (contrats stables), effort et expiration perdus ; (5) clés des données
     « en anglais » (`contrats/index.md:4`), en français partout ; (6) contrat événement 0.10.0 (`power.*`) et `3fb2624`
     (forme des écarts, sans version) sans décision qui les nomme. Incertains : (7) P3 précisé avant l'approbation des
     principes (`dd45ffa`), `README.md:72` et §3 non alignés ; (8) contre-épreuve lancée par le producteur, pas par le
     système (§5.5) ; (9) serveur permanent ni reporté ni abandonné ; (10) règles transmises à Desktop par le point
     d'entrée, non tranché. Plusieurs se tranchent dans `modules-et-palliatifs` avant son approbation : retrait du
     conteneur par brique (`modifies` sur `fondation.md`), module interface, hub et lettre de P6, condition du serveur,
     brique Intentions absente de la répartition, règles hors du hub. Code en écart avec le texte : `context` jamais
     rempli, aucune lecture filtrée par classification, registre des types non lu (`src/regles.js:26-28`), `stable`
     sans `approved` (`src/regles.js:80`). Documents en retard : `README.md` (étape 2, hub unique, conteneurs),
     `arbre/index.md`, `contrats/index.md` sans `config.md`.
     Avis de l'agent (2026-10-09, demandé par l'auteur, sans réponse encore) : changements justifiés, à acter par une
     décision courte : (2), (3) (le palier `guided` devient un skill du runtime, P2), (4) (registre gardé ; les contrats
     le disent), (5), (7). À garder : (8) d'abord (la contre-épreuve déclenchée par un crochet ou une routine, consigne
     fixe), (6) (garde du palliatif 5), (1) dans sa forme actuelle (lectures communes avec le serveur MCP, écritures
     sous clé et au journal). À reporter avec une condition d'ouverture : (9), (10) (consigne du serveur MCP si l'usage
     de Desktop se mesure).
     Choix de l'auteur (2026-10-09) : avis suivi, en trois textes (décision des retraits ; compléments à
     `modules-et-palliatifs` pour (1), (9), (10) et la brique Intentions ; mécanisme pour (8)). (10) revu : Desktop est
     l'outil principal de l'auteur au site de travail, dont la copie de HOLARCH a reçu les dernières fonctionnalités le
     2026-10-09 au matin, et un serveur MCP créé ce jour-là s'y est intégré (constat de l'auteur). Q30 résolue : les règles n'atteignent pas Desktop, ses
     projets les pallient ; idée I35 (retenue), mécanisme en Q31.
  0. **Mineurs** de la troisième contre-épreuve (2026-10-09) : (6) le contrôle d'échappement de `app.js` ne voit pas
     `${f.nom || "—"}`, `${f.tags.join(…)}`, `${f["nom"]}`, `${nom}`, `${c ? f.nom : ""}` (aucune fuite réelle trouvée) ;
     (7) `gitleaks git --pre-commit` lance son git sans neutralisation (dépôt de l'auteur, cohérent avec (D) ; non
     éprouvé ; `osv-scanner` non vérifié) ; (8) `trouverOutil` retient un réglage qui existe sans être exécutable (un
     dossier).
  0. **Pose dans le projet privé, contenu retenu par l'auteur (2026-10-08)** : les quatre adoptions (comparaison
     d'images native, skill `verify`, relecteur UX, essai de Playwright CLI), règles dans son arbre, et cinq éléments :
     documents d'état allégés, sous-ensemble rapide de ses vérificateurs de tailles dans sa vérification, tests tirés des
     redites (cohérence entre scènes, parité à plusieurs tailles d'ordinateur, place d'un contrôle), crochet de démarrage
     (récupérer, démarrer et vérifier le serveur), déclaration du projet (et lecture de ses trois écarts). Mesure des
     sous-agents (56 % de sa dépense) à faire. Écriture dans son dépôt après `git pull`, rien poussé sans demande.
  0. **Fait le 2026-10-08, sauf constats ci-dessus** : les corrections courtes qui rendent les
     garde-fous muets ou ouvrent le poste : X2 (`-c core.fsmonitor=false`), X3 (échapper `kind`), N1 avec E1 (journal
     tolérant, transaction annulée), E2 et E3 (règles illisibles ou contrôle des secrets sans git qui se disent
     conformes) ; X1 par décision. Chacune avec le test qui la reproduit.
  0. **Ordre retenu par l'auteur (décision `revue-page-blanche`, 2026-10-08)** : d'abord B avec C. Le projet privé le
     plus coûteux reçoit son arbre minimal et un module pour le travail d'UX/UI que l'auteur va y mener, **avant ses
     essais**. On commence par un état des lieux P2 de l'existant (skills d'interface, test visuel, connecteurs de
     maquettes), puis on propose le type et les règles, sur l'accord de l'auteur. Ensuite, les corrections de la passe par
     famille (2), avec contre-épreuve par un sous-agent neuf avant de rendre (D). Critère de l'étape tenu (A) : redites
     comptées par les récoltes jusqu'au 2026-11-07 environ, plus un vrai projet créé par la commande.
  2. **Passe par famille** : choisir les corrections (N, C, R, M et la seconde vague) et leurs contrôles ; trancher A à D
     de la décision `revue-page-blanche` d'abord, ils changent l'ordre et la méthode.
  3. **Tranche 7, critère** : mesurer le contexte moyen par tour à une semaine (2026-10-14) contre la référence.
  4. **Tranche 10** : livrée ; critère au prochain vrai projet, créé par la commande.
  5. **Clôture de l'étape 3** (accord de l'auteur, à revoir par le choix A de `revue-page-blanche`) : après la mesure du 2026-10-14 ; elle déborde sur la régulation
     (étape 5). Les idées « à placer » s'y placent.
  6. **Tranche 11** : livrée ; statuts des huit brouillons du profil écrits le 2026-10-08 ; critère d'usage : une
     consigne approuvée n'est plus redite ensuite. L'oubli progressif des règles est l'idée I27 (étape 5).
  7. **Tranche 12** (ouverte le 2026-10-09) : découpage validé par l'auteur (2026-10-09) ; brouillon réécrit en deux
     décisions, approuvées le 2026-10-09 : `partage-et-bac-a-sable` (P7 et §5.4 réécrits ; l'accès sur l'hôte vaut
     dérogation jusqu'à D) et `environnement-d-execution` (cinq livraisons A à E, chacune avec son critère, son modèle
     et son effort). Ordre : A, B, C, D, E.
     - **A, démarrage sans session** (2026-10-09) : Q27 résolue par l'aide lue dans le binaire 2.1.295 ; réglage
       `acces_distant.session_au_demarrage` (`aucune` par défaut : `--no-create-session-in-dir` ; `reprendre` :
       `--continue`), une valeur inconnue refusée avant toute écriture. Relance du service du poste
       (`holarch distant activer holarch-socle`) lancée en fin de séance, avec l'accord de l'auteur : elle coupe les
       sessions servies ; à la reprise, vérifier que l'unité porte `--no-create-session-in-dir`. Critère à vérifier par l'auteur : après la relance,
       aucune session créée ni reprise ; une session ouverte depuis l'application répond ; une archivée le reste.
       Vérifié en partie (2026-10-09) : l'unité porte l'option, le serveur démarre sans session (capacité 0/32), une
       session ouverte depuis l'application a répondu ; l'archivée reste à vérifier. Juste après la relance, le serveur
       a quitté deux fois en code 1 sans message (`StandardOutput=null` emportait la sortie d'erreur, corrigé :
       `StandardError=journal`). Cause probable, non confirmée : sans session au démarrage, le serveur ne relit pas le
       pointeur du dossier (code du binaire 2.1.295) et ne demande donc pas à reprendre l'environnement précédent ;
       l'ancien, arrêté en servant une session, restait inscrit (Q22). Conséquence à garder en vue : chaque relance
       (dont celle du réveil) ouvre un environnement neuf, et les sessions ouvertes avant ne sont pas reprises.
     - **B, veille retardée** (Opus 5.5 `xhigh`) : Q25 résolue, mécanisme, adaptateur et tests livrés (2026-10-09,
       `6bb1c20`). Contre-épreuve par une instance neuve (`xhigh`, scripts dans `/tmp/contre-epreuve-b/`, perdus au
       redémarrage) : 4 majeurs, 13 mineurs, tous corrigés le 2026-10-09 (Fait ci-dessus), un commit et un test chacun.
       Majeurs : (1) « travaille » sans borne (`veille.js`, `evaluer`) : une demande de permission, une élicitation
       MCP ou un `Stop` manqué tiennent le poste éveillé jusqu'à l'archivage ; mesure de l'instance : 301 tours de 67
       sessions distantes, aucun silence de plus de 11 min pendant un tour (hors questions) ; correction proposée :
       transcription et `<session>/subagents/*.jsonl` immobiles depuis 30 min, la session passe en attente depuis
       cette date ; noter aussi `PermissionRequest` comme une attente. (2) Travail de fond après `Stop` (sous-agent en
       cours, champ `background_tasks` de l'entrée de `Stop`, présent en 2.1.295) : le poste peut dormir sous lui
       (cas de cette contre-épreuve, plus de 11 min) ; garder dans la note les sous-agents en cours, retenir tant que
       leur transcription bouge depuis moins de 30 min ; jamais un shell de fond sans borne (serveur permanent).
       (3) `service poser` ne relance pas le gardien (chemin `courant` inchangé, texte inchangé) : relancer comme
       l'interface (`relancer`) ; le test actuel change de chemin et passe à tort. (4) Avant D : un pid de conteneur
       vérifié dans le `/proc` de l'hôte efface la note ; choisir un signe de vie sans pid, ou écrire que B ne couvre
       que l'hôte (choix de l'auteur).
       Mineurs : (5) fausse interruption : marque cherchée aussi dans les résultats d'outil (n'accepter qu'un texte qui
       commence par elle) ; (6) demande qui meurt aussitôt tenue : `power.held` et `power.failed` à chaque passage
       (espacer, remise à zéro après une tenue durable) ; (7) note réécrite entre lecture et effacement (relire avant
       d'effacer) ; (8) chemin de transcription non contrôlé (un FIFO bloque le gardien : `isFile`, sous `projects/`) ;
       (9) sortie de PowerShell et chemin au journal (`{motif, code}` au journal, sortie au seul log) ; (10) mécanisme
       cherché une seule fois au démarrage ; (11) contrôle limité à l'unité (comparer l'état écrit par le gardien à
       `besoin` ; session reliée par `/remote-control` sans gardien ; `holarch veille` dit « retenue » d'après
       `besoin`) ; (12) erreurs du crochet perdues (`2>/dev/null`, `chargerConfig` hors du `try`) : fichier d'erreur
       daté que le contrôle signale ; (13) contrat événement 0.10.0 sans décision qui le déclare : ajouter
       `evenement.md` aux `modifies` de `environnement-d-execution`, avec l'accord de l'auteur ; (14) une session qui
       arrive ou part pendant la tenue n'est pas au journal ; (15) `crochetVoulu` impute toujours `veille-retardee` ;
       (16) 0,2 s par invite pour une session locale : tester les variables dans la commande shell avant node ;
       (17) lecture du ppid sur le vrai `/proc` non testée (test proposé : `sh -c "node … processusSession()"`).
       Approbation et pose faites le 2026-10-09, critère tenu le 2026-10-10 (Fait ci-dessus) : livraison close. Limites
       connues : dans la décision `veille-et-conteneur-precisions` (stable). Reste du critère de A : une session
       archivée le reste après une relance.
  8. **Tranches suivantes** : réglages de Claude Code par projet, adaptateurs (§5.2, §5.8), à spécifier à leur
     ouverture.
