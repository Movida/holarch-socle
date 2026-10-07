---
type: decision
title: Créer un projet par une commande aux étapes rejouables
description: Tranche 10 de l'étape 3. `holarch projet creer` déroule les étapes de mise en place d'un projet, portées par son contexte et ses types, rejouables sans risque ; ce que l'agent ne peut pas faire sort en gestes réservés, avec la commande ou le lien prêts ; l'audit vérifie le résultat.
status: stable
approved: { by: human:auteur, at: 2026-10-07, ref: "échange du 2026-10-07 : « J'approuve telle quelle, pousse tout »" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/conception/contrats/config.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-07-identite-par-contexte.md]
---

# Créer un projet par une commande aux étapes rejouables

**Contexte (mesuré le 2026-10-07 sur les 9 dépôts du poste et les transcriptions depuis le 2026-09-06).** Environ un
projet par semaine (6 du 2026-08-30 au 2026-10-06). Ce qui revient : dépôt GitHub (9 sur 9, privé sauf 3 publics, seuls à
porter une licence), README (8), CLAUDE.md (8), `.gitignore` (7), conteneur de développement (6, avec un `deploy-key.sh`
recopié d'un projet à l'autre), clé de déploiement (5). Oublis rattrapés plus tard : clé de déploiement (+1 à +133 j),
dépôt distant (+6 et +34 j), CI (+60 j), CLAUDE.md (+1 à +28 j), identité de commit (+14 j). Tout ce qui relève de
HOLARCH (déclaration au contexte, identité, règles, crochet) a été posé après coup, jusqu'à 158 j plus tard ; quatre
projets ne sont toujours pas déclarés, huit sur neuf n'ont pas d'accès distant par projet. L'auteur a demandé trois fois
« un projet qui ait tout pour travailler », et une fois si la création couvrait « tous les éléments fastidieux ». Gestes
que seul l'auteur fait : enregistrer une clé de déploiement sur GitHub, créer un dépôt dans le navigateur quand la
session n'a qu'une clé de déploiement, se connecter à `gh`, rouvrir dans le conteneur, accepter la confiance de Claude
Code, approuver.

**Avis.** Deux voies :

| Voie | Pour | Contre |
|---|---|---|
| Une commande `holarch projet creer` aux étapes idempotentes, que l'agent lance | déterministe, rejouable, la même pour l'agent, la ligne de commande et plus tard l'interface (I22) ; reprend ce qui existe (`gh`, `identite-git.js`, `regles appliquer`, `distant activer`, l'audit) | à écrire et à tenir |
| Un skill « initialise le projet » (consignes pour l'agent) | rien à coder | refait à chaque fois, autrement ; pas d'idempotence ; c'est ce qui se faisait, et les oublis ci-dessus en viennent |

La première est recommandée ; le choix « commande d'abord » est de l'auteur (2026-10-07).

**Décision.**

| Point | Choix |
|---|---|
| Commande | `holarch projet creer <nom> --contexte <c> [--type <t>…]` ; rejouée sur un projet existant, elle fait ce qui manque et rien d'autre (c'est aussi le chemin de migration des quatre projets non déclarés) |
| Étapes | 1. dépôt local, branche `main` ; 2. fichiers de base : README, `.gitignore`, CLAUDE.md (consignes générées), licence si le type `depot-public` s'applique ; 3. déclaration au contexte dans le profil (commit dans le profil) ; 4. identité, règles, crochet (`regles appliquer`) ; 5. dépôt GitHub par `gh`, visibilité d'après les types ; 6. conteneur de développement et clé de déploiement, d'après le modèle existant ; 7. accès distant (`distant activer`) ; 8. arbre, si le type `methode-holarch` s'applique |
| Configuration | clé `creation` au registre de configuration (contrat config, version mineure) : étapes actives et valeurs (visibilité, licence, conteneur oui ou non), portée par le profil, le contexte et les types, fusionnée comme les autres clés |
| Gestes réservés | une étape impossible (pas de `gh` connecté, clé à enregistrer) ne bloque pas les suivantes : elle sort en geste réservé, avec la commande ou le lien prêts, et la commande rejouée la reprend ; ils iront dans la boîte de décisions quand elle existera (I23) |
| Vérification | à la fin, l'audit du projet ; aucun écart attendu hors gestes réservés en attente |

**Raison.** Les oublis mesurés viennent d'étapes refaites à la main ; une commande rejouable les fait une fois pour
toutes et sert aussi aux projets existants.

**Ce qui le ferait changer.** Un projet créé par la commande qui demande encore une corvée hors gestes réservés (étape à
ajouter), ou des étapes que l'auteur désactive presque toujours.

**Critère de la tranche.** Le prochain vrai projet est créé par la commande : seuls les gestes réservés restent à la
main, et l'audit du jour est sans écart.

**Conséquences.** Tranche 10 de l'étape 3 ; contrat config en version mineure ; les quatre projets non déclarés
migrés par la commande, avec l'accord de l'auteur projet par projet.
