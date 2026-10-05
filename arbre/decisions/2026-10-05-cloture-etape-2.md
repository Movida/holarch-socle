---
type: decision
title: Clore l'étape 2 sur l'usage au travail ; le critère de l'étape 1 n'est plus une porte
description: L'étape 2 se clôt, sa passerelle servant au quotidien au travail ; le retour sur le critère de l'étape 1 le garde mesuré sans en faire une condition, l'usage attendu de l'interface étant le suivi des projets.
status: stable
approved: { by: human:auteur, at: 2026-10-05, ref: "échange du 2026-10-05, « pas besoin d'attendre plusieurs jours d'utilisation de la passerelle ; celle-ci fonctionne bien » puis « les indicateurs sont intéressants et j'irai y faire un tour de temps en temps, mais ce qui m'intéressera le plus ce sera le suivi des différents projets »" }
links:
  derives_from: [/arbre/conception/etape-2-point-entree.md, /arbre/decisions/2026-10-03-cloture-etape-1.md]
  modifies: [/arbre/decisions/2026-10-03-cloture-etape-1.md]
---

# Clore l'étape 2 sur l'usage au travail ; le critère de l'étape 1 n'est plus une porte

**Contexte.** L'étape 2 a livré ce que sa spécification prévoyait. Son critère d'usage est fixé par lieu
(décision `forme-etape-2`) : au travail, Desktop et Claude Code passent par le hub au quotidien ; ici, les agents
interrogent le serveur HOLARCH plutôt que de fouiller. La décision `cloture-etape-1` demande en outre de revenir sur le
critère de l'étape 1 (« l'auteur ouvre l'interface plutôt que de demander ») au plus tard à cette clôture, chiffres à
l'appui.

**Chiffres relevés le 2026-10-05 sur le poste personnel.**

| Mesure | Valeur |
|---|---|
| Pages consultées (`ui.viewed`) | 17, toutes le 2026-10-03, pendant la construction de l'interface ; chaque page au moins une fois (tableau de bord 6, catalogue 4, sessions, journal et arbre 2 chacune) |
| Appels au serveur HOLARCH par les agents | aucun trouvé dans les transcriptions |

Ces chiffres mesurent surtout un défaut de branchement : le serveur HOLARCH n'est déclaré qu'au projet du socle
(`.mcp.json`), donc invisible des sessions ouvertes ailleurs ; l'index du site n'est plus rafraîchi depuis le
2026-10-03 (aucun import périodique, contrairement au site de travail) ; hors conteneur, `HOLARCH_HOME` n'est pas
défini et une commande lancée sur l'hôte écrit dans le répertoire par défaut au lieu des données du site.

**Décision (de l'auteur).**

| Point | Choix |
|---|---|
| Étape 2 | close : au travail, la passerelle sert au quotidien et fonctionne bien, constat de l'auteur, sans période d'observation supplémentaire |
| Critère « ici » de l'étape 2 | reste ouvert, mesuré par les appels `mcp__holarch__*` ; il ne peut être tenu qu'une fois le serveur branché pour toutes les sessions du site et l'index rafraîchi |
| Critère de l'étape 1 | n'est plus une condition d'ouverture : les indicateurs servent, consultés de temps en temps ; `ui.viewed` continue de les mesurer ; aucune page retirée |
| Usage attendu de l'interface | le **suivi des projets** ; l'interface évolue avec la conception, et cette vue vient avec les projets comme nœuds de l'arbre (étape 3, §5.8 et §7 « Arborescence ») ; ce qu'elle montre est à préciser (Q14) |

**Conséquences.** L'étape 3 peut s'ouvrir. La règle n° 7 de la décision fondatrice reste la règle par défaut ;
comme `cloture-etape-1`, cette décision n'en dispense que l'étape qu'elle clôt.
