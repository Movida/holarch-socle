---
type: observation
title: Revue rétroactive des limites laissées
description: "Toutes les limites déclarées puis laissées dans l'arbre et le code, relevées le 2026-10-11 à la demande de l'auteur (une limite dite sans palliatif cherché) : pour chacune, palliatif cherché à l'époque, palliatif vu, coût, ou levée depuis, ou tranchée par l'auteur. Sert aux choix de l'auteur, puis se retire."
status: draft
as_of: 2026-10-11
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
---

# Revue rétroactive des limites laissées (2026-10-11)

Deux instances neuves en lecture seule, sur HEAD `4ff6364` du socle. Règle proposée en réponse :
`limite-avec-palliatif` (profil, brouillon). Les limites de la livraison C comblées le même jour en sont exclues.
Les comptes sont en lignes de tableau ; une ligne peut regrouper des mineurs.

## Suite du 2026-10-13

**Levées depuis la revue** (HEAD `638572f`) : crochet en conteneur (repli gitleaks, `db527e2`), règles bloquantes non
dérogeables (`4329c47`), `stable` sans approbation (`c35c209`, donc X6), lectures gardées (`4ee6b8a`), manifeste avant
`settings.json` (`980c2ac`), isolement à l'audit (`46d5d6f`), refus sur contrôle bloquant indisponible (`f9d4bd0`),
source npm (`423f6a7`), échec de `gh` (`ac2f937`).

**Choix de l'auteur** (un tour, recommandations suivies) : coder les familles Sécurité, Gardes muettes (§ 1, troisième
tableau, environ 29 points) et Chiffres (§ 1, deuxième tableau, et lignes 238, 239 a, 241, 243 de la seconde table ; V1 :
ligne « projets retirés » dans la vue Projets ; V2 : état du dépôt lu en direct partout ; V3 : deux champs de tours
nommés ; reportés : grille de tarifs datée, CI lue par `gh`, I37, trace d'une approbation accordée). Une instance neuve
par famille, en série (fichiers partagés). Restent à soumettre : Veille et outillage (§ 1, quatrième tableau, et lignes
245, 246, 253), palliatifs moyens ou forts (§ 2 et seconde table).

**Sécurité** : famille close le 2026-10-13. Points 1 à 8 (`74b352c` à `3d573dc`) : récolte lancée d'un dossier vide
(X4), git de gitleaks et d'osv-scanner neutralisé (mineur 7), outil non exécutable (mineur 8), `.gitleaks.toml` et liens
sous `gitleaks dir`, mémoires de la récolte, fragments de secrets au catalogue (X5), inventaire Claude Code d'un dépôt,
crochets de passation muets. Points 9 à 14 (`dc17bdc` à `0d6d006`) : `O_NOFOLLOW` à la lecture ; dossier remplacé
pendant l'ouverture (`ouvrirSansLien`, commune à la lecture et à l'écriture, inodes comparés, troncature après) ;
utilisateur du conteneur lu par `docker inspect` quand l'étiquette n'en nomme aucun (ordre du CLI 0.89.0) ; branche
« remoteUser inconnu » testée ; `.meta.json` lu par `lireSansLien` (sans FIFO, borné à 64 Kio) ; contexte illisible dit
avec sa raison. Voisins (`cb67eaa` à `b4e9723`) : repli shell du crochet lancé comme le contrôle des secrets (même
neutralisation, configuration par défaut, `.gitleaksignore` refusé) ; `--config /dev/null` pour osv-scanner (un
`osv-scanner.toml` du dépôt taisait un paquet, essayé hors réseau ; 0 sur le poste) ; `memoires()` gardée ; script
d'un crochet montré au catalogue au lieu de « node » ; écart de passation dit seulement si le crochet est voulu ;
regroupement lancé sous l'accueil HOLARCH ; FIFO refusé à l'écriture et à la fin d'une transcription ; trois lecteurs
par `lireSansLien` bornée ; contexte à préciser quand un illisible côtoie un lisible (choix de l'auteur). Choix de
l'auteur : exception `secrets` au profil, attendre un premier faux positif (palliatif écrit : environ 20 lignes et un
test) ; point 15, échappement de l'interface, rangé avec les palliatifs moyens (309 interpolations sur 483 refusées
par la règle prévue, 106 après les cas sûrs évidents, aucune fuite ; palliatif : gabarit `html` qui échappe par défaut,
environ 180 gabarits et le test visuel dans le conteneur ; alternative faible et fragile : liste de 14 aides et
d'environ 25 variables sûres). Limites laissées : `ouvrirSansLien` sans `openat` (un dossier remplacé, remis, puis
remplacé de nouveau ; ce que l'ouverture crée au bout du lien ; palliatifs : `python3` et `dir_fd`, moyen, ou
`readlink /proc/self/fd/N`, faible et partiel) ; `.gitleaksignore` dit, pas neutralisé (export de l'index, moyen) ;
`~/.claude/rules/` peut-être lu par le regroupement (Q33). Défauts voisins vus, palliatif trivial ou faible, pour la
famille Gardes muettes : `repertoireDe` (`inventaire/claude-code.js:83`) et `debutDeTranscription` (`contexte.js:59`)
ouvrent en `'r'` (drapeaux de `finDeTranscription`) ; `racineArbre` (`inventaire/arbre.js:69`) sans dépôt
(`enTete(o, depot)`) ; `poserCrochet` (`garde-git.js:92,101`) lit et écrit sans garde (`lireSansLien`,
`ecrireSansLien`) ; `verrousVulnerables` (`controles.js:202`, `lireSansLien` bornée pour l'empreinte ; copies privées
pour osv-scanner, moyen) ; `lireEnTete` du compte bloque sur un FIFO (`O_NONBLOCK` et `fstat`) ; repli shell sous git
antérieur à 2.26 sans `--show-scope` (repli `--name-only`) ; mutant M10 de `73143ea` vert (repli « ne se lit pas »,
atteint par une course seulement).

**Gardes muettes** : lots 1 à 4 le 2026-10-13, par quatre instances neuves en série relues par l'agent (environ 320 k,
355 k, 345 k et 380 k tokens), 47 points en 47 commits et un arrêté (`7b58a62` à `7625bfd`), chaque test rouge sur son parent et
ses mutants (verts, par une course seulement : `'r'` remis dans `repertoireDe`, `enTete(f)` et `marque(f)` sans
racine). Lot 1 (`7b58a62` à `e289e11`) : C1 (`projetDuDepot` : chemin, worktree principal, premier commit ; rattaché à
rien : avertissement, choix de l'auteur), C2 à C5, M6 (lien suivi, lien cassé refusé et dit, choix de l'auteur ; droits
gardés), crochet sans bit d'exécution, `poserCrochet` et `racineArbre` gardés. Lot 2 (`41f9a74` à `1912a61`) : R1 à R5
(R5 : marque `reprise-coupures.json`, oubliée après 48 h ; elle remplace le choix ancien « sans état à tenir », choix de
l'auteur), import qui n'avance plus sur un refus, M1, M4 (ligne d'empreinte dans chaque unité ; modifiée : laissée et
dite), échec de `systemctl` dit, reprise d'un worktree ou d'un dépôt déplacé, création à blanc. Lot 3 (`c9c3f95` à
`d7e4b9a`) : M2, M3, M5, `git add -A` vérifié, lecture stricte des crochets, ouvertures sans lien ni blocage, verrous
lus bornés, `lireFichier` du compte, repli du crochet sous git antérieur à 2.26, passerelle, `etatRoutines` sans
systemd, R1 sans avance lue, temporaire d'`ecrireJson`. Lot 4 (`514cb6e` à `7625bfd`) : R2 affiné (désactivé : laissé,
geste ; choix de l'auteur), unité modifiée retirée après copie en `.bak` (choix de l'auteur), projets du site, compte
Claude Code lu à un seul endroit (clé de l'import gardée en dérogation : la retirer est une décision, après Q32), seuil
de passation `null` sans réglage, `configGit` commune, récolte sans gitleaks en code 1, copies de pose orphelines
retirées, import en double, worktree écarté de l'inventaire, reprise lue au nouveau chemin, `fichierMarque`,
`neutralisation()` sous git ancien, lectures du compte par `lireFichier`. Arrêté : récolte muette (un événement change
le contrat événement ; proposition `system.degraded` en 0.11.0, avec E6 ; alternative sans contrat : `is-failed` lu
par `etatRoutines`, trivial). 245 tests verts ; copie de service posée (`7625bfd`, unités réécrites avec leur
empreinte) ; crochet de commit des cinq projets qui le portent réécrit ; audit réel : socle et compte conformes.
L'unité d'accès distant n'est pas réécrite (`distant activer` relance son serveur et coupe les sessions distantes) :
elle prendra son empreinte à la prochaine activation.

**Lot 5** (famille close le 2026-10-13) : décision `geste-a-la-main` approuvée (`bcb4e32`, modifie `copie-de-service`,
`identite-par-contexte` et `passation-sereine`), puis une instance neuve relue par l'agent (environ 364 k tokens), cinq
commits (`d5edf5b` à `3a951ba`), chaque test rouge sur son parent et ses mutants. M2 : un retrait à la main ne vaut que
pour sa valeur (clé : valeur notée ; crochet : rôle et seuil), un autre seuil pose à côté et le dit, option
`regles appliquer --reposer <clé ou rôle>`, gestes d'une seule fonction (`gesteLaisse`). M3 : `holarch service` montre
l'entrée MCP de chaque compte et, réglée ailleurs, la commande qui la repointe (`claude mcp remove` puis `add-json`,
vérifiées dans la documentation). M5 : identité retirée à la main reposée et dite (état `repose`), note retirée quand
l'identité n'est plus voulue. `.claude/` ignoré par git : geste avec `check-ignore -v`, la création continue. git
antérieur à 2.6 : le repli du crochet refuse le commit ; arrêté côté `neutralisation()` en JS (son repli n'emploie pas
`--name-only` et neutralise encore sous git 2.0 à 2.5 ; une levée viderait le catalogue, `gitInventaire` sans `try` par
dépôt : proposition, ne rien lever ; alternative, lever avec un `try` par dépôt, moyen). 250 tests verts ; copie de
service posée (`3a951ba`) ; crochet de commit des cinq projets qui le portent réécrit ; audit réel : socle et compte
conformes. Envoi de `3792cb1` sur autorisation (pas d'intégration continue). Choix de l'auteur, recommandations
suivies : `neutralisation()` ne lève rien ; à coder à la session suivante, trois des quatre voisins ci-après :
`.devcontainer/` ignoré, la commande dans `service poser`, `--reposer` inconnu en code 1 ; pas `--reposer` d'une clé
changée. Voisins vus : `.devcontainer/` ignoré fait échouer l'étape conteneur à chaque rejeu (même
traitement, faible) ; `service poser` dit « réglé ailleurs » sans la commande (renvoi, trivial) ; `--reposer` d'une clé
changée à la main (trivial, mais remplacerait une valeur posée à la main, contre la décision) ; `--reposer` d'un nom
inconnu sort en 0 (sortir en 1, trivial). Limites laissées : crochet changé à la main puis autre seuil, les deux tournent
(dit ; le reconnaître serait deviner) ; `.claude.json` sous `CLAUDE_CONFIG_DIR`, emplacement non dit par la
documentation (hypothèse de `configClaude`). Laissés, avec
leur palliatif : session d'un worktree hors du chemin du principal comptée hors projet (rattacher à l'import par
`projetDuDepot`, faible) ; `procedure-site-travail.md:55` redondant si la clé de l'import est retirée (trivial) ; `.bak`
accumulés (retrait par l'auteur : une copie retirée perdrait un texte écrit à la main) ; pid repris par un autre
processus (heure de démarrage lue dans `/proc`, faible) ; deux poses simultanées de la même unité (verrou, faible) ;
ligne toujours refusée relue à chaque import (plafond et événement, faible) ; `appliquerPermissions` remet une
interdiction de lecture retirée à la main (voulu : règle bloquante, la voie est une dérogation). Test visuel non lancé
(Chromium absent, I32) : `app.js` inchangé, l'infobulle du seuil peut dire « — ».

**Voisins du lot 5** (codés le 2026-10-14 par l'agent, sans instance neuve), un commit et un test chacun, rouge avant
son correctif. `4825e1f` : `.devcontainer/` ignoré par git, la configuration et le script de la clé sont écrits, ni
ajoutés ni commités, et un geste le dit avec `check-ignore -v` ; la suite continue. Le test a montré que `git add` d'un
fichier suivi sous un dossier ignoré l'indexe mais sort en 1 : l'ajout (`add -u`, puis les nouveaux non ignorés) et la
lecture des ignorés sont mis en commun pour les fichiers de base, les règles et le conteneur (`ajouter`,
`ignoresParGit`, `gesteIgnores`). `9358298` : `service poser` donne, pour une entrée MCP laissée (réglée ailleurs ou non
reconnue), la commande qui la repointe, la même que `holarch service`. `998f515` : `regles appliquer` sort en 1 quand
un nom de `--reposer` n'est reposé sur aucun compte (inconnu, ou pas laissé), après le reste ; reposé sur un compte et
pas laissé sur un autre, c'est dit sans échec. 251 tests verts ; copie de service posée (`998f515`) ; audit réel :
compte conforme, socle sans autre écart que les commits non poussés, 0 apparu, 0 résolu. Voisin vu, codé le même jour sur choix
de l'auteur (`9e6e623`) : un fichier de base suivi, retiré à la main sous un dossier ignoré (`arbre/` par exemple), est réécrit puis ajouté par
`git add`, qui sort en 1 : l'étape fichiers échoue une fois, le rejeu suivant le dit « déjà là » sans commit (palliatif :
`ajouter` à cette étape aussi, trivial, et un test).

**Chiffres, relevé du 2026-10-14** (instance neuve en lecture seule, HEAD `9e6e623`, mesures sur les données réelles en
lecture) : aucun contrat ne décrit la sortie des outils MCP (`forme-etape-2` dit « en lecture », « les mêmes lectures que
l'interface ») ; un champ MCP ajouté ou renommé demande donc une décision. Usage mesuré : l'interface n'a pas été ouverte
depuis le 2026-10-07 (47 vues en 30 jours, toutes avant le retrait de Tailscale Serve) ; le serveur MCP, 30 appels en 30
jours. Levés : ligne 241, date du catalogue (`e289e11`) ; proposition (3), isolement à l'audit (`46d5d6f`). Ouverts,
avec la prémisse vérifiée : V1, 2 projets retirés, 222,06 $ et 21 sessions sur 182 hors vue ; `element.retired` porte
`data: {}`, donc pas de nom à en tirer (ligne sans nom, ou nom tiré de `data.projet`, ou nom ajouté à l'événement :
contrat 0.11.0) ; `rattachement-projet` touché. V2 : 4 projets sur 10 diffèrent ; `etatDepot` rendrait 0 sur un chemin
absent (`existsSync`, sinon valeur du catalogue datée) ; 24 ms par projet. V3 : 72 sessions sur 182 diffèrent ;
renommer `tours` côté MCP casse ses lecteurs (garder `tours`, total, et ajouter `tours_session`). V5 : part datée sur la
carte (16,17 $) contre coût entier sur 90 jours dans la liste (484,89 $), part tirée de `parts()`. V6 : 6 jours sur 23
diffèrent de plus de 5 % ; filtre seul insuffisant (colonne « sortie ce jour »), jour local à choisir. V7 :
`passation-sereine` touchée ; renommer, ou même mesure (champ dans `session.finished`, contrat). V8 et ligne 243 :
3 restes montrés sur 18, dont 2 déjà clos ; « Reste (3 sur 18) », dernier fait par date. V9 : sans objet tant que
l'interface n'est pas ouverte au toucher. E4 : Docker absent au démarrage donne 137 des 217 `element.retired` ; garder
les fiches d'un adaptateur en erreur et réamorcer son contexte (les adaptateurs suivants perdent dépôts et liens). N2 :
10 inventaires sur 279 finis à moins d'une seconde d'un autre, 51 `element.*` doublés, aucun identifiant doublé
(dédoublonner `tool.called` : sans objet) ; verrou `wx`, processus vivant lu par numéro et heure de démarrage
(`veille.js`). N3 : relire avant le renommage, trois essais (protège l'écriture de Claude Code, pas la nôtre). N4 : le
crochet passe déjà par `ecrireSansLien` ; restent `commun.js:93`, `regles-claude-code.js:261,264`, `distant.js:94,103,406`.
Faille sans gravité : compte `sans_gravite` dit par l'audit (un écart change `veille-securite-versions`). Chemin
relatif : 833 commandes avec `../` sur 36 865, 37 vers un autre projet ; faux après un `cd` (470 des 833), résoudre
seulement sans `cd`. Taille du contexte : sortie moyenne 452 tokens par tour (0,3 % du seuil). Formes d'approbation :
« Blocked: sleep N followed by » 16, « `&` background operator » 2, « Output redirection » 1 ; relire en version 7
doublerait environ 19 `tool.failed`. Ligne 238 : `arbreAJour` lance un inventaire complet qui écrit, depuis un GET et un
outil en lecture, et aggrave N2 (après N2 ; ou `arbreFrais`, lecture pure). Ligne 239 a : 0 inconnu sur ce poste ; un
statut `null` vient aussi d'un appel sans résultat ; « dont K inconnus ». Voisins vus : sessions coupées limitées à 3
sans le dire (`contexte.js:116`) ; échecs des projets retirés comptés nulle part ; deux définitions d'un processus
vivant (`service.js:45`, `veille.js:100`) ; règles d'un dépôt écrites sans `O_NOFOLLOW` (`regles-claude-code.js:261,264`,
pris dans N4) ; alerte et seuil lisent les règles dans l'index (même cause que 238) ; `voir` refait un inventaire
complet au démarrage, cause probable des doublons de N2 ; date affichée locale, filtre en UTC (`app.js`) ; `settings.json`
réécrit pendant que Claude Code peut l'écrire `[À COMPLÉTER : Claude Code le verrouille-t-il ?]`. Lots proposés : lot 1
sans interface ni contrat (N2 d'abord, E4, N3, N4, formes d'approbation et chemin relatif sous un seul changement de
version, taille du contexte, V8 et 243, faille sans gravité) ; puis une décision « sorties MCP des chiffres »
(`retires`, `lu_a`, tours, `inconnus`) ; lot 2, interface (238, V2, V1, V3, 239 a, V5, V6, V7, V9), test visuel requis.
Test visuel : Chromium absent de l'hôte, mais Docker répond ; il manque `libnss3`, `libnspr4` et `libasound2`
(palliatif : `sudo apt install -y libnss3 libasound2t64`, puis `npx playwright install --only-shell chromium`, sans
`sudo`, dans `~/.cache/ms-playwright` ; vérifié par `--dry-run`). Majoration `inference_geo` : 0 « us » mesuré.
Choix de l'auteur (un tour, recommandations suivies) : lot 1 à coder par une instance neuve à la session suivante :
N2, un verrou ; un inventaire ou un import qui le trouve pris passe son tour et le dit ; E4, fiches d'un adaptateur en
erreur gardées, Docker injoignable compris ; N3 et N4 comme le relevé ; formes d'approbation et chemin relatif (`../`
sans `cd`) pour les nouvelles transcriptions seulement (pas de relecture, pas de doubles) ; taille du contexte avec
`output_tokens` ; reprise « Reste (3 sur 18) », dernier fait pris par sa date ; faille sans gravité, compte dit par
l'audit, sans écart. Lot 2 après le lot 1 : la décision « sorties MCP des chiffres » en brouillon d'abord, soumise avant
tout code ; test visuel par le palliatif ci-dessus (paquets installés par l'auteur).

**Gestes** : analyse des secrets et protection à l'envoi déjà actives sur les quatre dépôts publics (l'API ne rend
aucun réglage pour les privés) : ligne « commit hors du clone » levée pour les secrets. Interface : publication sur
Tailscale retirée (le téléphone n'y était plus vu depuis le 2026-10-07 ; seul le serveur d'un projet privé, membre,
pouvait encore la lire) : ligne « tout appareil du réseau privé » levée ; republier : `tailscale serve --bg 4280`, et
étiqueter alors le nœud du serveur. Jeton Fly : commandes vérifiées, non faites (flyctl absent ; installation par
`curl -L https://fly.io/install.sh | sh`, qui ajoute des lignes au fichier rc), puis
`flyctl tokens create deploy -a swiper-relay -x 8760h | gh secret set FLY_API_TOKEN -R Movida/swiper-storage`, et
`flyctl tokens list -a swiper-relay` puis `flyctl tokens revoke <id>` pour l'ancien.

**Essais sur pièces** : bac à sable, la documentation dit qu'il applique les refus `Read(...)` aux commandes (et pas à
l'outil de lecture). `bubblewrap` 0.9.0 et `socat` 1.8.0.0 extraits sans `sudo` des paquets Ubuntu (empreintes conformes
à l'index apt) dans `~/.local/bin`, `socat` derrière un script qui charge `libwrap.so.0` (`~/.local/lib/socat`) : choix
de l'auteur, hors de son poste ; à retirer une fois installés par apt (`~/.local/bin` passe en tête du `PATH`). Essai
unique le 2026-10-13, à blanc (`claude -p --restricted --tools Bash`, réglages par `--settings`, Haiku, 0,0033 $) :
`cat`, `grep -r` et `python3` refusés sur un `.env` interdit par `Read(**/.env)`, par le système (aucun refus de la
couche de permissions) ; témoin lisible ; `touch ~/…` en système de fichiers en lecture seule ; `curl --noproxy '*'`
sans résolution de nom. Seul reste : un dossier vide `.claude/.cc-writes`. Pose rangée avec les palliatifs moyens
(choix de l'auteur) : sur 30 jours (188 transcriptions, 15 927 commandes), environ 9 % sortent des limites par défaut
(envois git 2,9 %, `holarch` qui écrit hors du dépôt 1,6 %, `curl` 1,5 %, `docker` 1,3 %, `systemctl` 1,0 %, `gh`
0,6 %) ; il faut des listes tirées de la mesure (domaines, écritures sans `~/.local/bin`, commandes exclues). Règle plus fermée
que son dépôt : 0 cas sur les six projets ; `CLAUDE.local.md` se charge sans approbation (à mettre au `.gitignore`), un
import `@~/…` demande une approbation interactive, impossible en session distante ; `claudeMdExcludes` exclut un
fichier de `~/.claude/rules/` pour une dérogation ; rien construit tant qu'aucune règle n'en a l'usage.

## Limites déclarées puis laissées : décisions, conception, contrats, fondations

Revue rétroactive en lecture seule, le 2026-10-11, sur HEAD `4ff6364` de `holarch-socle`. Périmètre :
`arbre/decisions/*.md`, `arbre/conception/*.md` (surtout `etape-3-regles-projets.md`), `arbre/conception/contrats/*.md`,
`arbre/fondations/`. Une autre session modifiait au même moment `src/creation.js`, `test/etape3.test.js` et la spec
(rien de commité) : les numéros de ligne de la spec sont ceux de la copie de travail.

Méthode : chaque limite a été relue dans son contexte, puis cherchée dans `src/`, `bin/` et `git log`. Les familles
N, C, R, M, V, E et X de la passe du 2026-10-08 ont été vérifiées dans le code par deux sous-agents en lecture seule ;
j'ai revérifié moi-même les points de sécurité (X1, X4, E4, le crochet). Mesures faites pour l'occasion (2026-10-11) :
1 règle `derogable: false` sur 27 dans le `rules.yaml` du profil ; 0 transcription en `inference_geo: "us"` sur 746
qui portent ce champ ; 2 lancements de `pytest` en 30 jours, aucun de `cargo test` ni de `go test`.

Lecture des colonnes. « Cherché » : un palliatif a-t-il été cherché et écrit à côté de la limite, à l'époque.
Coûts : trivial (une ligne ou un réglage), faible (une fonction et son test), moyen (plusieurs modules, un contrat ou
un essai), fort (une livraison). Quand un nom de réglage d'outil est cité sans que j'aie lu sa documentation, il est
marqué « à vérifier ».

Comptes, en lignes de tableau (quatre lignes regroupent plusieurs mineurs de même origine) : ouvertes, palliatif
trivial ou faible : 72 ; ouvertes, palliatif moyen ou fort : 11 ; ouvertes, sans palliatif : 3 ; levées depuis : 24 ;
tranchées par l'auteur : 17.

### 1. Ouvertes, palliatif trivial ou faible

#### Sécurité et intégrité des règles

| Où | Limite | Cherché ? | Palliatif vu | Coût |
|---|---|---|---|---|
| `etape-3-regles-projets.md:266-267` ; `src/garde-git.js:18-20` | Le crochet `pre-commit` fige les chemins de node et de HOLARCH. Dans un conteneur, où ils n'existent pas, il laisse passer le commit et le dit seulement. Or 209 des 305 sessions tournent en conteneur (l. 959). Leurs commits ne sont contrôlés qu'à l'audit suivant : données personnelles, secrets, identité, y compris dans le dépôt public. | non | Un crochet qui refuse quand HOLARCH est injoignable, au moins dans un dépôt `depot-public`. `--no-verify` reste possible et l'audit le trace déjà. Autre voie : un repli sur `gitleaks git --pre-commit`, s'il est dans l'image. | faible |
| `etape-3-regles-projets.md:1267` | « Hors périmètre » : la racine d'un projet redéfinit toute règle dérogeable (25 des 26 du profil). Cette racine est dans le dépôt que le conteneur écrit. Une redéfinition de `rien-de-personnel` ou de `identite-de-commit` en simple rappel retire donc la garde. Mesuré : 1 `derogable: false` sur 27 règles au profil. | non | `derogable: false` sur les règles bloquantes du profil (`rien-de-personnel`, `secrets-hors-contexte`, `identite-de-commit`), sur approbation de l'auteur. Autre voie : un écart à l'audit quand une couche de projet redéfinit une règle du profil. | trivial |
| `etape-3-regles-projets.md:893-894` (X1), `:1329-1331` ; `modules-et-palliatifs.md:42` ; `src/regles.js:205` | Une règle `stable` s'applique sans `approved` (`applicable = statut === 'stable' && !derogee`). Les parties « contexte tiers » et « type tiers » de X1 sont levées, pas celle-ci. | oui (palliatif 5, décision en brouillon : la correction change une contrainte) | Exiger `approved` dans `applicable`, ou faire la garde avant commit du palliatif 5. | faible, plus une décision |
| `etape-3-regles-projets.md:265` ; `controles-de-regles.md:41` | Un commit fait hors du clone (édition sur GitHub) n'est vu qu'à l'audit. | en partie (« contrôle côté serveur », sans le nommer) | Analyse des secrets, protection à l'envoi et Dependabot de GitHub, désactivés (`revue-page-blanche.md:33-35`). Un réglage du dépôt, geste de l'auteur. Couvre les secrets, pas la liste privée. | trivial |
| `etape-3-regles-projets.md:897-898` (X4) ; `src/recolte.js:114-118` | La récolte lance `claude -p` depuis `os.tmpdir()` avec `--setting-sources project` : elle lit `/tmp/.claude/settings.json`, que tout utilisateur local peut écrire (crochets compris). | non | Dossier vide créé par `mkdtemp`, ou aucune source de réglages. | trivial |
| `etape-3-regles-projets.md:1311-1313` | Limites de la garde contre les liens symboliques, « à dire à l'auteur » : des lectures ne sont pas gardées (`ecartsConteneur`, `lire()` de l'étape 5, `lireJson` des réglages). | non | `cheminSansLien` avant ces lectures, comme avant les écritures. | faible |
| `etape-3-regles-projets.md:1313-1314` | Défaut mineur : un manifeste refusé après l'écriture de `settings.json` laisse une entrée posée par HOLARCH qui n'est jamais retirée. | non | Écrire le manifeste avant `settings.json`, ou vérifier les deux chemins avant d'écrire l'un ou l'autre. | faible |
| `etape-3-regles-projets.md:59-60` ; `modules-et-palliatifs.md:56` ; `src/web/serveur.js:28-38` | Tout appareil du réseau privé atteint l'interface. L'API n'a pas d'authentification : les lectures sont libres, les écritures sont gardées par l'origine. | oui (ACL du réseau ; clé, palliatif 11) | ACL du réseau privé (geste de l'auteur), ou clé exigée par l'API (palliatif 11, mécanique de `pont --cle`). | faible |
| `etape-3-regles-projets.md:1293-1294` | Jeton Fly en secret GitHub, d'expiration inconnue (20 ans par défaut). | oui (« un jeton neuf d'un an demandera un `fly auth login` ») | Jeton de déploiement à durée bornée : l'option d'expiration de flyctl est à vérifier dans son aide. | faible |
| `essai-site-travail.md:58-60` | La clé de la passerelle est en clair dans la configuration du compte (`claude mcp add --header`) : « il n'y a pas d'option lire depuis un fichier ». | oui (cherchée, absente à l'époque) | `headersHelper` des serveurs MCP : nom présent dans le binaire 2.1.296, sens à vérifier dans la documentation. | faible |
| `etape-3-regles-projets.md:898` (X5) ; `src/inventaire/claude-code.js:39-41`, `src/inventaire/outils.js:51-54` | Des fragments de secrets entrent au catalogue : la description d'un crochet, un jeton dans le chemin d'une URL. | non | Garder la seule origine de l'URL ; écarter les mots avec `=` ou à forte entropie. | faible |
| `etape-3-regles-projets.md:899` (X6) ; `src/recolte.js:21` | Des consignes injectées peuvent être proposées par la récolte. C'est atténué : la proposition reste `draft`. | oui (« la garde humaine tient ») | Tient tant qu'un `stable` sans `approved` ne vaut pas : dépend de la ligne X1 ci-dessus. | faible |
| `etape-3-regles-projets.md:1346-1347` (mineur 7) ; `src/controles.js:109,120,167` | `gitleaks git --pre-commit` et `osv-scanner` lancent git sans neutralisation (« non éprouvé », « non vérifié »). | non | Passer `neutralisation()` dans l'environnement de ces deux appels. | trivial |
| `etape-3-regles-projets.md:1347-1348` (mineur 8) ; `src/commun.js:87` | `trouverOutil` retient un réglage qui existe sans être exécutable (un dossier, par exemple). | non | Réutiliser le test `executable` de la ligne 89. | trivial |
| `etape-3-regles-projets.md:1344-1345` (mineur 6) ; `test/garde-fous.test.js:141` | Le contrôle d'échappement de `app.js` ne voit que `${a.b}`. Aucune fuite réelle n'a été trouvée. | non | Exiger `h(` ou `nf.` dans tout `${}` de l'interface. | faible |
| `arbre-des-regles.md:47` ; `etape-3-regles-projets.md:176-177` ; `src/regles-claude-code.js:39-40` | Une règle plus fermée que son dépôt n'est pas écrite (« portée locale, à venir »). Une dérogation à une règle du compte reste sans effet. Le texte dit `[À COMPLÉTER : CLAUDE.local.md ou import depuis le compte, à choisir à l'essai]`. | oui (deux voies nommées, essai jamais fait) | Faire l'essai des deux voies nommées. `claudeMdExcludes` pour la dérogation : nom présent dans le binaire, sens à vérifier. | faible |

#### Justesse des chiffres

| Où | Limite | Cherché ? | Palliatif vu | Coût |
|---|---|---|---|---|
| `etape-3-regles-projets.md:869-870` (V1) ; `src/socle.js:269,301`, `src/web/public/app.js:69` | Les projets retirés du catalogue sortent de la vue Projets : 245,51 $ et 21 sessions sur 307 ne sont comptés nulle part en 30 jours. Le tableau de bord affiche un identifiant brut. | oui (contrôle de bouclage sur le total, « rouge aujourd'hui ») ; où les ranger reste au choix de l'auteur | Ligne « projets retirés » dans `projets()`, nom tiré du dernier `element.retired`. | faible |
| `:871` (V2) ; `src/socle.js:281`, `src/contexte.js:122-124` | L'état du dépôt est celui de l'heure dans l'interface et le MCP, et lu en direct dans la reprise (2 contre 3 non poussés, constaté). | choix à l'auteur | Dire l'heure de lecture ; ou appeler `etatDepot` en direct dans `projets()`. | trivial |
| `:871-872` (V3) ; `app.js:160`, `src/mcp/serveur.js:41` | « Tours » compte la session seule dans une colonne, les sous-agents compris dans le MCP. | choix à l'auteur | Deux champs nommés. | trivial |
| `:874` (V5) ; `src/socle.js:258-259,236` | Le coût d'un projet est une part datée sur la carte, et un coût entier sur 90 jours dans sa liste. | non | Colonne « part du projet » sur 30 jours quand la liste est filtrée. | faible |
| `:875` (V6) ; `src/socle.js:351`, `app.js:154` | L'histogramme compte par jour UTC, la liste des sessions par jour de fin. | non | Filtrer côté serveur les sessions qui ont un coût ce jour-là. | faible |
| `:875` (V7) ; `src/contexte.js:76-81`, `src/socle.js:154-159` | Deux « seuils de passation » s'appliquent à deux mesures différentes. | non | Renommer l'une, ou comparer la même. | trivial |
| `:875-876` (V8) ; `src/contexte.js:113,134` | La reprise est tronquée sans le dire (3 restes sur 7). | non | « Reste (3 sur 7) ». | trivial |
| `:876` (V9) ; `app.js:64,69,76,89,160` | Des chiffres ne sont qu'en infobulle, inaccessibles au toucher. | non | Texte visible ou `<details>`. | faible |
| `:883-884` (E4) ; `src/inventaire/index.js:33-35` | Un adaptateur en erreur efface ses fiches du catalogue et journalise de faux `element.retired`. | non | Garder les fiches précédentes de cet adaptateur. | faible |
| `:847-848` (N2) ; `src/inventaire/index.js:18-23,37-41` | Inventaires et imports concurrents : `element.retired` fantômes, événements en double, usage MCP doublé. Aucun verrou. | oui (contrôle de famille ; palliatif 10 de `modules-et-palliatifs`, un seul écrivain) | Fichier verrou (`wx`, pid périmé) autour de l'inventaire, de l'import et du rafraîchissement ; dédoublonner `tool.called` par identifiant. | faible |
| `:849` (N3) ; `src/service.js:75-80`, `src/distant.js:116-122` | `~/.claude.json` est réécrit pendant que Claude Code l'écrit. L'écriture est atomique, mais une mise à jour peut se perdre. | non | Relire juste avant le renommage, puis réessayer. | faible |
| `:849-851` (N4) | Six écritures restent non atomiques (`ecrireSansLien`, règles générées, crochet, unités) : un fichier coupé est pris pour étranger, ou la garde est sautée. | oui (contrôle de famille) | Rendre `ecrireSansLien` atomique et y faire passer les cinq autres. | faible |
| `etape-3-regles-projets.md:306` ; `src/controles.js:175-178` | Une faille sans score ni gravité déclarée ne fait pas d'écart (elle vaut -1 et sort du filtre). | non | Écart « gravité inconnue », ou lecture du vecteur CVSS de l'avis. | trivial |
| `etape-3-regles-projets.md:125` ; `src/import/claude-code-transcriptions.js:102` | Un chemin relatif dans une commande (hors `cd` et `git -C`) est ignoré : `../autre-depot/...` ne rattache pas la session. | non | Résoudre aussi les mots qui contiennent `/` depuis le répertoire courant de la ligne. | faible |
| `etape-3-regles-projets.md:364` ; `src/contexte.js:17-20` | La taille du contexte a un tour de retard (dernier usage lu : entrée et cache). | non | Ajouter `output_tokens` de la dernière réponse et une estimation de l'invite, que le crochet reçoit. | trivial |
| `etape-3-regles-projets.md:631-633` | Une CI détectée par sa configuration n'est « pas la preuve qu'elle tourne ». | non | Dernier passage lu par `gh` dans la reprise (réseau ; l'inventaire n'y va pas). | faible |
| `etape-3-regles-projets.md:674-675` | Deux messages d'approbation de forme non listée restent `autre` dans l'historique. Les motifs ont été élargis depuis, sans relecture. | non | Monter la version de l'état d'import pour relire une fois. | faible |
| `etape-3-regles-projets.md:773` | Une approbation accordée ne laisse pas de trace sûre : non mesurée. | non | Noter `PermissionRequest` (crochet déjà employé par la veille) suivi du résultat de l'outil. | faible |
| `2026-10-03-cout-liste.md:30-32` ; `etape-1-voir.md:79` ; `src/tarifs.js` | La grille de tarifs n'est pas datée : un changement de tarif rechiffre tout l'historique. La majoration `inference_geo: "us"` (×1,1) n'est pas lue. | oui (grille datée « au premier changement de tarif ») | Grille avec date d'effet par ligne. Pour la majoration : signaler une valeur `us` (0 sur 746 transcriptions mesurées). `[À COMPLÉTER : un tarif a-t-il changé depuis le 2026-10-03 ?]` | faible ; trivial |
| `etape-3-regles-projets.md:1134-1135` | « Non fait » de la proposition (3) : un projet en échec n'est pas isolé à l'audit (« plus aucune levée connue à reproduire »). | oui (proposé, puis écarté par l'agent) | `try` par projet dans la boucle d'audit. | faible |

#### Gardes muettes, rejeux, réglages posés à la main (passe par famille du 2026-10-08, « choix à l'auteur »)

| Où | Limite | Cherché ? | Palliatif vu | Coût |
|---|---|---|---|---|
| `:852-853` (C1) ; `src/audit.js:71-73` | La garde reste muette sur un dépôt déplacé ou un worktree jusqu'à l'inventaire suivant. | oui (contrôle de famille) | Repli par premier commit et `--git-common-dir` ; au moins un avertissement. | faible |
| `:853` (C2) ; `src/creation.js:177-198` | À la création, un identifiant de chemin périmé est déclaré et commité dans le profil. | oui (contrôle de famille) | Comparer l'identifiant à `racine(dossier)` après le premier commit. | trivial |
| `:854` (C3) ; `src/materialisation.js:28` | `regles appliquer` recrée l'ancien dossier d'un dépôt déplacé. | oui (contrôle de famille) | Refuser un chemin absent. | trivial |
| `:854-855` (C4) ; `src/audit.js:27-34,81` | La garde lit des règles fraîches mais une liste privée périmée. | oui (contrôle de famille) | Passer les fiches fraîches à `contexteControle`. | trivial |
| `:855` (C5) ; `src/stockage/catalogue.js:31`, `src/socle.js:56,66` | La fraîcheur est datée en fin d'inventaire, et la décision est lue dans l'index. | oui (contrôle de famille) | Dater au début ; décider sur le catalogue. | faible |
| `:857` (R1) ; `src/creation.js:272` | Le rejeu dit « github : deja » alors que des commits ne sont pas poussés. | oui (banc de rejeu) | `rev-list --count @{upstream}..HEAD`. | trivial |
| `:858` (R2) ; `src/creation.js:321` | Le rejeu dit « accès distant : service actif » sans regarder l'état. | oui (banc de rejeu) | Lire `actif`, que `liste()` rend déjà. | trivial |
| `:858-859` (R3) ; `src/distant.js:47` | Une pose interrompue passe pour « coupée à la main » et n'est plus rallumée. | oui (banc de rejeu) | Marque « pose en cours », ou manifeste des unités activées. | faible |
| `:859-860` (R4) ; `src/creation.js:158,170` | Un fichier de base ignoré par git bloque tous les rejeux. | oui (banc de rejeu) | `git check-ignore`, puis un geste qui le dit. | faible |
| `:860-861` (R5) ; `src/contexte.js:51` | L'annonce unique des sessions coupées répond « deja » sans preuve de remise. | oui (banc de rejeu) | Marque durable écrite à l'annonce. | faible |
| `:861` (R, mineur) ; `src/import/claude-code-transcriptions.js:258-261` | L'état d'import avance malgré des événements refusés. | oui (banc de rejeu) | Ne pas avancer une clé dont un événement est refusé. | faible |
| `:862` (R, mineur) ; `src/garde-git.js:49` | Un crochet sans bit d'exécution est dit en place. | oui (banc de rejeu) | `accessSync(X_OK)`, puis `chmod`. | trivial |
| `:864-865` (M1) ; `src/distant.js:272-276` | `distant activer` rallume le minuteur de réveil coupé à la main (trou de `routines-posees`). | oui (contrôle de famille) | Le même test `coupee` qu'à la ligne 421. | trivial |
| `:865-866` (M2) ; `src/regles-claude-code.js:129,143-146` | Des crochets et des clés de `settings.json` sont remis, ou doublés, après un geste à la main. | oui (contrôle de famille) | Une entrée présente au manifeste mais absente du fichier est un retrait à la main : la laisser et le dire. | faible |
| `:866` (M3) ; `src/service.js:78-80` | `service poser` repointe un serveur MCP `holarch` réglé ailleurs. | oui (contrôle de famille) | Ne repointer qu'un chemin sous `accueil/service` ou vers le socle. | trivial |
| `:866-867` (M4) ; `src/distant.js:49-61` | Des unités modifiées à la main sont réécrites. | oui (contrôle de famille) | Empreinte du dernier texte écrit. | faible |
| `:867` (M5) ; `src/identite-git.js:31-32` | Une identité git retirée à la main est reposée. | oui (contrôle de famille) | Note sans réglage local : retrait à la main, à laisser. | trivial |
| `:867` (M6, reste) ; `src/commun.js:76-79` | Sans `racine` (`~/.claude.json`, catalogue, états), `ecrireJson` remplace un lien et ne garde pas les droits. Levé en partie, voir § 4. | oui (contrôle de famille) | `lstat`, écrire au `realpath`, recopier le mode. | trivial |
| `:887-888` (E, mineurs) | Écarts mineurs : `git add -A` des règles non vérifié (`creation.js:240`) ; récolte muette sans gitleaks (rien au journal) ; lecture non stricte des crochets (`controles.js:538`) ; échec de `systemctl` lu « inactif » dans `actif` et `coupee` (`distant.js:45-47`). | oui (contrôle de famille) | Vérifier le statut ; un événement ; `strict` puis indisponible ; passer par `sv.systemd()` comme `etatVeille`. | trivial à faible |
| `etape-3-regles-projets.md:818-821` | « Risques faibles, à la clôture », sauf le temporaire à nom fixe (levé) : liste des projets sans filtre de site ; compte Claude Code réglé à deux endroits (`config.js:22,32`) ; seuil de 150 000 en dur (`socle.js:154`) ; lecture de l'amont et `git config` recopiées ; récolte sans gitleaks en code 0 (`bin/holarch.js:224-229`) ; copies `*.pose-<pid>` interrompues jamais retirées ; import en double (`bin/holarch.js:18-19`). | non | Filtre `f.site` ; une seule clé ; `null` par défaut ; une fonction commune ; `exit(1)` ; nettoyer les `*.pose-*` orphelines ; retirer une ligne. | trivial (compte : faible) |

#### Veille, conteneur, outillage, méthode

| Où | Limite | Cherché ? | Palliatif vu | Coût |
|---|---|---|---|---|
| `veille-et-conteneur-precisions.md:45` ; `src/veille.js:139-141` | Une transcription sans entrée datée dans ses 64 derniers Kio est datée par sa modification, ce qui fait revenir le défaut mesuré (entrées non datées jusqu'à 6 jours après). | non | Remonter bloc par bloc jusqu'à une entrée datée. | trivial |
| `veille-et-conteneur-precisions.md:46-47` | L'erreur d'un crochet s'efface à la note réussie suivante : une panne passagère entre deux audits peut ne pas se voir. | non | Un événement au journal quand l'erreur s'écrit. | faible |
| `veille-et-conteneur-precisions.md:56` ; `etape-3-regles-projets.md:592` | Un projet sans dépôt git n'est ni versionné ni audité (deux dossiers hors d'atteinte du contrôle des dépendances). | non | `git init` (geste de l'auteur), puis déclaration. | trivial |
| `etape-3-regles-projets.md:795` ; `src/contexte.js:31-34`, `src/conteneur.js:72-75` | Les sessions coupées d'un conteneur ne sont pas vues : elles vont dans le dossier `-workspaces-<nom>`, pas dans celui de l'hôte. | non | Lire aussi le dossier de transcriptions du conteneur du même projet. | faible |
| `etape-3-regles-projets.md:1151-1152` | Une image changée sans utilisateur garde `vscode`, et l'audit ne le voit pas. | non | Refuser une couche qui pose `image` sans `remoteUser`, comme les autres refus de génération. | trivial |
| `etape-3-regles-projets.md:1314-1315`, `:306-307` ; `src/controles.js:199-202` | `outils-a-jour` ne connaît que GitHub et la LTS de node. `devcontainer` n'est pas suivi (404 sur GitHub), ni Claude Code ni Tailscale (« se mettent à jour seuls »). | oui pour `devcontainer` (« il lui faudrait une source npm ») ; non pour les deux autres | Source `npm: <paquet>` (dernière version au registre npm) : elle couvre aussi Claude Code. | faible |
| `etape-3-regles-projets.md:1419-1420` | Critère de A : « une session archivée le reste après une relance », non vérifié. | non | Essai (geste de l'auteur, une minute). | trivial |
| `etape-3-regles-projets.md:1386-1389` (Q22) | Chaque relance du serveur, dont celle du réveil, ouvre un environnement neuf, et les sessions ouvertes avant ne sont pas reprises. Cause probable, non confirmée. | non | Réglage existant `session_au_demarrage: reprendre`, au prix de la désarchivation que A voulait éviter. Confirmer la cause d'abord. | trivial |
| `etape-3-regles-projets.md:1045-1046` | La veille effective après la levée n'est pas observée, seulement « attestée par la levée ». | non | Lire après coup le journal système de Windows (événements de veille). | faible |
| `etape-3-regles-projets.md:1278-1286` | Mineurs restants de la contre-épreuve : exception utilisée visible seulement en ligne de commande ; sous-agents de workflow à 4 niveaux au plus (`transcription.js:11`, alors que le texte dit « à tout niveau ») ; gardien dit activé sans systemd ; trois formats de date ; « en relance » absent de `veille-retardee` ; « non tenue » sur un systemd injoignable ; marque de relance laissée ; dates en UTC (`creation.js:131`, `socle.js:409`) ; tests qui écrivent `/a` ; trois mutants verts. | non | Une correction et un test chacun. | trivial chacun |
| `modules-et-palliatifs.md:58` | Pas d'intégration continue (aucun `.github/workflows` dans le socle). | oui (palliatif 12) | GitHub Actions qui lance `npm test`. | faible |
| `etape-3-regles-projets.md:1330` | Le registre des types (`conception/types.md`) n'est lu par aucun code. | non | Valider le `type` d'un nœud à l'inventaire. | faible |
| `etape-3-regles-projets.md:125-126` | Un dépôt hors des racines de `depots-git` n'est pas un projet et ne reçoit aucune session. | non | Ajouter la racine au réglage. | trivial |
| `essai-site-travail.md:98-103, 104-111, 113-114` (Q8) | Non vérifiés : la reprise par le pont avec un délai court ; le client HTTP de Claude Code sur une session expirée ; la carte « Appels MCP » ; une panne sous `failOpen`. | non | Essai sur le site de travail. | faible |
| `profil-designe.md:83` (Q32) | Site de travail `[À COMPLÉTER]` : sans la clé `profil`, il perd les règles de son profil au compte. | oui (l'audit le dit) | Poser la clé `profil` dans sa configuration une fois Q32 répondue. | trivial |

### 2. Ouvertes, palliatif moyen ou fort

| Où | Limite | Cherché ? | Palliatif vu | Coût |
|---|---|---|---|---|
| `etape-3-regles-projets.md:391-393`, `:713` ; `identite-par-contexte.md:36` | L'adresse personnelle est dans 8 commits publiés de `holarch-socle` et dans les 4 d'un autre dépôt public : « geste de l'auteur, à décider à part ». Rien n'est décidé (journal, questions, idées). | oui (réécriture, geste réservé) | Réécriture de l'historique et envoi forcé, dépôt par dépôt. | moyen |
| `etape-3-regles-projets.md:872-874` (V4) ; `src/audit.js:100-107,317-318` | Les écarts ouverts de l'audit diffèrent de ceux du journal. Un contrôle indisponible ne résout jamais ; le contenu reste figé à la première détection. | oui (choix à l'auteur) | Réécrire `rule.violated` quand le contenu change ; dire « non vérifié depuis ». | moyen |
| `:884-885` (E5) ; `src/inventaire/outils.js:45-48`, `depots-git.js:28-38` | `git()` de l'inventaire rend null pour tout échec : « 0 fichier modifié », et l'identifiant de projet change. | oui (contrôle de famille) | Rendre `{ok, sortie}` et garder l'identifiant précédent sur échec. | moyen |
| `:885-886` (E6) ; `bin/holarch.js:240,246` | Une garde en échec et des contrôles indisponibles ne vont jamais au journal (`system.degraded` ne couvre que la passerelle). | oui (« l'étendre change le contrat ») | Un événement de dégradation, contrat événement en version mineure. | moyen |
| `etape-3-regles-projets.md:1312-1313` | Limites de la garde : les écritures de git lui-même (identité, `add`, `commit`) et la course entre vérification et écriture. | oui (`O_NOFOLLOW` essayé, puis retiré : son mutant restait vert) | Vérifier que `.git` et ses sous-dossiers ne sont pas des liens avant chaque appel de git ; la course n'a pas de palliatif simple. | moyen |
| `veille-et-conteneur-precisions.md:53-55` | À chaque pose, le gardien relancé relâche la demande d'éveil environ 0,68 s. | non | Relais : le nouveau gardien tient la demande avant que l'ancien la lâche. | moyen |
| `etape-3-regles-projets.md:513-515` (Q24) | Pas de pare-feu du conteneur tant que les domaines de Remote Control sont inconnus. | non | Relever les domaines pendant une session (journal DNS), puis une liste blanche. | moyen |
| `etape-3-regles-projets.md:1288-1289` | Le test « un commit fautif est refusé par le crochet » échoue 1 fois sur 42, cause inconnue. | non | Boucle de lancements avec diagnostic sur échec. | moyen |
| `revue-page-blanche.md:33-34` ; `modules-et-palliatifs.md:51` | Les coûts sont lus dans un format privé de Claude Code : `[À COMPLÉTER : à vérifier dans la doc]`. | oui (palliatif 8 : un seul lecteur, module OpenTelemetry) | Seconde source par la télémétrie native. | moyen |
| `etape-3-regles-projets.md:1329-1330` ; `modules-et-palliatifs.md` (palliatif 6) | Écart du code avec le texte : `context` n'est jamais rempli sur un événement, et aucune lecture n'est filtrée par classification (MCP, interface). | oui pour `context` (palliatif 6) ; non pour le filtre | Remplir `context` à l'import ; filtrer les sorties au-dessus d'une classification. | moyen |
| `etape-3-regles-projets.md:196` | Les autres agents d'un projet (hors Claude Code) ne reçoivent aucune règle. | en partie (le second projet garde son `CLAUDE.md`) | Un adaptateur par agent. | moyen |
| `etape-3-regles-projets.md:262-265` | Une lecture refusée (`permissions.deny`) ne couvre pas `grep -r` ni un script. Une session en mode `auto` peut donc lire un `.env`. | oui (essai du 2026-10-13 : le bac à sable refuse `cat`, `grep -r` et `python3` sous WSL2) | Réglage `sandbox` du compte, posé par la section `claude_code` du profil, avec des listes tirées de la mesure de 30 jours (domaines, écritures, commandes exclues ; environ 9 % des commandes sortent des limites par défaut). Rien de posé (choix de l'auteur du 2026-10-13). | moyen |

### 3. Ouvertes, sans palliatif

| Où | Limite | Cherché ? | Raison | Coût |
|---|---|---|---|---|
| `etape-3-regles-projets.md:59` | Le poste doit être allumé pour l'accès distant et l'interface. | non | Le serveur tourne sur le poste. Un hôte toujours allumé serait un autre site (livraison fort coûteuse). | fort |
| `etape-3-regles-projets.md:364-365` | Seul l'auteur peut lancer `/clear`. | non | Commande réservée à l'utilisateur par le runtime. | — |
| `veille-et-conteneur-precisions.md:43-44` | Une question posée pendant qu'un sous-agent de fond écrit compte comme un travail, jusqu'à 30 minutes. | non | Le sous-agent travaille : retenir le poste est le comportement voulu par la même décision (« un sous-agent de fond retient le poste tant qu'il écrit »). | — |

### 4. Levées depuis

| Où | Limite | Cherché ? | Levée par | Coût |
|---|---|---|---|---|
| `etape-3-regles-projets.md:846` (N1), `:879` (E1) | Une ligne coupée du journal arrête tout ; l'index reste verrouillé. | oui | `1dec3d1` | — |
| `:881-882` (E2), `:883` (E3) | Des règles illisibles, ou un contrôle des secrets sans git, se disent conformes. | oui | `395cb94`, `5b4e286` (E2) ; `e89d39a` (E3) | — |
| `:895-896` (X2), `:896` (X3) | `core.fsmonitor` exécuté chaque heure ; XSS dans l'interface. | oui | `e203a55`, `9d2c69c`, `790c365` (X2) ; `9f2ed9a`, `ffc9204` (X3) | — |
| `:891-893` (X1, en partie) | Un contexte tiers ou un type tiers de même `id` était cru. | oui | `7caa89c`, `c9a623b`, `134418e` (décision `profil-designe`). Le reste de X1 est au § 1. | — |
| `:820` (risque faible) | Fichier temporaire de `~/.claude.json` à nom fixe. | — | `088d960` (numéro du processus) | — |
| `:867` (M6, en partie) | `ecrireJson` remplace un lien. | oui | `786cd6e` : refus avec `racine`. Le reste est au § 1. | — |
| `:887` (E, `git add`, en partie) | `git add` non vérifié à la création. | oui | `f763891`, sauf `creation.js:240` | — |
| `:888` (E, `systemctl`, en partie) | Échec de `systemctl` lu « inactif ». | oui | `180314f`, `70bf5ae` pour le gardien ; le reste est au § 1. | — |
| `:800-816` (A1 à A8, T1 à T3) | Défauts de la passe globale. | oui | Corrigés le 2026-10-08 (l. 823-842), un commit et un test chacun. | — |
| `:1233-1266` (majeurs 1 à 5, mineurs 1 à 5 de `profil-designe`) | Collision d'identifiants, `termes` effacés, `derogations: 5`, profil jamais audité, identifiant changé. | oui | `84aa0ec`, `6ac2679`, `5fdd774`, `074b20e`, `dae57a9`, `14b9b22`, `bea9937`, `2dab815`, `66c785b`, `ef362da` | — |
| `:1393-1417` (B, 4 majeurs et 13 mineurs) | Borne d'immobilité, sous-agents de fond, relance du gardien, etc. | oui | Fait du 2026-10-09 (l. 968-980) | — |
| `:1298-1300` (d) | L'étape `cle` regardait la présence d'une clé au dépôt, pas celle du conteneur. | oui | `0544b36`. Cas « `gh` en échec lu comme aucune clé » : corrigé dans la copie de travail d'une autre session, non commité à HEAD (`creation.js:304-313`). | — |
| `:1298-1306` (c), (e1), (e2) | Rapport d'un sous-agent ; `--network=host` ; casse du nom. | oui | `9df599c`, `a876798`, `4ff6364` | — |
| `:795-796` | L'annonce des sessions coupées se répétait pendant 24 h. | non | `5419da3` (annonce unique ; son défaut R5 est au § 1). | — |
| `veille-et-conteneur-precisions.md:57-59` | Compte sans profil ou à plusieurs profils. | oui | Décision `profil-designe`, `7caa89c`, `c9a623b` | — |
| `etape-2-point-entree.md:57` ; `procedure-site-travail.md:150` | La passerelle ne voit pas l'échec d'un outil. | non | En partie : `cc3ed50` (tranche 9), l'échec se compte en `tool.failed`. Le `statut` des appels fédérés reste celui du HTTP. | — |
| `essai-site-travail.md:64-66` (constat 10) | Un remplacement était pris pour un déplacement à l'inventaire. | oui | `b5d7be5` (Q12) | — |
| `etape-3-regles-projets.md:567` | `modele-par-etape` déclarait remplacer une mémoire mal nommée. | non | Retirée des `replaces` (Fait du 2026-10-07, point 6, `6e76a7b`) ; aucun `replaces` ne la cite. | — |
| `etape-3-regles-projets.md:526, 576` | Test visuel non passé sur l'hôte (pas de Chromium). | oui | Passé dans le conteneur (`1f67d0b`, puis l. 919) | — |
| `cloture-etape-2.md:29-30` | Hors conteneur, `HOLARCH_HOME` n'est pas défini. | non | `~/.bashrc` l'exporte ; les services et le crochet le reçoivent (`etape-2-point-entree.md:71-73`). | — |
| `etape-3-regles-projets.md:50-51` | « Plus tard » : accès distant comme étape de la création. | — | `49af552` (étape 7 de `projet creer`) | — |
| `etape-3-regles-projets.md:67` | « Plus tard » : écarts aux règles dans la vue Projets. | — | `3fb2624` (tranche 4) | — |
| `veille-et-conteneur-precisions.md:48-52` | systemd injoignable pris pour une absence. | oui | `180314f`, `ab3ee9e` | — |
| `etape-3-regles-projets.md:1348-1358` (« Fait le 2026-10-08 ») | Corrections courtes qui rendaient les garde-fous muets. | oui | Voir N1, E1 à E3, X2, X3 ci-dessus | — |

### 5. Tranchées par l'auteur

| Où | Limite | Cherché ? | Choix écrit | Coût |
|---|---|---|---|---|
| `partage-et-bac-a-sable.md:17-19, 49-50` | Une session distante sur l'hôte voit la clé SSH et `gh` avec tous ses droits. | oui | Dérogation écrite jusqu'à la livraison D. | — |
| `veille-et-conteneur-precisions.md:36, 63-66` | Risque résiduel jusqu'à D (un conteneur écrit ce que l'hôte exécute). | oui | Exception jusqu'à D. L'agent recommandait de le garder visible. | — |
| `veille-et-conteneur-precisions.md:42` ; `environnement-d-execution.md:96` | Une session en conteneur n'est pas notée par la veille avant D. | oui | « B couvre les sessions de l'hôte ». | — |
| `fusion-et-profil-audite.md:37, 46` ; `profil-designe.md:73-76` ; `etape-3-regles-projets.md:1263-1268` | Exceptions `LICENSE` et `NOTICE` pour 7 projets sur 8. | oui | Gardées ; autre voie écartée. | — |
| `fusion-et-profil-audite.md:48` | Le dépôt du profil n'est audité que pour ses conteneurs. | oui | Choix 3 ; autre voie écartée. | — |
| `fusion-et-profil-audite.md:50` | Un projet déclaré jamais vu sur ce site ne dit rien. | oui | Choix 4 ; autre voie écartée. | — |
| `profil-designe.md:65-67` | Le dépôt du profil monté en lecture n'est pas un écart. | oui | Choix 4 : l'intégrité, pas la confidentialité. | — |
| `fusion-et-profil-audite.md:44` | Une valeur posée plus bas ne retire rien. | oui | Choix 1 : forme gardée. | — |
| `etape-3-regles-projets.md:1307-1310` (e3) | Un fichier généré dont la marque est retirée passe pour écrit à la main. | oui | « Rien, limite », le 2026-10-11. | — |
| `routines-posees.md:32` | L'état d'une routine vit hors de l'arbre : une réinstallation rallume tout. | oui | Voie 1 retenue, avec sa condition de changement. | — |
| `etape-3-regles-projets.md:654-655` | Une branche sans amont rend le contrôle « non disponible ». | — | Choix de l'auteur. | — |
| `etape-3-regles-projets.md:540-545` | 276 sessions « hors projet » (projet antérieur). | — | Avis de l'auteur : elles restent hors projet. | — |
| `etape-3-regles-projets.md:365, 1339-1343` | Les sessions de Claude Desktop ne reçoivent pas les règles. | oui | Q30 résolue : ses projets les pallient ; I35 retenue, mécanisme en Q31. | — |
| `etape-3-regles-projets.md:195` ; `arbre-des-regles.md:47` | Les règles du compte valent pour tous les projets du site. | oui | Matérialisation approuvée, « contexte si le site n'en a qu'un ». | — |
| `etape-3-regles-projets.md:307` ; `veille-securite-versions.md:27` | Un projet non déclaré n'est pas audité. | oui | « L'auteur y déclare ceux à surveiller ». | — |
| `echecs-au-journal.md:49` | Les lanceurs de tests autres que npm et node (pytest, cargo) ne sont pas reconnus. | oui | Condition de changement écrite et approuvée ; non atteinte (2 lancements de `pytest` en 30 jours). | — |
| `environnement-d-execution.md:24-26` | `--continue` désarchive la session reprise. | oui | « L'auteur accepte d'ouvrir une session neuve » (livraison A). | — |

### Remarques

- La plupart des limites ouvertes viennent de la passe par famille du 2026-10-08. Chaque famille y proposait un
  contrôle, et l'ordre restait à choisir par l'auteur (Reste, point 2). Le motif vu par l'auteur, une limite déclarée
  sans chercher son palliatif, se lit surtout dans les lignes « Limites connues » des tranches. Aucune n'a de palliatif
  écrit à côté, sauf celles des tranches 4 (bac à sable) et 1 (ACL). Exemples : le crochet qui laisse passer depuis un
  conteneur, la faille sans gravité, le tour de retard, le chemin relatif, `outils-a-jour` sans source npm.
- Le profil porte depuis peu une règle en brouillon `limite-avec-palliatif` (commit `2a99f55` du profil), non lue
  ici au-delà de son nom.

## Limites déclarées puis laissées : journal, questions, idées, docs et code (revue du 2026-10-11)

Revue en lecture seule de `holarch-socle` à `4ff6364`. Ce que j'ai lu en entier : `arbre/log.md` (897 lignes),
`arbre/questions.md`, `arbre/idees.md`, `README.md`, `docs/architecture.md`. Dans `src/`, `bin/`, `modeles/` et `test/`,
j'ai cherché les mots du genre « limite », « inconnu », « en silence », « à défaut », « jusqu'à D », « non vérifié »,
« ignoré », « partiel », « incomplet », etc., puis lu le contexte autour de chaque occurrence. Pour chaque limite, j'ai
vérifié son état dans le code, dans `git log`, et quand c'était sans risque sur le poste (journal du service, unité
systemd, crochet posé, binaire de Claude Code). Je n'ai rien mesuré au-delà de ce qui est cité.

J'ai laissé de côté les limites de la livraison C déjà en cours de comblement : l'étape `cle` (`log.md:30-31`,
`creation.js:298`, `creation.js:312`, `modeles/projet/deploy-key.sh`) et `devcontainer` dans `outils-a-jour`
(`log.md:63-64`).

Coûts : trivial (une ligne ou un affichage), faible (quelques lignes et leur test), moyen (un mécanisme ou un essai),
fort (touche une décision d'isolement ou une source externe).

| Où | Limite | Palliatif cherché à l'époque ? | Palliatif vu | Coût |
|---|---|---|---|---|
| **Ouverte, palliatif trivial ou faible** | | | | |
| `bin/holarch.js:240`, `src/audit.js:61-63`, `src/audit.js:95` | Quand un contrôle d'une règle bloquante est indisponible (outil absent, délai dépassé), la garde laisse passer le commit avec « non vérifié ». Pourtant, des règles illisibles font refuser le commit (`audit.js:77-80`). Et puisque l'auteur pousse vite (90 % des envois en moins de 0,4 h dans le socle, `log.md:677`), le commit peut être poussé avant l'audit horaire. | Non. La spécification (tranche 4, l. 234) n'écrit que le cas « HOLARCH injoignable ». | Refuser aussi quand un contrôle bloquant est indisponible ; `--no-verify` reste le passage explicite, que l'audit voit comme commit forcé. Le comportement est écrit dans la spécification : le changer demande une décision. Mesure : 0 « non vérifié » dans les transcriptions lisibles depuis l'hôte. | faible (plus une décision) |
| `log.md:537`, `src/web/serveur.js:30-35`, `src/mcp/serveur.js:80` | L'interface et le serveur MCP lisent le catalogue de l'heure. Une règle, un nœud ou une décision changés restent invisibles jusqu'à une heure dans les pages Règles, Projets et Arbre, et dans les outils MCP `regles`, `projets` et `arbre`. | Non (simple constat). | Faire comme `holarch regles`, `audit`, `recolte`, la reprise et `projet creer` : `if (await socle.arbreAJour()) socle.indexer()` dans les trois routes et les trois outils. Coût mesuré : 0,62 s quand l'arbre a changé, 0,31 s sinon. L'interface a un bouton « Rafraîchir » manuel, mais il refait tout ; le MCP n'a rien. | faible |
| `src/import/agentgateway.js:6-7`, `log.md:818` | La passerelle ne voit pas l'échec d'un outil : le statut d'un appel qui la traverse reste `null`. J'ai vérifié la suite : la carte « Appels MCP » compte `SUM(statut<>'ok')` (`socle.js:134`), donc un statut `null` entre dans le total N sans entrer dans les échecs. Le taux « refusé(s) ou en erreur sur N » (`app.js:76`) est sous-estimé, et rien ne le dit. Par ailleurs, les appels de Claude Code qui passent par la passerelle sont écartés des transcriptions (`claude-code-transcriptions.js:249`), alors que celles-ci portent `is_error`. | Non (la limite est constatée, aucune alternative écrite). | (a) Compter à part les statuts inconnus (« dont K inconnus ») ou les retirer du dénominateur : trivial. (b) Reporter sur l'appel de la passerelle le statut lu dans la transcription (même session, même outil, même minute) : moyen. Pour Desktop, je n'ai vérifié aucune source : aucun `mcp-server-*.log` dans les journaux de Desktop sur ce poste. Ne touche que le site de travail. | trivial (a), moyen (b) |
| `src/regles-claude-code.js:85` | Les crochets de passation (`UserPromptSubmit` pour l'alerte, `SessionStart` pour la reprise) finissent en `2>/dev/null \|\| true`. Si HOLARCH est injoignable, ni l'avis ni le résumé n'arrivent, et rien ne le signale. | Oui pour la veille seulement : un repli shell écrit une erreur datée, que lit le contrôle `veille-retardee`. | Appliquer le même repli aux deux crochets de passation (un fichier d'erreur, dit par `holarch etat` ou par le contrôle des réglages). | faible |
| `log.md:536` (« comparaison des dates seules »), `src/stockage/catalogue.js:31`, `src/inventaire/index.js:29-34` | La date du catalogue est prise à son écriture, c'est-à-dire après le passage de tous les adaptateurs. Un fichier d'arbre modifié pendant un inventaire porte donc une date plus ancienne que le catalogue : `arbreAJour` ne le voit pas jusqu'à l'inventaire suivant (jusqu'à une heure). | Non. | Dater l'instantané du début de l'inventaire, en passant l'heure de départ à `remplacer`. | trivial |
| `log.md:112`, `src/audit.js:280-300` | La proposition (3) n'a pas été faite : isoler à l'audit un projet en échec. Seuls les contrôles sont protégés (`controles.js:705`). Une levée dans `regleEffective`, `materialiserProjet` ou `ecartsConteneur` sur un seul projet arrête l'audit de tous, et donc tous les écarts du passage horaire. | Oui, mais écarté « faute d'un cas à reproduire » (spécification, l. 1134). | Un `try/catch` par projet, qui rend ce projet indisponible ; le test peut provoquer la levée lui-même. | faible |
| `log.md:375-377`, `src/contexte.js:113` | Le résumé de reprise donne un dernier fait et un reste périmés, sans la suite prévue. Le reste est coupé à trois entrées sans le dire (V8 : 3 restes sur 7). La correction proposée n'a pas eu de réponse. | Oui : proposé (avancement rangé, suite avant la coupure), en attente de l'auteur. | Celui qui a été proposé. Au minimum, écrire « (+N) » quand le reste est coupé. | trivial (le compte), faible (la suite) |
| `idees.md:52` (I37), `log.md:47-48`, `log.md:144` | L'avis de passation ne part qu'à l'invite (`UserPromptSubmit`). Deux séances d'un seul tour sont allées jusqu'à environ 260 k et 285 k tokens sans avis. | Oui : `PostToolUse`, « à mesurer d'abord » (statut : à trier). | Celui-là. Un point d'entrée léger existe déjà (`bin/veille-noter.js`, crochet synchrone qui ne charge pas tout `holarch`), ce qui limite le coût à chaque appel d'outil. | faible |
| `questions.md:37` (Q6, résolue) | Un serveur MCP conteneurisé se reconnaît à une étiquette du service Compose, mais « l'inventaire ne la lit pas encore ». Vérifié : `src/inventaire/docker.js` lit `com.docker.compose.project`, aucune étiquette de connecteur. | Oui (la réponse a été trouvée), mais jamais appliquée. | Une clé de réglage donnant le nom de l'étiquette (ce nom est au profil privé du site), lue par l'adaptateur docker. Utile au seul site de travail. | faible |
| `idees.md:26` (I11) | « Forme du fichier et coût en contexte [À COMPLÉTER] » des styles de sortie. Aucune question ne porte ce fait au registre. | Non. | Lire la documentation des styles de sortie de Claude Code. L'idée attend de toute façon la récolte du 2026-10-12. | trivial |
| **Ouverte, palliatif moyen ou fort** | | | | |
| `src/garde-git.js:16-20`, `bin/holarch.js:236` (et spécification, tranche 4, l. 266) | Le crochet de commit fige les chemins de node et de HOLARCH de l'hôte. Celui du socle contient `N='~/.local/opt/node/bin/node'` et `H='~/.claude/holarch/service/courant/…'`. Dans un conteneur (utilisateur `node`, `~/.claude` en volume depuis la correction de la faille), aucun des deux n'existe : tout commit passe avec « HOLARCH injoignable ». Or la mesure du 2026-10-09 donnait 68 % des sessions en conteneur (`log.md:303`). | Non : la limite est écrite sans palliatif. | (a) Quand HOLARCH est injoignable, lancer gitleaks seul sur l'index, si l'image l'a (option à vérifier dans l'aide de gitleaks 8.30.1). Coût faible ; couvre les secrets, pas les termes privés, qui restent hors du conteneur par choix. (b) Une garde complète dans le conteneur (copie de service en lecture, node du conteneur). Coût fort ; touche `conteneur-isole`, donc demande une décision. Fréquence non mesurable depuis l'hôte : les transcriptions de conteneur n'y sont visibles que jusqu'au 2026-10-06 ; 0 « injoignable » dans ce qui est lisible. | faible (a), fort (b) |
| `idees.md:49` (I34) | Garde de quota : seuil [À COMPLÉTER] et « source à trouver », car la ligne d'état ne tourne ni en Remote Control ni dans VS Code (Q29). | Oui (la ligne d'état, écartée par Q29). | Le binaire 2.1.296 contient un point d'accès `api/oauth/usage` et lit les en-têtes `anthropic-ratelimit-unified-5h-utilization` et `-7d-utilization`. Ce point d'accès n'est pas documenté, je ne l'ai pas essayé, et il demande le jeton OAuth du compte, donc il touche `secrets-hors-contexte`. | moyen |
| `idees.md:47` (I32), `log.md:480` | Le test visuel exigé par `verifier-avant-de-rendre` ne tourne pas sur l'hôte, faute de Chromium. Il est passé une fois, à la main, dans un conteneur jetable (`log.md:466`). Rien n'est construit : `package.json` n'a pas de `test:visuel:conteneur`. | Oui (I32, retenue). | Celui d'I32. Ou l'image officielle de Playwright pour la version 1.63 (P2 ; existence et étiquette à vérifier). | moyen |
| `log.md:802-803`, `bin/holarch.js:252` | Les événements importés avant `comptes_claude_code` restent « non attribués » (journal en ajout seul). | Non. | Des événements complémentaires, comme les `session.finished` du rattachement aux projets (`log.md:776`). Sinon, rien : ces événements, antérieurs au 2026-10-05, sortent de la fenêtre de 30 jours le 2026-11-04. Seuls les sites à plusieurs comptes sont touchés. | moyen (ou aucun, ça s'éteint seul) |
| **Ouverte, sans palliatif (raison)** | | | | |
| `log.md:205-206` (spécification, l. 1288-1289) | Le test « un commit fautif est refusé » a échoué 1 fois sur 42 suites ; cause inconnue. | Oui : 25 suites en boucle, 0 rouge. | Aucun sur la cause, faute de reproduction. La prochaine occurrence se lirait si l'on gardait la sortie des suites, puisque l'assertion porte le stderr du crochet (`test/etape3.test.js:547`). À noter : la garde laisse passer sur toute levée (`bin/holarch.js:246`), ce qui produirait exactement ce symptôme. | trivial (garder la sortie) |
| **Levée depuis** | | | | |
| `log.md:96-97` | Tri des horodatages en texte, que `racine()` partageait. | Oui (au Reste). | Levée : `ef362da` (2026-10-10), dates comparées en nombres. | — |
| `log.md:198`, `log.md:231` | L'import ne lisait pas les sous-agents de workflow (187 transcriptions). | Oui. | Levée : `b719d31`, `8776398`. | — |
| `log.md:291-293` | Faille du conteneur encore ouverte sur le poste ; contrôle contournable (casse, `-v` collé, `workspaceFolder` libre). | Oui. | Levée : corrections du 2026-10-09 (`log.md:278`), dont `64ae968`. | — |
| `log.md:357-358` | Quatre majeurs de B (« travaille » sans borne, travail après `Stop`, gardien non relancé, notes de conteneur). | Oui. | Levée : `7f0760a`, `712a3f3`, `cea84a5` (17 constats corrigés, `log.md:299`). | — |
| `log.md:333-335` | `service poser` aurait posé le gardien sans l'accord de l'auteur. | Oui (proposé). | Levée : `a96a051`, `ea96019`, le gardien suit la règle. | — |
| `log.md:467-469`, `log.md:478-479` | X2 et E2 incomplets (`post-index-change`, filtre de sous-module, régression latente sur les écritures) ; `erreur_entete` montrée nulle part. | Oui. | Levée : `9d2c69c`, `790c365`, `717836a`, `5b4e286`, `b02ae53` (signal dans la règle effective). | — |
| `log.md:537` (partie A4, spécification l. 806) | La garde avant commit et `projet creer` lisaient le catalogue de l'heure. | Oui. | Levée : `ee160a3` ; `creation.js:204`. L'interface et le MCP restent ouverts (première partie du tableau). | — |
| `log.md:539-540` (I28) | `holarch regles` lisait un catalogue périmé. | Oui. | Levée : `bea6f1a`. | — |
| `log.md:510-513` | La coupure d'une session était annoncée à chaque reprise. | Oui. | Levée : `5419da3`. | — |
| `log.md:698-699` | L'état du dépôt dans le résumé pouvait dater d'une heure. | Oui. | Levée : `de53780`, lecture en direct. | — |
| `log.md:383-392`, `questions.md:11` (Q22) | Deux arrêts en code 1 sans message ; cause probable non confirmée. | Oui (complément d'unité temporaire). | Levée en pratique. `55b3910` garde la sortie d'erreur au journal du service ; `4a1b396` démarre sans session, et l'unité en service lance bien `--no-create-session-in-dir`. Les relances du 10-10 à 19:26 et du 11-10 à 11:16 n'ont pas d'arrêt en code 1 au journal. Le reste de Q22 concerne le mode `--continue`, que le poste n'emploie plus. | — |
| `idees.md:35` (I20) | « Aucun GPU visible depuis WSL [À COMPLÉTER] ». | — | Levée : Q19, résolue le 2026-10-08 (RTX 5070 Ti visible). Le texte d'I20 porte encore l'ancien constat et le marqueur. | — |
| `log.md:122-125` | Cinq majeurs et six mineurs de la contre-épreuve de `profil-designe`. | Oui. | Levée : `5fdd774`, `84aa0ec`, `6ac2679`, `074b20e`, `dae57a9`, `66c785b`, `ef362da` (`log.md:68-114`). | — |
| **Tranchée par l'auteur** | | | | |
| `log.md:259-260` | Exception `acces-distant` du socle jusqu'à D. | Choix de l'auteur. | Tranchée. | — |
| `src/garde-git.js:40`, `src/controles.js:654`, `src/controles.js:667` | Risque résiduel jusqu'à D (dépôt monté en écriture, `core.hooksPath` qui sort du dépôt). | Décision `veille-et-conteneur-precisions`, stable (ligne « Risque résiduel jusqu'à D »). | Tranchée. | — |
| `src/veille.js:7-8` | B couvre les sessions de l'hôte ; le signe de vie d'une session en conteneur se conçoit avec D. | Même décision (ligne B). | Tranchée. | — |
| `log.md:204` | Limites de B (2), (4) et (7). | Écrites dans `exceptions-hors-du-depot`, approuvée. | Tranchée. | — |
| `log.md:676` (spécification, l. 655) | `commits-pousses` : une branche sans amont est « non disponible ». | Choix de l'auteur. | Tranchée. | — |
| `log.md:41-42` | L'audit ne compare que les fichiers générés. | Choix de l'auteur, recommandation suivie. | Tranchée. | — |
| `log.md:23`, `log.md:241`, `log.md:221-222` | `holarch` absent du `PATH` des sessions. | Proposition retirée à la mesure (5 échecs en 30 jours ; le même nom lancerait l'ancien code), critères dits à l'auteur. | Tranchée. | — |
| `log.md:552-554` (I26) | Pas de permissions par projet. | Avis suivi par l'auteur, sur mesure. | Tranchée. | — |
| `log.md:560-562` | Pas de règles chargées sur déclencheur. | Avis suivi par l'auteur, sur mesure. | Tranchée. | — |
| `log.md:790-792` | Le critère de l'étape 1 n'est plus une condition ; le critère « ici » de l'étape 2 reste ouvert et se mesure. | Décision `cloture-etape-2`. | Tranchée. | — |
| `log.md:113` (spécification, l. 1268) | Mineur 6 : `NOTICE` gardée comme limite. | Choix de l'auteur, écrit dans `profil-designe`. | Tranchée. | — |
| `log.md:761-763` | Le « hors projet » vient d'un dépôt antérieur retiré de la machine. | Avis de l'auteur. | Tranchée. | — |

### Hors tableau

- **Limites traitées sur le moment, et dites quand elles jouent** :
  - tokens sans tarif : le coût partiel est dit (`socle.js:124`, `app.js:37`, `bin/holarch.js:256`) ;
  - compte Claude Code non lu : signalé (`config.js:102`, `inventaire/index.js:28`) ;
  - transcription illisible ou trop grande : comptée, puis relue (`claude-code-transcriptions.js:202-203`) ;
  - variable de montage inconnue : contrôle indisponible, jamais dit conforme (`controles.js:563`, test
    `garde-fous.test.js:498`) ;
  - veille de Windows invisible de WSL : minuteur de réveil (`distant.js:126`) ;
  - ligne non JSON du pont : tracée (`pont.js:89`).
- **Questions ouvertes** qui attendent un essai ou une réponse, déjà au registre avec leur niveau : Q2, Q4, Q8, Q10, Q13,
  Q20, Q24, Q26, Q28, Q31, Q32. Leur palliatif est l'essai ou la réponse qu'elles nomment.
- **Remarque sans lien avec une limite** : le statut du `README.md` (l. 10-14 et 86) date de l'étape 2 (« étape 2 en
  cours », « implémentation de l'étape en cours (`etape-1-voir.md`) »).

Décompte :

| Classe | Nombre |
|---|---|
| Ouverte, palliatif trivial ou faible | 10 |
| Ouverte, palliatif moyen ou fort | 4 |
| Ouverte, sans palliatif | 1 |
| Levée depuis | 13 |
| Tranchée par l'auteur | 12 |

