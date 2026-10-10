---
type: decision
title: L'environnement des sessions, en cinq livraisons utiles seules
description: "Tranche 12 de l'étape 3, partie mise en œuvre de la décision `partage-et-bac-a-sable`. Cinq livraisons, chacune avec son critère : A démarrage sans session, B veille retardée, C conteneur généré depuis l'arbre (clé `conteneur`, contrat config 0.6.0), D accès distant dans le conteneur, E type `calcul-gpu`."
status: stable
approved: { by: human:auteur, at: 2026-10-09, ref: "échange du 2026-10-09 : « Approuver les décisions » (choix parmi les actions proposées)" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md, /arbre/decisions/2026-10-09-partage-et-bac-a-sable.md]
  modifies: [/arbre/conception/contrats/config.md, /arbre/conception/contrats/evenement.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-09-partage-et-bac-a-sable.md, /arbre/decisions/2026-10-07-creation-de-projet.md, /arbre/decisions/2026-10-06-arbre-des-regles.md]
---

# L'environnement des sessions, en cinq livraisons utiles seules

**Contexte (mesuré le 2026-10-09 sur le poste personnel ; les faits qui fondent les principes sont dans la décision
`partage-et-bac-a-sable`).**

- **Le conteneur est recopié, pas généré** : 6 projets sur 9 ont un conteneur, chacun une copie modifiée à la main
  (décision `creation-de-projet`), alors que P3 veut la configuration portée par l'arbre et que `CLAUDE.md` est déjà
  généré. La documentation d'Anthropic conseille un volume de connexion par conteneur
  (`code.claude.com/docs/en/devcontainer`).
- **Le conteneur du socle ne démarre plus hors de VS Code** (I32 ; sorti en code 127 depuis le 2026-10-08) ; il monte
  `~/.claude` dans `/home/vscode` alors que l'image tourne sous `node` (montage sans effet, à confirmer).
- **Reprise au démarrage** : `--continue` reprend la session du dossier et la **désarchive** (documenté,
  `code.claude.com/docs/en/remote-control`) ; la session reprise relit environ 135 000 tokens par message contre 50 000
  à 65 000 pour une session neuve (premiers messages des sessions du socle). L'auteur accepte d'ouvrir une session neuve
  depuis l'application (2026-10-09). L'option qui démarre le serveur sans session s'écrit
  `--no-create-session-in-dir` en Claude Code 2.1.295, et ne se combine pas avec `--continue` (aide lue dans le binaire,
  Q27) ; un serveur ainsi lancé reste joignable (Q15, essai du 2026-10-08).
- **Veille du poste** (journal système, 14 jours) : 7 veilles sur inactivité (secteur : 5 h), 5 veilles demandées à la
  main, 4 arrêts depuis le menu, 1 arrêt du système. Délai de réponse de l'auteur dans les sessions distantes (25
  sessions, 66 réponses) : médiane 1,2 min, 95 % sous 6 min, 98 % sous 15 min, un cas à 269 min.
- **Carte graphique** : NVIDIA RTX 5070 Ti, 16 Go, visible depuis WSL (Q19). Usage voulu par l'auteur : tests de rendu
  automatiques d'un projet three.js de l'auteur, partagés entre sessions parallèles et reproductibles chez un
  collègue sur sa propre carte.

**Avis.** Deux voies pour l'accès distant :

| Voie | Pour | Contre |
|---|---|---|
| Accès distant dans le conteneur du projet (`devcontainer up` puis `devcontainer exec`, lancés par le service de l'hôte) | bac à sable réel ; un seul conteneur pour VS Code et le téléphone ; le service et la reprise après veille restent | Docker et le conteneur doivent démarrer hors de VS Code (I32) ; une connexion Claude par conteneur |
| Accès distant sur l'hôte, comme aujourd'hui | rien à faire | contredit la décision `partage-et-bac-a-sable` |

Et deux pour décrire le poste : un `devcontainer.json` par projet, généré depuis l'arbre (standard, lu par VS Code, la
ligne de commande `devcontainer` et Codespaces), ou un seul fichier Compose pour tout le poste (plus centralisé, moins
partageable). La première voie est recommandée dans les deux cas.

Livrer d'un bloc attendrait que tout tienne ; découpé, chaque livraison sert seule et s'approuve à son critère.

**Décision.**

| Point | Choix |
|---|---|
| Session au démarrage | aucune : le serveur démarre sans session ouverte (`--no-create-session-in-dir`), l'auteur en ouvre une depuis l'application ; une session archivée le reste. Réglage du site `acces_distant.session_au_demarrage` (`aucune` par défaut, `reprendre` : la conduite d'avant, `--continue`) |
| Veille | règle du profil : le poste ne se met pas en veille d'inactivité tant qu'une session distante travaille, ou attend une réponse depuis moins de 30 min (98 % des réponses mesurées arrivent sous 15 min ; marge du double). Adaptateur : crochets Claude Code générés (début et fin de tour, attente) qui notent l'état de la session, et une demande d'éveil tenue côté Windows tant qu'une session l'interdit. Le socle n'éteint jamais le poste : il retarde la veille de Windows, qui reprend la main si l'adaptateur s'arrête. Une session dont rien de daté ne s'écrit depuis 30 min, ni dans sa transcription ni dans celles de ses sous-agents, est tenue pour en attente depuis sa dernière écriture : une demande de permission, une élicitation ou une fin de tour manquée ne tiennent pas le poste éveillé sans fin. Un sous-agent de fond retient le poste tant qu'il écrit ; un shell de fond, non. États des sessions au journal (P4) |
| Clé `conteneur` | au registre de configuration (contrat config 0.6.0), portée par le profil, le contexte, les types et le projet : `devcontainer` (clés du format `devcontainer.json` telles quelles, fusionnées comme les autres clés : aucun vocabulaire refait, P2), `gpu` (`non` par défaut, `optionnel`, `requis` : traduit en `hostRequirements.gpu`), `connexion_claude` (`volume` par défaut : un volume par conteneur et `CLAUDE_CONFIG_DIR`, comme le conseille Anthropic ; `hote` : montage du `~/.claude` de l'hôte, dérogation écrite) |
| Génération | `holarch projet creer` (étape `conteneur`) écrit `.devcontainer/devcontainer.json` depuis la configuration effective, marqué comme les autres fichiers générés ; l'audit compare le fichier à la configuration ; le modèle recopié (`modeles/projet/devcontainer.json`) est retiré |
| Lieu de l'accès distant | dans le conteneur du projet : le service de l'hôte lance `devcontainer up` sur le conteneur existant (même étiquette que VS Code), puis `claude remote-control` par `devcontainer exec` ; un projet sans conteneur n'a pas d'accès distant, sauf dérogation écrite |
| Carte graphique | type transverse `calcul-gpu` (`conteneur.gpu: optionnel`), adopté par un projet qui en a l'usage mesuré, d'abord le projet three.js pour ses tests de rendu ; un poste sans carte démarre le conteneur quand même. Le service de modèles partagé reste à l'idée I20 (après l'étape 4) |

**Livraisons.** Chacune sert seule ; l'ordre proposé est A, B, C, D, E.

| Livraison | Contenu | Dépend de | Critère | Modèle, effort |
|---|---|---|---|---|
| A. Démarrage sans session | point « Session au démarrage » | Q27 (résolue) | après une relance du service, aucune session n'est créée ni reprise ; l'auteur en ouvre une depuis l'application et elle répond ; une session archivée le reste | Opus 5.5, `high` (livrée ainsi) |
| B. Veille retardée | point « Veille » ; B couvre les sessions de l'hôte ; le signe de vie d'une session en conteneur se conçoit avec D | Q25 | une session distante qui travaille plus longtemps que le délai de veille ne l'interrompt pas ; sans session active, le poste se met en veille comme avant | Opus 5.5, `xhigh` |
| C. Conteneur généré | points « Clé `conteneur` » et « Génération » ; le conteneur du socle réparé d'abord | I32, Q23 | `holarch projet creer` rejoué sur `holarch-socle` écrit un `devcontainer.json` sans rien de personnel, que VS Code et `devcontainer up` ouvrent dans le même conteneur ; l'audit signale un écart à la main | Opus 5.5, `xhigh` |
| D. Accès distant dans le conteneur | point « Lieu de l'accès distant » ; l'accès sur l'hôte gardé jusqu'à ce que D tienne | C, Q24 | critère de la tranche ci-dessous | Opus 5.5, `xhigh` |
| E. Type `calcul-gpu` | point « Carte graphique » | C, Q26 | un test de rendu du projet three.js tourne dans son conteneur sur la carte, et sans carte en rendu logiciel | Opus 5.5, `high` |

**Modèle et effort.** Mesure du 2026-10-09 sur les 30 sessions du socle : Opus 5.5 seul ; effort `high` à chaque tour,
sauf une session en `medium` (2026-10-08) ; réglage du poste : `high` pour Opus 5.5, `xhigh` par défaut ; `max` jamais
employé. D'où `high` pour ce qui est court ou surtout une mesure (A, E, les essais Q23 à Q26), `xhigh` pour ce qui
touche un contrat, un autre système ou les sessions en cours (B : Windows et crochets non documentés ; C : contrat
config et audit ; D : accès distant déplacé). La contre-épreuve de chaque livraison se fait en Opus 5.5, `xhigh`, dans
une instance neuve : `max` n'a jamais servi ici et son coût n'est pas mesuré. À la frontière d'une livraison dont le
réglage n'est pas celui de la session active, la session s'arrête et le dit (règle `modele-par-etape`).

**Raison.** Une description générée depuis l'arbre donne d'un coup le partage (rien de personnel dans le dépôt), la
modularité (les types apportent leurs réglages) et l'audit. Démarrer sans session ouvre chaque demande sur un contexte
propre et rend l'archivage définitif.

**Ce qui le ferait changer.** Un essai qui montre que Remote Control ne peut pas tourner durablement dans un conteneur
(connexion, confiance, réseau) ; un collègue réel pour qui le `devcontainer.json` généré ne suffit pas ; des réponses de
l'auteur qui dépassent souvent 30 min.

**Critère de la tranche.** Après un redémarrage du poste, l'auteur ouvre depuis son téléphone une session neuve sur
`holarch-socle` : elle tourne dans le conteneur (chemin et utilisateur vérifiés), lance les tests, et ne voit ni la clé
SSH personnelle ni les conversations des autres projets ; le poste ne s'est pas mis en veille pendant qu'elle
travaillait.

**Conséquences.** Tranche 12 de l'étape 3 ; contrat config en version mineure (0.6.0, livraison C ; la 0.4.0 est prise par `veille-et-conteneur-precisions`, la 0.5.0 par `exceptions-hors-du-depot`) ; essais préalables
Q23 à Q26 avant la livraison qui les attend ; les autres projets migrés par `projet creer` rejoué, avec l'accord de
l'auteur projet par projet.

**Précision du 2026-10-09 (choix de l'auteur, sur la contre-épreuve de B).** B couvre les sessions de l'hôte. Une
session en conteneur ne se vérifie pas par son processus (le `/proc` de l'hôte ne le voit pas) et, depuis que le
conteneur ne monte plus le `~/.claude` de l'hôte, elle n'a pas les crochets du compte : son signe de vie se conçoit avec
D, qui y déplace l'accès distant. La décision modifie aussi le contrat événement (0.10.0, famille `power.*` de B) ;
`evenement.md` ajouté à ses `modifies` (accord de l'auteur, 2026-10-09), le contrat restant à approuver.

**Amendée le 2026-10-09** par [`veille-et-conteneur-precisions`](/arbre/decisions/2026-10-09-veille-et-conteneur-precisions.md)
(approuvée) : ligne B, borne d'immobilité du point « Veille », gardien qui suit la seule règle, risque résiduel jusqu'à D
et limites connues.

**Amendée le 2026-10-10** par [`exceptions-hors-du-depot`](/arbre/decisions/2026-10-10-exceptions-hors-du-depot.md)
(approuvée) : la livraison C prend la 0.6.0 du contrat de configuration.
