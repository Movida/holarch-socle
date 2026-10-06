---
okf_version: "0.2"
type: guideline
title: HOLARCH — ligne directrice
description: Un socle autour des runtimes d'agents d'IA, qui embarque les règles, rend tout visible, conserve et vérifie le savoir, et se régule.
status: draft
---

# HOLARCH — ligne directrice

Racine de l'arbre du système, écrit avec sa propre méthode. Tout nœud ci-dessous dérive de celui-ci.

- [`fondations/manifeste.md`](fondations/manifeste.md) - pourquoi HOLARCH existe et ce qu'il doit être
- [`fondations/principes.md`](fondations/principes.md) - les principes qui contraignent toute conception
- [`besoins/besoins-fondateurs.md`](besoins/besoins-fondateurs.md) - les quatre besoins d'où part le système
- [`conception/types.md`](conception/types.md) - le registre des types de nœuds
- [`conception/contrats/index.md`](conception/contrats/index.md) - les contrats : nœud, règle, fiche du catalogue, événement du journal
- [`conception/etape-1-voir.md`](conception/etape-1-voir.md) - étape 1 : catalogue, journal et interface en lecture (close)
- [`conception/etape-2-point-entree.md`](conception/etape-2-point-entree.md) - étape 2 : serveur MCP de HOLARCH, appels MCP au journal, hub de fédération
- [`conception/etape-3-regles-projets.md`](conception/etape-3-regles-projets.md) - étape 3 : accès distant par projet, vue Projets, puis règles et création de projet
- [`conception/essai-agentgateway.md`](conception/essai-agentgateway.md) - ce que l'essai d'agentgateway a montré, ce qui reste à essayer sur l'hôte
- [`conception/procedure-essai-hote.md`](conception/procedure-essai-hote.md) - mode opératoire de l'essai du hub sur l'hôte, pour une session d'agent
- [`conception/procedure-site-travail.md`](conception/procedure-site-travail.md) - mode opératoire du site de travail et de sa passerelle protégée, pour une session d'agent
- [`conception/essai-site-travail.md`](conception/essai-site-travail.md) - ce que la mise en place du site de travail a montré : ce qui a tenu, les difficultés, les pistes
- [`decisions/2026-10-03-fondation.md`](decisions/2026-10-03-fondation.md) - les décisions fondatrices
- [`decisions/2026-10-03-synchronisation.md`](decisions/2026-10-03-synchronisation.md) - ce qui se synchronise entre local et serveur, et qui fait foi
- [`decisions/2026-10-03-cout-liste.md`](decisions/2026-10-03-cout-liste.md) - le coût liste, calculé à la lecture depuis une grille datée et citée
- [`decisions/2026-10-03-classification.md`](decisions/2026-10-03-classification.md) - une classification ne peut que se durcir en descendant
- [`decisions/2026-10-03-sources-hote.md`](decisions/2026-10-03-sources-hote.md) - Docker et Claude Desktop lus par des interfaces standard, en lecture seule
- [`decisions/2026-10-03-refus.md`](decisions/2026-10-03-refus.md) - les refus d'outil au journal, avec leur origine et sans leur contenu
- [`decisions/2026-10-03-identite-projets.md`](decisions/2026-10-03-identite-projets.md) - un projet garde son identité quand il change de place
- [`decisions/2026-10-03-interface-pico.md`](decisions/2026-10-03-interface-pico.md) - l'interface s'appuie sur Pico CSS, servi en local
- [`decisions/2026-10-03-cloture-etape-1.md`](decisions/2026-10-03-cloture-etape-1.md) - l'étape 1 close sur sa livraison, son critère mesuré en continu
- [`decisions/2026-10-03-forme-etape-2.md`](decisions/2026-10-03-forme-etape-2.md) - l'étape 2 découpée selon le lieu où chaque partie sert
- [`decisions/2026-10-03-passerelle-par-site.md`](decisions/2026-10-03-passerelle-par-site.md) - une passerelle protégée là où il y a à fédérer, HOLARCH en direct ailleurs
- [`decisions/2026-10-05-cloture-etape-2.md`](decisions/2026-10-05-cloture-etape-2.md) - l'étape 2 close sur l'usage au travail ; l'interface attendue pour le suivi des projets
- [`decisions/2026-10-05-rattachement-projet.md`](decisions/2026-10-05-rattachement-projet.md) - tout se rattache au projet par son identifiant ; le dépôt en est le support
- [`decisions/2026-10-06-arbre-des-regles.md`](decisions/2026-10-06-arbre-des-regles.md) - un arbre des règles pour tous les projets, réparti entre dépôts
- [`questions.md`](questions.md) - les questions ouvertes
- [`log.md`](log.md) - le journal de l'arbre
