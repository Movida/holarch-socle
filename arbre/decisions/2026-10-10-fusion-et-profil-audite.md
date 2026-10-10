---
type: decision
title: "Corrections de la contre-épreuve du profil désigné : forme gardée, conteneurs du profil audités, projet disparu dit"
description: Après la contre-épreuve de profil-designe. Une valeur posée plus bas ne remplace ni un objet ni une liste ; l'audit du compte lit les conteneurs du dépôt du profil ; un projet déclaré, déjà vu sur le site et absent du catalogue, est un écart du compte ; la portée des exceptions LICENSE et NOTICE reste celle du contexte.
status: stable
approved: { by: human:auteur, at: 2026-10-10, ref: "échange du 2026-10-10, quatre choix cliquables (fusion, LICENSE, audit du profil, identifiant), recommandations suivies" }
links:
  derives_from: [/arbre/decisions/2026-10-10-profil-designe.md, /arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/conception/contrats/config.md, /arbre/decisions/2026-10-10-profil-designe.md, /arbre/decisions/2026-10-09-environnement-d-execution.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Corrections de la contre-épreuve du profil désigné

**Contexte (2026-10-10).** La contre-épreuve de `profil-designe` (rapport : `holarch rapport afa38cbdf67d34b25`) a
reproduit cinq majeurs, relus dans le code. Trois se corrigent sans choix : le code rejoint le contrat (identifiants
comparés dans leur forme normalisée, (1) ; un champ de forme invalide rend la règle effective incomplète au lieu
d'arrêter la garde et l'audit, (3)). Trois demandaient un choix, et un mineur, (6), aussi :

- (2) `fusionnerConfig` laisse une valeur simple ou `null` posée plus bas l'emporter sur un objet ou une liste :
  `donnees_personnelles: null` ou `termes: ""` à la racine d'un projet vident la liste privée, `identite: null` rend le
  contrôle d'identité non disponible ; la garde laisse passer le commit ;
- (4) le dépôt du profil n'est jamais audité (cibles : projets déclarés, typés ou à règles) : son propre conteneur, cas
  du pas 4 de `profil-designe`, ne se dit qu'avec `--projet` ;
- (5) l'identifiant d'un projet est son plus ancien commit racine : un commit racine plus ancien, fusionné, le change,
  et la déclaration du contexte ne vise plus rien, sans signal ;
- (6) déplacées au contexte, les exceptions `LICENSE` et `NOTICE` valent pour 7 projets sur 8 (2 avant).

**Mesures sur le poste (2026-10-10).** Aucune couche des 8 projets ne pose une valeur d'une autre forme sur un objet ou
une liste. Deux projets ont une `LICENSE` ou un `NOTICE` : un public, et un privé dont le `NOTICE` porte le titulaire du
droit d'auteur (deux occurrences d'un terme privé, soustraites). Les 6 projets déclarés sont au catalogue ; le journal
garde la création, le retrait et le déplacement des projets (24 événements).

| Point | Texte |
|---|---|
| Fusion des réglages (2) | une valeur posée plus bas ne remplace ni un objet ni une liste d'une couche plus haute : celle d'en haut l'emporte, et la règle effective le dit. Lever une règle passe par une dérogation, tracée |
| Exceptions `LICENSE` et `NOTICE` (6) | portée du contexte gardée, écrite comme limite : un fichier de ce nom écrit par un conteneur dans un autre projet privé échappe au contrôle des données personnelles |
| Dépôt du profil (4) | l'audit du compte lit les configurations de conteneur du dépôt du profil (contrôle `montage-sensible` seul) ; le profil n'est pas audité comme un projet : il porte la liste privée par construction |
| Projet déclaré disparu (5) | écart du compte quand un projet déclaré a été vu sur ce site (journal) et n'est plus au catalogue ; un projet déclaré jamais vu sur ce site (cloné ailleurs) ne dit rien |
| Contrat de configuration | 0.7.0 : la fusion le dit ; la livraison C passe à la 0.8.0 |

**Choix de l'auteur (2026-10-10, choix cliquables) : les recommandations.**

1. Fusion : forme gardée. Autre voie écartée : `termes` lus couche par couche, qui laissait `identite: null` couper le
   contrôle d'identité.
2. `LICENSE` et `NOTICE` : garder. Autre voie écartée : une exception par type portée par le profil (un champ de plus
   au contrat ; le `NOTICE` du projet privé redevenait un écart, à lever par un autre champ).
3. Dépôt du profil : ses conteneurs au compte. Autre voie écartée : auditer tout projet du catalogue, profil compris,
   où le contrôle des données personnelles se heurterait à la liste privée.
4. Identifiant changé : projet connu disparu. Autre voie écartée : tout identifiant déclaré absent du catalogue, qui
   signalait à tort un projet non cloné sur ce site.

**Ce qui le ferait changer.** Un réglage qu'une couche plus basse doit pouvoir retirer (aujourd'hui, aucun : une
dérogation lève une règle) ; un projet privé qui reçoit une `LICENSE` d'un conteneur ; un dépôt de profil qui devient
un projet à part entière.

**Conséquences.** Le code, un commit et un test chacun, dans l'ordre 2, 1, 3, 4, 5 ; le contrat de configuration en
0.7.0 avec la correction (2) ; la livraison C renvoyée à la 0.8.0 (`environnement-d-execution`) ; la limite (6) dans
`profil-designe`.
