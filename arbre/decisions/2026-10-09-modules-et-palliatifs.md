---
type: decision
title: Un cœur sans plateforme, des modules optionnels et le profil ; un palliatif par faiblesse relevée
description: Suite de la revue page blanche. Chaque faiblesse relevée par l'avis du 2026-10-09 reçoit un palliatif ; toutes les fonctionnalités voulues sont gardées, chacune dans le cœur, un module optionnel ou le profil.
status: draft
links:
  derives_from: [/arbre/decisions/2026-10-08-revue-page-blanche.md]
  modifies: [/docs/architecture.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Un cœur sans plateforme, des modules optionnels et le profil ; un palliatif par faiblesse relevée

**Contexte (2026-10-09).** Avis demandé par l'auteur sur les fonctionnalités et la conception : trois relectures en
lecture seule (code, fonctionnalités, trajectoire) et les mesures du site sur 7 jours. 40 des 52 sessions dans le socle,
41 % du coût liste ; le projet privé le plus coûteux 53 %, sans arbre ; 86 % du coût vient du contexte. Aucune étape
close sur son critère d'usage ; 18 décisions sur 27 approuvées d'une formule globale ; une règle `stable` s'applique sans `approved`
(`src/regles.js:80`) ; contrat événement passé en 0.10.0 sous l'approbation du 2026-10-03 ; `~/.claude` de l'hôte
monté en écriture par le modèle de conteneur (`modeles/projet/devcontainer.json:16`). L'auteur garde toutes les
fonctionnalités voulues : la question est leur place.

**Avis.** Trois couches. Le **cœur** (contrats, catalogue, journal, arbre des règles, moteurs d'audit, de récolte et de
création) ne dépend d'aucune plateforme et n'importe aucun module. Un **module**, optionnel, vit dans un dossier du socle
avec un contrat court : ce qu'il garantit, ses plateformes, ce qu'il requiert, ce qu'il apporte (commandes, contrôles,
sources d'inventaire, familles d'événements, vues, outils MCP, services), ses réglages et leur mesure ; il s'inscrit aux
points d'extension du cœur, et absent il est « non disponible ». Le **profil** dit quels modules sont actifs et porte
les valeurs personnelles. La part qui parle à Claude Code peut aussi s'empaqueter en plugin ; les règles toujours
chargées restent écrites par HOLARCH (un plugin ne les porte pas). Seuls les modules dont le code existe se découpent ;
les autres naissent avec leur phase. Autre voie : un dépôt par module, écartée pour l'instant (autant de dépôts, de
versions et d'intégrations à tenir seul).

**Palliatifs** (faiblesse → palliatif) :
1. Socle validé sur lui-même → un projet témoin reçoit chaque nouveauté avant qu'elle soit dite faite ; B1 et B2 se
   mesurent hors du socle.
2. Portes cédées, revue sans retour → « livrée » distinct de « validée », critère mesuré par une routine (I14) ; règle
   de retour de la revue, niveau vérifié, sur les signaux déjà mesurés (tranches ouvertes, correctifs répétés sur un
   module, choix de revue en retard) : contrôle `revue-due`.
3. Outillage du poste dans le cœur → modules `acces-distant`, `veille`, `service`, un adaptateur par plateforme ; test :
   le cœur n'importe aucun module, aucun cycle.
4. Plus de texte que l'auteur n'en relit → budget de lecture réglé par le type `methode-holarch` (une ligne par
   tranche, décision courte, résumé en tête), le reste archivé hors reprise ; une décision, un choix cliquable (I2).
5. Approbations non tenues par le code → garde avant commit : pas de `stable` sans `approved` ; approbation liée à une
   version, un texte modifié après approbation redevient un brouillon posé sur la version approuvée, qui tient ; `ref`
   désigne une session et un message, vérifiés par l'import ; schémas nœud, règle, config, sans défaut silencieux.
6. P6 sans mécanisme → un contexte, un compte ou un répertoire de configuration ; `context` rempli sur chaque
   événement ; récolte par contexte, modèles permis selon la classification ; le hub reste un module.
7. `~/.claude` monté en écriture → volume nommé `{{volume}}-claude` et `CLAUDE_CONFIG_DIR` ; de `~/.claude`, seulement
   le dossier de transcriptions du projet (209 sessions sur 305 en 30 jours tournent en conteneur, HOLARCH les importe)
   et les règles du compte en lecture ; `HOLARCH_HOME` jamais monté en écriture ; contrôle `montage-sensible` et règle
   `conteneur-isole` en brouillon (faits le 2026-10-09).
8. Format interne des transcriptions → un seul lecteur au lieu de cinq, échantillons par version, format inconnu en
   `system.degraded` ; module OpenTelemetry optionnel en seconde source.
9. Couches mêlées → le registre du point 3 ; `socle.js` réduit au câblage.
10. Données sans verrou → un seul écrivain (le service), index incrémental, pas d'inventaire complet au démarrage d'une
    session.
11. API de l'interface sans authentification → clé dans un fichier (mécanique de `pont --cle`), exigée avant toute
    écriture.
12. Documents désynchronisés, pas d'intégration continue → README et `index.md` générés (§5.10), contrôle I31 dans
    `npm test`, GitHub Actions, `/tmp` nettoyé par les tests.

**Fonctionnalités prévues, toutes gardées** (module, puis quand) : exécution, plafonds, contre-épreuve → `execution`,
adaptateur mince sur `claude -p` et les workflows (étape 4) ; boîte de décisions, I10, I22, I23, I33 → `interface`
(après le point 11) ; I4, I5, I7, I9, I21, I25, I27, I30 et le rêve → `regulation` (étape 5, boîte en place) ; savoir →
`savoir`, adaptateur du serveur OKF existant (étape 6) ; hub, connecteurs, routage → `hub` (un site qui fédère) ; synchronisation →
`synchro` (un second site permanent) ; rôles → `partage` (une seconde personne) ; I20, Q26 → `modeles-locaux` (part
des tâches étroites mesurée) ; I8 → type `charte-ui` (premier usage sur le témoin) ; I11 → style de sortie du profil
(une redite de forme) ; I1, I2, I6, I17, I19, I24, I26 → réglages du cœur ; arrêt d'urgence → interrupteur du cœur.

**Choix de l'auteur (2026-10-09, choix cliquables).** Modules dans le dépôt du socle ; projet témoin : le projet privé
le plus coûteux ; ordre : faille du conteneur, garde des approbations et schémas, témoin, découpage en modules.

**Ce qui le ferait changer.** Un module voulu seul par quelqu'un d'autre (il sort en dépôt) ; une mesure sur le témoin
qui ne montre ni moins de redites ni moins de contexte par tour.

**Conséquences.** À l'approbation : contrat « module » à écrire (règle `contrats-produit`) ; §4, §7 et §10 de
l'architecture alignés ; règle de retour de la revue écrite. Signalé, non corrigé ici : `index.md` ne liste pas les
décisions du 7 au 9 octobre, le README garde le statut de l'étape 2.
