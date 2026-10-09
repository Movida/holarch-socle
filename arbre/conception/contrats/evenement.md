---
type: contract
title: Contrat — événement du journal
description: Tout ce qui se passe est un événement daté, attribué, en ajout seul ; le journal est la matière de la visibilité et de la régulation.
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « ok pour tes recommandations »" }
version: 0.10.0
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/conception/contrats/acteurs.md, /arbre/decisions/2026-10-03-cout-liste.md, /arbre/decisions/2026-10-03-refus.md, /arbre/decisions/2026-10-03-identite-projets.md, /arbre/decisions/2026-10-03-cloture-etape-1.md, /arbre/decisions/2026-10-05-rattachement-projet.md, /arbre/decisions/2026-10-07-controles-de-regles.md, /arbre/decisions/2026-10-07-echecs-au-journal.md, /arbre/decisions/2026-10-09-environnement-d-execution.md]
---

# Contrat — événement du journal

## 1. Forme

Une ligne JSON par événement (JSON Lines), en **ajout seul** : un événement ne se modifie ni ne s'efface ; une
correction est un nouvel événement qui cite le précédent. Exemple fictif :

```json
{"id":"01J9ZK3Q7M4V8R2T6Y0B5N1C3D","at":"2026-10-03T09:47:51Z","kind":"run.finished","actor":"agent:claude-code/claude-opus-5-5","site":"local","context":"perso","node":"/perso/demo/projet-x","subject":"holarch:run:projet-x-0007","correlation":"session-9ac9e61a","data":{"status":"delivered","turns":137},"cost":{"usd_list":4.28,"provider":"anthropic","model":"claude-opus-5-5","tokens":{"in":180,"cache_read":8693468,"cache_write":143248,"out":69756}},"classification":"internal"}
```

## 2. Champs

| Champ | Valeur |
|---|---|
| `id` | ULID (triable dans le temps) |
| `at` | horodatage UTC ISO 8601 |
| `kind` | famille.verbe : voir §3 |
| `actor` | contrat acteurs |
| `site` | site qui a émis l'événement (`local`, `serveur`, ou nom configuré) ; la vue unifiée est l'union des journaux des sites, triée par `id` (décision synchronisation) |
| `context`, `node` | contexte et nœud concernés |
| `subject` | identifiant du catalogue de l'élément concerné, s'il y en a un |
| `correlation` | identifiant qui relie les événements d'une même session, exécution ou décision |
| `data` | contenu propre au `kind` ; jamais un secret ; jamais un contenu au-dessus de la `classification` de l'événement |
| `data.projets` | projets concernés, par identifiant du catalogue, avec leur poids : `[{id, n}]` ; porté par la fin de session, il vaut pour tous les événements de même `correlation` (coût, outils), qui se regroupent par projet à travers elle. `data.projet`, quand il existe, est le nom du dossier de départ : affichage et historique seulement, jamais une clé de regroupement |
| `cost` | si l'événement coûte : `{usd_list, usd_real?, provider, model, tokens}` ; `usd_list` est le coût liste que connaît l'émetteur, sinon `null` : la lecture le calcule depuis `tokens` et la grille de tarifs (décision coût liste) |
| `cost.tokens` | `in`, `cache_write`, `cache_write_1h` (part de `cache_write` écrite pour une heure, facturée plus cher), `cache_read`, `out` ; les sommes font foi : un événement peut compléter la ventilation d'un précédent |
| `classification` | niveau de l'événement ; un consommateur ne lit que ce que son niveau autorise |
| `data` d'un écart | `rule.violated` et `rule.resolved` : `{regle, controle, cle, fichier?, ligne?, n?, message?}` ; la règle par son identifiant du catalogue, `cle` reconnaît l'écart d'un audit à l'autre, `n` compte ses occurrences, `message` dit sa nature ; jamais le contenu trouvé ; `subject` est le projet, absent pour la portée du compte |
| `data` d'un échec | `tool.failed` : `{outil, motif, code?, programme?}`, `motif` parmi `sortie`, `tests`, `garde`, `edition-perimee`, `edition-introuvable`, `edition-ambigue`, `edition-non-lue`, `fichier-absent`, `validation`, `delai`, `autre` ; `code` et `programme` (nom seul, sans chemin ni argument) pour une commande shell ; `rule.enforced` (refus d'une garde) : `{regle, controle, n, moment}` ; `session.finished` porte `tests: {lances, rouges}` ; jamais la commande, le chemin ni la sortie (décision échecs au journal) |
| `data` de la veille | `power.held` (demande d'éveil du poste tenue) : `{sessions: [{session, etat, projet?}]}`, les sessions distantes qui la retiennent, émis de nouveau quand l'une arrive ou part pendant la tenue, `etat` parmi `travaille` et `attend`, `projet` le nom du dossier de départ (affichage seulement) ; `power.released` : `{raison}`, `aucune-session` ou `arret` (l'adaptateur s'arrête) ; `power.failed` : `{motif, code?}`, `motif` parmi `sans-mecanisme`, `non-lancee`, `sans-reponse`, `refusee` et `arretee`, `code` celui de sortie de la demande s'il y en a un ; une fois par panne, le détail (sortie de la demande, chemins) au seul log de l'adaptateur (décision environnement-d-execution) |

## 3. Familles (vocabulaire ouvert, extensible par décision)

`session.*` (started, finished) · `run.*` (requested, started, finished, failed) · `tool.*` (called, denied, failed) · `rule.*` (applied,
violated, resolved, derogated, proposed, enforced) · `decision.*` (requested, made, delegated) · `verification.*` (requested, verdict) ·
`element.*` (created, updated, moved, suspended, retired) · `cost.recorded` · `budget.*` (warning, exceeded) · `dream.*`
(started, proposal, finished) · `inventory.finished` · `ui.viewed` (page de l'interface consultée) · `idea.*` (noted, triaged, taken, dropped) · `system.*` (paused, resumed, degraded) · `power.*` (held, released, failed : la veille du poste retardée sous une session distante).

## 4. Règles

- Toute brique et tout adaptateur émettent leurs événements ; ce qui n'est pas au journal ne s'est pas passé (P4).
- Le journal se consolide (le rêve) mais ne se réécrit pas : la consolidation produit des résumés, qui sont eux-mêmes
  des éléments référencés.
