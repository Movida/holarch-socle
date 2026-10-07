---
type: decision
title: Les échecs au journal, comptés
description: Les erreurs d'outil, les tests rouges et les refus de la garde avant commit deviennent des événements, sans leur contenu, comptés par motif au tableau de bord et sur la carte d'un projet ; les refus de permission non reconnus rejoignent `tool.denied`.
status: stable
approved: { by: human:auteur, at: 2026-10-07, ref: "choix cliquable du 2026-10-07 : « Approuver telle quelle », refus non reconnus en origine `approbation`, leçons avec la récolte" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-03-refus.md, /arbre/decisions/2026-10-07-controles-de-regles.md]
  modifies: [/arbre/conception/contrats/evenement.md, /arbre/decisions/2026-10-03-refus.md]
---

# Les échecs au journal, comptés

**Contexte (mesuré le 2026-10-07 sur le poste personnel, transcriptions des 30 derniers jours, 324 sessions
principales, 24 714 appels d'outil).** Le journal ne voit d'un échec que le refus reconnu (`tool.denied`) et l'appel
MCP en erreur. Restent invisibles :

- 383 sorties non nulles de commandes shell, et une centaine d'autres erreurs d'outil (édition sur un fichier modifié
  depuis sa lecture, chaîne introuvable, fichier absent…) ;
- 338 refus de permission dont le message n'est pas dans la liste de la décision `refus` (« This Bash command contains
  multiple operations… », « Contains simple_expansion », « This command requires approval »…), et 94 blocages par les
  crochets du projet antérieur ;
- les tests rouges : dans le socle, 183 lancements de `npm test`, dont 24 rouges ; **22 de ces 24 sortent en code 0**,
  la commande passant par un tube (`npm test 2>&1 | tail`) : le code de sortie seul les manque ;
- les refus de la garde avant commit : écrits sur la sortie d'erreur de git, jamais au journal (28 mentions dans
  5 sessions du socle, essais compris).

**Avis.** Tout cela se lit déjà dans les transcriptions et dans la garde : pas d'enveloppe autour des commandes (P2),
pas d'habitude à changer. La limite est celle de la décision `refus` : jamais le contenu, un motif tiré d'une liste
fixe. Un test rouge se reconnaît à la fois au code de sortie et au résumé du lanceur. La leçon de clôture, elle, n'est
pas un fait qui se lit : c'est un texte de l'agent, qui demanderait un outil d'écriture et un contenu au journal.

**Décision.**

| Point | Choix |
|---|---|
| Erreur d'outil | `tool.failed` : un résultat d'outil en erreur qui n'est pas un refus ; `data` : `outil`, `motif` (liste fixe : `sortie`, `edition-perimee`, `edition-introuvable`, `edition-ambigue`, `edition-non-lue`, `fichier-absent`, `validation`, `delai`, `autre`), pour une commande shell `code` (code de sortie) et `programme` (nom du premier programme de la commande, sans chemin ni argument) ; jamais la commande, le chemin ni la sortie |
| Test rouge | une commande de test reconnue (`npm test`, `npm run test…`, `node --test`, et leurs équivalents `pnpm`, `yarn`) est rouge si sa sortie est non nulle **ou** si le résumé du lanceur compte un échec (`# fail N`, `ℹ fail N`, N > 0) : `tool.failed`, motif `tests` ; `session.finished` porte `tests: {lances, rouges}` pour un taux |
| Refus de garde | `holarch garde avant-commit` écrit `rule.enforced` à chaque refus : `{regle, controle, n, moment}` ; jamais le contenu trouvé ; le résultat d'outil de l'agent qui l'a reçu est un `tool.failed` de motif `garde`, que les comptes n'ajoutent pas une seconde fois |
| Refus non reconnus | la liste de la décision `refus` s'étend aux messages des demandes d'approbation, origine `approbation`, et aux blocages de crochet au format `[…] …` du projet antérieur, origine `hook` ; un message nouveau reste un `tool.failed` de motif `autre`, visible, plus jamais absent |
| Comptes | au tableau de bord, à côté des refus : échecs sur 7 et 30 jours par famille et motif, programmes et outils les plus touchés ; sur la carte d'un projet, ses échecs sur 7 jours ; classés par nombre, sans seuil de répétition (aucun réglage à deviner) ; outil MCP `journal` : familles `tool` et `rule` déjà servies |
| Reprise de l'historique | la version de l'état d'import passe à 6 : chaque transcription est relue une fois, ses `tool.failed` et ses comptes de tests s'ajoutent en complément, comme aux versions précédentes |
| Leçon de clôture | hors de cette décision : à reprendre avec la récolte, où un texte d'agent devient une proposition |

**Raison.** Compter avant de chercher des solutions : un échec qui se répète ne se voit qu'au compte, et le compte ne
coûte qu'une lecture déjà faite.

**Ce qui le ferait changer.** Un lanceur de tests au résumé d'une autre forme (pytest, cargo) dans un projet déclaré :
son motif s'ajoute à la liste ; un besoin de rattacher un échec à sa correction (la récolte).

**Conséquences.** Contrat événement 0.9.0 (`tool.failed`, `rule.enforced`, `data.tests` de la fin de session, origine
`approbation`) ; tranche 9 de l'étape 3.
