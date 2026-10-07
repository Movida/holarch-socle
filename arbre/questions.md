# Questions ouvertes

| # | Nœud | Question | Niveau |
|---|---|---|---|
| Q2 | `besoins/besoins-fondateurs.md` | Qualifier B5 « déléguer une tâche longue en confiance » après le second test comparatif. | gênant |
| Q4 | `conception/contrats/regle.md` §1 | Vocabulaire des actions (`match`) commun aux adaptateurs : à fixer à l'étape 3 sur les premiers clients (Claude Code, Desktop). | cosmétique d'ici l'étape 3 |
| Q8 | `conception/essai-site-travail.md` §6-7, §13, §18-19 | Vie des sessions de la passerelle : serveurs lourds ou à secrets en serveur partagé (geste de la procédure, §3) ; le pont de Desktop (`holarch pont`) reprend une session expirée et ferme la sienne. Reste : le client HTTP de Claude Code reprend-il une session expirée ? Condition pour raccourcir la durée de vie (30 min). | cosmétique |
| Q10 | `conception/essai-site-travail.md` §2 | Grille de tarifs : relevable par une commande, ou fournie avec une date et une source plutôt que recopiée d'un autre site ? | cosmétique |
| Q13 | `conception/essai-site-travail.md` §16 | Brique Savoir : le serveur OKF fédéré en devient-il l'adaptateur, et que doit dire le contrat de la brique (lecture avant, proposition après, porte vérifiée) pour ne pas dépendre de ses outils ? À l'ouverture de l'étape 6. | cosmétique d'ici l'étape 6 |
| Q15 | `conception/etape-3-regles-projets.md`, tranche 1 | Un serveur Remote Control lancé avec `--no-create-session-in-dir` ne crée aucune session d'avance (plus aucune session vide) : le projet reste-t-il joignable depuis l'application (nouvelle session dans ce dossier), alors qu'elle ne montre qu'un appareil par machine ? [À COMPLÉTER : essai depuis le téléphone] | cosmétique |

## Résolues

| # | Question | Réponse |
|---|---|---|
| Q5 | Registre des clés de `config` des nœuds | ouvert avec la première clé réellement portée par un nœud (2026-10-07) : `conception/contrats/config.md`, décision `passation-sereine` |
| Q17 | Dépôt privé du profil | aucun n'existait ; créé le 2026-10-06 avec l'accord de l'auteur (dépôt privé de son compte, cloné à côté de ses projets) : `decisions/2026-10-06-arbre-des-regles.md` |
| Q16 | Quel second projet pour essayer l'arbre des règles ? | un bundle de connaissances privé du contexte personnel (choix de l'auteur, 2026-10-06) : autre nature que HOLARCH (pas de code), privé, il éprouve le côté fermé de l'arbre |
| Q14 | Que montrer d'un projet dans la vue Projets ? | avancement de ses étapes, questions et décisions qui l'attendent, activité récente (sessions, dernier commit, coût 7 et 30 j), état technique du dépôt, plus tard ses écarts aux règles ; une session se rattache aux dépôts où elle a travaillé (accord de l'auteur, 2026-10-05) : `conception/etape-3-regles-projets.md` |
| Q1 | Une classification peut-elle se relâcher en descendant ? | Non : `decisions/2026-10-03-classification.md` |
| Q3 | Synchronisation local ↔ serveur | `decisions/2026-10-03-synchronisation.md` |
| Q6 | Serveurs MCP conteneurisés : à quoi les reconnaître ? | à une étiquette du service Compose qui les déclare (essai du site de travail, constat 15) ; l'inventaire ne la lit pas encore |
| Q7 | Configuration de Claude Desktop installé en paquet MSIX | oui : l'adaptateur cherche aussi `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`, sous Windows et depuis WSL ; `inventaire.claude-desktop.config` reste prioritaire |
| Q9 | `failOpen` masque une cible morte : où mettre le contrôle ? | dans l'import du journal de la passerelle : chaque cible ignorée devient `system.degraded` (serveur, phase ; jamais le détail), signalé par `holarch etat` et la carte « Appels MCP ». Famille déjà au contrat, rien à décider. |
| Q11 | Compte Claude Code lu par défaut (`~/.claude`) alors qu'il y en a plusieurs | réglage explicite `comptes_claude_code` ([{nom, home}]) lu par l'inventaire et l'import, compte porté par les fiches et les événements, part par compte dans `holarch etat` ; un répertoire de compte présent mais non lu est signalé à l'inventaire. Sans le réglage, un site garde ses identifiants. |
| Q12 | Remplacer une fiche par une autre au même emplacement passait pour un déplacement | la ré-identification exige le même kind, le même emplacement **et le même nom** ; test du cas « deux serveurs dans un fichier » |
