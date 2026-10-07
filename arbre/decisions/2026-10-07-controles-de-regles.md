---
type: decision
title: Des contrôles pour les règles, posés là où le runtime arrête déjà
description: Une règle peut désigner un contrôle du socle ; le blocage passe par le crochet de git et les permissions de Claude Code, la détection des secrets par gitleaks ; les écarts vont au journal.
status: stable
approved: { by: human:auteur, at: 2026-10-07, ref: "échange du 2026-10-07, quatre choix cliquables sur avis (liste privée, blocage, secrets, écarts)" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/conception/contrats/regle.md, /arbre/conception/contrats/evenement.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md, /arbre/decisions/2026-10-03-classification.md]
---

# Des contrôles pour les règles, posés là où le runtime arrête déjà

**Contexte.** Les 21 règles appliquées le 2026-10-07 sont toutes des rappels : lues à chaque tour, jamais vérifiées.
Les niveaux `blocking` et `verified` du contrat règle n'ont pas encore de mécanisme. Deux règles ne tolèrent pas
l'oubli (`rien-de-personnel`, `secrets-hors-contexte`) et une se vérifie sans peine après coup (`journal-du-projet`).
Aucun outil de détection de secrets n'est installé sur le poste personnel.

**Avis.** Une règle reste une donnée ; ce qui la contrôle est du code du socle, désigné par un identifiant, pas une
commande écrite dans l'arbre (une commande venue d'un arbre s'exécuterait sur la machine sans revue). Le blocage se
pose dans le mécanisme que le runtime concerné possède déjà (P2) : un commit s'arrête dans git, quel que soit celui qui
commite ; une lecture de fichier s'arrête dans les permissions de Claude Code.

**Décision.**

| Point | Choix |
|---|---|
| Contrôle | une règle porte `check: [<id>]`, des contrôles du registre du socle ; le niveau dit quand ils s'exécutent : `blocking` avant l'action (et à l'audit, pour ce qui serait passé outre), `verified` à l'audit seulement |
| Liste des données personnelles | **déduite** (identité git, dossier personnel, comptes Claude Code, noms des projets non publics) **et complétée** par un réglage du profil privé ; elle ne s'écrit jamais dans un dépôt, un événement ou une sortie au-dessus de sa classification |
| Blocage d'un commit | crochet `pre-commit` de git posé par projet par `holarch regles appliquer` (fichier marqué, local au clone, jamais versionné) ; il arrête Claude Code, les autres agents et l'humain |
| Lecture des secrets | permissions natives de Claude Code (`permissions.deny`) à la portée de la règle ; HOLARCH ne retire que les entrées qu'il a posées |
| Détection des secrets | **gitleaks**, installé sur le site ; absent, le contrôle se dit « non disponible », jamais vert |
| Écarts | l'audit suit chaque inventaire ; un écart apparu s'écrit `rule.violated`, un écart disparu `rule.resolved` (verbe ajouté) ; l'événement nomme la règle, le contrôle, le fichier et la ligne, jamais le contenu trouvé |

**Raison.** Un crochet de git couvre tous ceux qui commitent, sans hook propre à chaque agent. Un détecteur de secrets
maison serait moins bon que l'outil de référence et coûterait à tenir. Une liste déduite ne demande presque rien à
tenir à jour, et le profil comble ce que la machine ne sait pas. Le journal des écarts donne l'historique dont le
critère de l'étape a besoin (« pendant un mois »).

**Ce qui le ferait changer.** Un agent qui commite sans passer par git local (API distante) : contrôle côté serveur.
Un faux positif répété de la liste déduite : un terme se retire par le profil, avec sa raison.

**Conséquences.** Contrat règle 0.3.0 (`check`) ; contrat événement 0.8.0 (`rule.resolved`, données d'un écart) ;
tranche 4 de l'étape 3, `conception/etape-3-regles-projets.md`.
