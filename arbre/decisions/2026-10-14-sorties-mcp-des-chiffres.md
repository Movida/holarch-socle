---
type: decision
title: Sorties MCP des chiffres
description: "Champs ajoutés aux lectures communes du socle (interface et serveur MCP) pour quatre chiffres de la revue des limites : projets retirés, état du dépôt lu en direct, deux comptes de tours, appels MCP de statut inconnu. Un champ s'ajoute, aucun ne se renomme."
status: draft
links:
  derives_from: [/arbre/conception/revue-limites.md, /arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/conception/contrats/evenement.md]
  constrained_by: [/arbre/decisions/2026-10-03-forme-etape-2.md, /arbre/decisions/2026-10-05-rattachement-projet.md, /arbre/decisions/2026-10-07-passation-sereine.md]
---

# Sorties MCP des chiffres

**Contexte (2026-10-14, famille Chiffres de la revue des limites, lot 2).** Aucun contrat ne décrit la sortie des outils
MCP : `forme-etape-2` dit « en lecture » et « les mêmes lectures que l'interface », et les deux passent par les mêmes
fonctions du socle (`src/mcp/serveur.js`, `src/web/serveur.js`). Quatre chiffres du lot 2 demandent un champ de plus :

- V1 : les projets retirés du catalogue sortent de `projets()` (2 projets, 222,06 $ et 21 sessions sur 182 en 30 jours,
  comptés nulle part) ; ailleurs, ils s'affichent par leur identifiant brut (`nom: null`). `element.retired` porte
  `data: {}`, et le catalogue ne garde pas la fiche précédente : aucun nom à en tirer.
- V2 : l'état du dépôt (`technique`, `projets_sales`) est celui du dernier inventaire dans l'interface et le MCP, et lu
  en direct dans la reprise (4 projets sur 10 différaient ; 24 ms par projet en direct). Choix de l'auteur : en direct
  partout.
- V3 : « Tours » compte la session seule dans la colonne de l'interface (`data.tours`), les sous-agents compris dans le
  MCP, le coût par tour et la mesure de `passation-sereine` (`tours_total`) ; 72 sessions sur 182 diffèrent.
- Ligne 239 a : un appel MCP de statut inconnu (`null` : passerelle, ou appel sans résultat) entre dans le total sans
  entrer dans les échecs (`periode.mcp[{cle, n, echecs}]`). 0 sur ce poste.

Lecteurs mesurés : aucun skill, crochet ni document ne lit un champ MCP ; 30 appels en 30 jours, tous par des agents en
session (`consommation` 12, `projets` 8, `etat` 7, `regles` 3).

**Avis.**

| Voie | Pour | Contre |
|---|---|---|
| Ajouter des champs, ne rien renommer ni retirer ; chaque ajout écrit dans la spécification de l'étape | les noms qu'un agent a déjà vus restent vrais ; aucun lecteur programmé à tenir | la forme des sorties reste sans contrat ni schéma |
| Un contrat « sorties de lecture » versionné, avec schémas | un changement de forme se verrait au test | coût moyen (neuf outils, six routes) pour aucun lecteur programmé |
| Renommer pour la clarté (`tours` en `tours_total`) | un seul nom par chose dans tout le code | casse ce qu'un agent a appris d'une session à l'autre, sans gain mesuré |

La première est recommandée.

**Décision.**

| Point | Choix |
|---|---|
| Règle des sorties | Un champ s'ajoute aux lectures communes (interface et MCP), aucun ne se renomme ni ne se retire sans décision. L'ajout s'écrit dans la spécification de l'étape. |
| V1, projets retirés | `projets()` rend `retires` : `{ activite, projets: [{ id, nom, retire_le }] }` (`activite` de même forme que `hors_projet`), et la vue Projets en fait une ligne. Le nom : celui que porte désormais `element.retired` (`data: { name, location }`, contrat événement 0.11.0, ajout compatible) ; pour un retrait d'avant, le `data.projet` le plus fréquent de ses sessions (affichage seulement, que `rattachement-projet` permet), sinon `null`. `retire_le` : le dernier `element.retired`, comme `ecartsDisparus`. Les autres lectures qui nomment un projet (`consommation`, `sessions`, tableau de bord) prennent le même nom. |
| V2, état du dépôt | `projets()` et `projets_sales` lisent `etatDepot` en direct quand le chemin existe ; sinon la valeur du catalogue. `technique.lu_a` dit toujours d'où vient la valeur : l'heure de la lecture directe, ou la date du catalogue. |
| V3, tours | `tours` garde son sens (sous-agents compris) dans le MCP ; `tours_session` s'ajoute. L'interface montre les deux dans la colonne (« 12, dont 8 en session »), sans infobulle. La mesure de `passation-sereine` reste sur le total. |
| 239 a, statut inconnu | `periode.mcp[]` gagne `inconnus` (statut `null`) ; la carte « Appels MCP » dit « dont K inconnu(s) » quand K > 0. |

**Raison.** Les noms sont la seule forme qu'un agent retienne ; en ajouter ne casse rien, en changer fausse ce qu'il a
lu. Le nom d'un projet retiré ne peut venir que de l'événement qui le retire, ou, pour le passé, du dossier de départ
déjà gardé pour l'affichage.

**Ce qui le ferait changer.** Un lecteur programmé des sorties (skill, routine, autre site) : le contrat versionné
deviendrait utile. Un nom de dossier de départ trompeur sur un retrait d'avant : le laisser `null`.

**Conséquences.** À l'approbation : contrat événement 0.11.0 (`element.retired` porte `name` et `location`) ; code du
lot 2 pour ces quatre points, un test par point, rouge sur son parent ; test visuel requis (interface) ; spécification
de l'étape 3 mise à jour (champs ajoutés).
