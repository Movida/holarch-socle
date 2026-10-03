---
type: decision
title: Coût liste calculé à la lecture, depuis une grille datée et citée
description: Où et comment le socle chiffre ce que consomment les agents, sans inventer de tarif ni réécrire le journal.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « ok pour tes recommandations »" }
links:
  derives_from: [/arbre/conception/etape-1-voir.md]
  modifies: [/arbre/conception/contrats/evenement.md]
---

# Coût liste calculé à la lecture

**Contexte.** L'étape 1 doit répondre à « qu'est-ce qui a tourné, pour combien ? ». L'import des transcriptions
Claude Code relève des tokens ; leur prix dépend du modèle, du mode (standard ou rapide) et de la durée d'écriture
du cache (cinq minutes ou une heure, la seconde facturée 1,6 fois la première). La première version de l'import
additionnait les deux durées de cache : le coût calculé dessus aurait été sous-estimé.

**Décision.**

| Point | Choix |
|---|---|
| Où se calcule le coût | à la construction de l'index, depuis les tokens du journal et la grille de la configuration ; l'événement ne porte `usd_list` que si son émetteur connaît le coût |
| Grille | dans la configuration du site (`tarifs : {source, releve, modeles}`), relevée sur la page officielle du fournisseur, datée et citée ; jamais un tarif de mémoire ; sans tarif pour un modèle, le coût reste inconnu et l'interface dit que le total est partiel |
| Cache | `tokens.cache_write_1h`, part de `cache_write` écrite pour une heure ; le calcul est linéaire, donc les sommes font foi |
| Historique | le journal reste en ajout seul : un fichier lu par une version antérieure de l'import est relu une fois, et l'écart des cumuls devient un événement `cost.recorded` complémentaire |
| Mode rapide | ses tokens se comptent sous `<modèle>:rapide`, qui a sa propre ligne de grille |

**Conséquences.** Contrat événement 0.3.0 (ajout compatible). Corriger ou mettre à jour la grille rechiffre tout
l'historique sans rien réécrire. Ce qui manque encore : une grille **versionnée par date** le jour où un tarif change,
pour que l'historique garde le prix de son époque ; la majoration de résidence des données (`inference_geo: "us"`,
×1,1), absente des transcriptions observées ; les modèles servis par un autre fournisseur, sans tarif.
