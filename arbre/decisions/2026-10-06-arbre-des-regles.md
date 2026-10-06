---
type: decision
title: Un arbre des règles pour tous les projets, réparti entre dépôts
description: Le profil est la racine des règles d'une personne, le socle fournit des types ; un lien entre arbres se pose du côté le plus fermé ; les règles se matérialisent dans les portées du runtime.
status: draft
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-03-classification.md, /arbre/conception/contrats/noeud.md, /arbre/conception/contrats/regle.md, /arbre/conception/types.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-03-synchronisation.md, /arbre/decisions/2026-10-05-rattachement-projet.md]
---

# Un arbre des règles pour tous les projets, réparti entre dépôts

**Contexte.** Consigne de l'auteur (2026-10-06) : l'arbre des règles s'applique à l'ensemble des projets ; un nouveau
projet respecte d'office des ensembles de règles ; un projet peut avoir des sous-niveaux ; le principe vaut pour HOLARCH
lui-même, pour ses principes fondamentaux. C'est le modèle de l'architecture (§5.2) et du contrat règle (0.1.0). Ce qui
manque pour le réaliser : aujourd'hui chaque dépôt porte son propre arbre, ses liens sont des chemins internes au
dépôt, aucun dépôt ne dit où il se place dans l'ensemble, et les règles sont écrites à la main (`CLAUDE.md`, mémoires).

**Avis.** D'accord sur le fond. Quatre contraintes en décident la forme :

- *P7 et la classification* : le socle est public, le profil privé, un projet l'un ou l'autre. Selon la décision
  `classification`, un projet public placé sous un profil privé deviendrait confidentiel : il faut dire ce qui
  traverse un lien entre arbres ;
- *la racine du socle est aussi le projet HOLARCH* : ses règles propres (tests verts, données fictives) n'ont pas à
  descendre chez tous ; et la méthode complète (brouillon, approbation, décisions) n'a pas à s'imposer à un petit projet
  (P11) ;
- *le runtime a déjà des portées* (P2) : Claude Code lit les consignes du compte (`~/.claude/CLAUDE.md`,
  `~/.claude/rules/`), du projet (`CLAUDE.md`, `.claude/rules/`, avec des règles limitées à des chemins par `paths:`),
  et locales, non commitées (`CLAUDE.local.md`) ; les hooks se règlent aux mêmes portées. HOLARCH n'a pas à refaire
  l'héritage, seulement à remplir ces portées depuis une source unique, avec la provenance ;
- *l'amorçage* : si HOLARCH génère les consignes qui encadrent son propre développement, une panne du générateur ne doit
  pas en priver l'agent.

**Décision.**

| Point | Choix |
|---|---|
| Portée | un seul arbre logique pour tous les projets d'une personne, réparti entre dépôts : chaque nœud vit dans le dépôt de son niveau |
| Niveaux | **profil** (dépôt privé de la personne, racine de ses règles) → **contexte** (perso, pro, client ; un contexte de travail vit dans le dépôt privé de l'employeur) → activité (facultative) → **projet** → sous-niveaux du projet |
| Le socle | ne se place pas au-dessus du profil : il fournit des **types transverses**, des ensembles de règles qu'un projet adopte (`types`, contrat nœud). Premiers types : `methode-holarch` (brouillon jusqu'à approbation, rien créé à l'avance, inconnu marqué, contrat changé par décision, cohérence globale, journal de l'arbre) et `depot-public` (aucune donnée personnelle, exemples fictifs). Révise le « socle → profil » de l'architecture §5.2 |
| HOLARCH lui-même | un projet comme les autres : types `methode-holarch` et `depot-public`, ses principes (P1 à P12) et ses règles propres portés par sa racine ; le profil de l'auteur s'y applique comme à tout projet |
| Appartenance d'un projet | **un lien entre arbres se pose du côté le plus fermé** : le contexte déclare ses projets (`projects: [holarch:project:<id>]`, identifiant fondé sur le premier commit, décision `identite-projets`) ; un dépôt public ne cite jamais un arbre privé. À l'intérieur d'un arbre, l'enfant déclare son parent (`derives_from`), comme aujourd'hui. Un projet qu'aucun contexte ne déclare relève du profil seul, et c'est signalé |
| Classification | les **règles et la configuration** descendent d'un arbre à l'autre ; le **contenu** ne traverse pas, et un projet garde sa classification. Le durcissement de la décision `classification` vaut à l'intérieur d'un arbre. Une règle porte la classification de son nœud et ne s'écrit jamais dans un lieu plus ouvert |
| Sous-niveaux | un nœud de niveau inférieur à la racine du projet correspond à un sous-dossier ; ses règles se matérialisent avec `paths:` |
| Matérialisation (adaptateur Claude Code) | dans les portées du runtime : règles qui valent pour tous les projets du site (profil, contexte si le site n'en a qu'un) → portée du compte (`~/.claude/rules/holarch/`) ; règles du projet et de ses types publics → `.claude/rules/holarch/` dans le dépôt, commité ; règles d'un niveau privé propres à un projet → portée locale, jamais commitée [À COMPLÉTER : `CLAUDE.local.md` ou import depuis le compte, à choisir à l'essai] ; niveau `blocking` → hook de la même portée |
| Fichiers générés | un fichier par règle, dans un dossier réservé, marqué comme généré ; le `CLAUDE.md` écrit à la main n'est jamais modifié ; une régénération montre son diff ; une panne laisse les fichiers précédents en place |
| Lien entre arbres | `<id de la racine>:<chemin>` (exemple fictif : `profil:/arbre/contextes/perso.md`) ; chaque racine déclare son `id` ; la résolution passe par le catalogue ; un lien non résolu est signalé et ne casse rien |
| Coût | la vue effective d'un projet montre la taille de ce qui est chargé à chaque tour (`reminder`) ; une règle longue se range en `guided` |

**Raison.** Le profil en racine donne la portée voulue (tous les projets) sans faire hériter à chacun les règles de
développement de HOLARCH ; les types donnent les « ensembles de règles » qu'un nouveau projet reçoit d'office en les
déclarant. Poser le lien côté fermé règle la classification sans exception au cas par cas, et laisse intacts les dépôts
qu'on ne possède pas. Matérialiser dans les portées du runtime évite d'écrire un mécanisme d'héritage de plus.

**Ce qui le ferait changer.** Un second runtime sans portées équivalentes (son adaptateur devra calculer l'héritage
lui-même) ; un besoin de règles communes à plusieurs personnes (un niveau au-dessus des profils).

**Conséquences.** Contrat nœud 0.2.0 (lien entre arbres, `projects` d'un contexte, `id` de la racine) ; contrat règle
0.2.0 (classification d'une règle, matérialisation par portée) ; registre des types : premiers types transverses ;
architecture §5.2 révisée ; tranche 3 de l'étape 3 : profil, règle effective et adaptateur Claude Code, essayés sur
HOLARCH et sur un second projet (Q16), avec le dépôt du profil (Q17).
