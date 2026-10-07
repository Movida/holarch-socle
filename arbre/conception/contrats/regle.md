---
type: contract
title: Contrat — règle
description: Une règle est une donnée attachée à un nœud ; elle s'hérite, se déroge explicitement, et s'applique par des adaptateurs selon son niveau.
status: draft
version: 0.4.0
links:
  derives_from: [/arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/conception/contrats/noeud.md, /arbre/decisions/2026-10-06-arbre-des-regles.md, /arbre/decisions/2026-10-07-controles-de-regles.md, /arbre/decisions/2026-10-07-recolte.md]
---

# Contrat — règle

## 1. Forme

Les règles d'un nœud vivent dans un fichier `rules.yaml` à côté de lui (ou dans son en-tête sous `rules:` pour une ou
deux) ; le `rules.yaml` d'un dossier est celui de son `index.md`. Une règle sans `status` est un brouillon ; `deprecated`
la retire (refusée ou abandonnée) sans l'effacer, avec `deprecated: {by, at, why}`. Une règle
porte la classification de son nœud. Une règle de type transverse dit un comportement ; ce qui varie
d'un projet à l'autre (un emplacement, un nom) est un réglage du projet (`config`), que la règle cite. Exemple fictif :

```yaml
- id: verifier-ci-apres-push
  statement: Après tout envoi vers un dépôt distant, lire le résultat de l'intégration continue et le rapporter.
  why: Un envoi non vérifié a laissé une intégration rouge plusieurs jours.
  trigger: after_action        # before_action · after_action · periodic · session_start · session_end · project_creation
  match: { action: git.push }   # sur quoi le déclencheur porte ; vocabulaire des actions : étape 3
  level: verified               # blocking · verified · guided · reminder
  check: [ci-lue]               # contrôles du registre du socle ; facultatif
  derogable: true
  applies_to: { node_types: [project] }   # paths: [motifs] limite la règle à des chemins du projet
  status: stable
  approved: { by: human:alice, at: 2026-10-03 }
  source: harvest               # written · harvest · decision
  replaces: [note-de-memoire]   # ce que la règle remplace (récolte) ; facultatif
  harvest: { at: 2026-10-07, sessions: 3, projects: [demo], first: 2026-09-12, last: 2026-10-02, refs: [<session>, memoire:<fiche>] }
                                # d'où vient une règle récoltée : sources par référence, jamais par citation ; facultatif
  review_after: 2027-04-01
```

## 2. Niveaux d'application

| Niveau | Effet | Coût en contexte |
|---|---|---|
| `blocking` | garde déterministe : l'action n'a pas lieu | nul |
| `verified` | contrôlé après coup ; écart journalisé et signalé | nul |
| `guided` | procédure chargée à la demande quand le déclencheur survient | ponctuel |
| `reminder` | consigne toujours présente dans le contexte de l'agent | **à chaque tour** — réservé au très court |

**Contrôles.** Une règle `blocking` ou `verified` désigne ses contrôles (`check`), du code du socle connu par un
identifiant, jamais une commande écrite dans l'arbre. `blocking` : le contrôle s'exécute avant l'action, dans le
mécanisme du runtime qui la porte (crochet de git pour un commit, permissions du client pour une lecture), puis à
l'audit pour ce qui serait passé outre ; `verified` : à l'audit seulement. Un contrôle qui ne peut pas s'exécuter (outil
absent) se dit non disponible, jamais conforme. Un écart ne cite jamais le contenu trouvé, seulement où il est.

Un adaptateur traduit une règle pour un client (hook, permission, consigne de serveur MCP, contrôle d'un runtime). Une
règle qu'un client ne peut pas appliquer à son niveau descend au niveau applicable suivant, et l'écart est visible
dans la vue effective.

**Matérialisation.** Un adaptateur écrit dans les portées que le client possède déjà, sans refaire l'héritage : ce qui
vaut pour tous les projets d'un site va à la portée du compte ; ce qui vaut pour un projet, à la portée du projet ;
un sous-nœud, à une portée limitée à ses chemins. Une règle ne s'écrit jamais dans un lieu plus ouvert que sa
classification (une règle privée n'entre pas dans un dépôt public : portée locale, non commitée). Un fichier généré
porte une marque ; un fichier non marqué n'est jamais modifié ; une régénération montre son écart ; une panne laisse
les fichiers précédents en place. Seule une règle `stable` se matérialise.

## 3. Héritage, dérogation, conflits

- Une règle vaut pour le nœud qui la porte et toute sa descendance, d'un arbre à l'autre (profil → contexte →
  projet) ; les `types` d'un projet viennent juste au-dessus de lui, dans l'ordre déclaré.
- **Dérogation** : un nœud descendant déclare `derogations: [{rule, why, by, at}]` ; refusée si la règle est
  `derogable: false`.
- **Conflit** : le plus spécifique l'emporte, sauf règle non dérogeable ; un conflit que ces deux principes ne
  tranchent pas devient une décision pour l'humain.
- **Règle effective** d'un nœud : l'ensemble calculé, chaque règle avec sa provenance (nœud porteur, dérogations
  traversées).

## 4. Évolution

- **Récolte** (décision `recolte`) : une consigne répétée par l'humain (deux sources ou deux projets) devient une règle
  proposée (`status: draft`, `source: harvest`, `harvest`) au plus bas nœud commun de ses sources : le projet si toutes
  en viennent, sinon le profil. Une consigne déjà dite par une règle, proposée ou refusée, n'est pas reproposée ; une
  consigne qui en contredit une autre, ou contredit une règle, est une question pour l'humain, pas une règle. Une règle
  refusée passe en `deprecated` et reste connue de la récolte.
- **Remontée** : une règle présente chez deux enfants ou plus est proposée au parent ; une règle du parent dérogée par
  la plupart de ses enfants est proposée à la descente.
- Une règle a une date de revue ; une règle jamais déclenchée depuis longtemps est proposée au retrait.
