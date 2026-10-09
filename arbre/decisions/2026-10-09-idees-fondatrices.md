---
type: decision
title: Les idées fondatrices de l'auteur au sommet de l'arbre, et une revue des fondations qui cherche ce qui leur manque
description: Le manifeste et les besoins ne disaient pas deux intentions de l'auteur (ne rien recréer d'un projet à l'autre, un outillage emporté partout) ; comme l'agent s'appuie sur eux, le manque cadrait ses avis sans se voir. Texte proposé, et un mécanisme pour trouver ce genre de manque.
status: draft
links:
  derives_from: [/arbre/fondations/manifeste.md]
  modifies: [/arbre/fondations/manifeste.md, /arbre/besoins/besoins-fondateurs.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Les idées fondatrices de l'auteur au sommet de l'arbre, et une revue des fondations qui cherche ce qui leur manque

**Contexte (2026-10-09).** Dans l'avis du jour (décision `modules-et-palliatifs`), l'accès distant, la veille du poste et
les conteneurs passaient pour une dérive : aucun besoin fondateur ne les porte. L'auteur a répondu par ses intentions,
absentes de `index.md`, du manifeste, des principes et des besoins (recherche faite) : « L'idée est que ce projet m'évite
de recréer N fois la même chose de projets en projets » ; « Je me base sur mon quotidien et mes expériences avec l'IA afin
de faire de cette solution un couteau suisse que je peux amener avec moi où que j'aille ». Toutes les fonctionnalités et
propositions émises par l'auteur l'intéressent, le tout restant cohérent, modulaire, paramétrable et partageable. Puis
le constat qui fonde la partie 2 : l'agent s'appuie scrupuleusement sur les fondations, elles cadrent ses réponses, et
les règles fondamentales ne sont presque jamais remises en cause, alors qu'il faut pouvoir repérer un tel manque et y
pallier.

**Partie 1 : le texte proposé.**
- Manifeste, paragraphe ajouté après le premier : « HOLARCH naît de l'usage quotidien de l'IA par l'auteur et de ce que
  cet usage a appris. Il doit éviter de recréer N fois la même chose d'un projet à l'autre (règles, outillage,
  environnement, accès, contrôles) et former un couteau suisse qu'on emporte partout : nouveau projet, nouvelle machine,
  au travail comme chez soi. Aucune idée ne s'y perd : elle attend dans la boîte à idées, puis prend sa place dans le
  cœur, un module optionnel ou le profil quand sa phase s'ouvre. »
- Besoins, deux lignes ajoutées :
  - **B6, ne rien refaire d'un projet à l'autre** : observé [À COMPLÉTER : ce que l'auteur a vu se refaire] ; servi
    quand [À COMPLÉTER : critère, par exemple un nouveau projet reçoit l'outillage voulu sans geste manuel hors gestes
    réservés].
  - **B7, emporter son outillage partout** : observé [À COMPLÉTER] ; servi quand [À COMPLÉTER : critère, par exemple
    une machine neuve retrouve l'outillage par `holarch init` et le profil, en un temps borné].
- Racine `index.md` : sa description dit aussi « qu'on emporte d'un projet et d'une machine à l'autre ».

**Partie 2 : trouver ce qui manque aux fondations.** L'agent lit les fondations, juge le travail d'après elles : un
manque au sommet ne se voit pas, il se lit comme une dérive. Palliatifs :
1. Un écart n'est pas un verdict : du travail qui ne sert aucun besoin écrit (parcours I31, part des sessions et du coût
   par nœud) se présente à l'auteur comme une question, « dérive, ou besoin non écrit ? ».
2. Revue des fondations à l'aveugle, à la clôture de chaque étape et sur le signal du point 1 : une instance neuve lit
   les messages de l'auteur (sur place, jamais copiés), en tire les intentions sans avoir lu les fondations, puis les
   compare au manifeste, aux principes et aux besoins : intentions absentes, fondations jamais servies, contradictions,
   propositions en brouillon. C'est la contre-épreuve appliquée au sommet de l'arbre.
3. La récolte, qui repère les consignes redites, repère aussi les phrases d'intention (« l'idée est que… », « je
   veux… ») qu'aucun nœud ne porte.
4. Chaque fondation stable reçoit un `review_after` (champ déjà au contrat, stocké mais non lu) ; l'audit signale une
   fondation échue, que la revue reconfirme ou amende.
5. Règle du profil, en brouillon : « Un avis qui conclut à une dérive nomme le nœud sur lequel il s'appuie et demande
   si ce nœud dit encore l'intention de l'auteur. »
6. Relecture du fil des commits (choix de l'auteur, 2026-10-09 : à lancer à la reprise, périmètre du socle) : une
   instance neuve relève les objectifs dans leur première version (fondations, architecture, contrats et étapes au
   2026-10-03, par `git show`) avant de lire les versions actuelles ; pour chacun : présent, modifié par une décision
   nommée, ou disparu sans décision. Chaque objectif disparu sans décision est proposé à l'auteur : rétabli (module,
   idée) ou retiré par une décision. Ensuite, contrôle possible : une ligne retirée d'un nœud stable sans décision qui
   le modifie.

**Ce qui le ferait changer.** Une intention de l'auteur qui reste absente malgré la revue : le mécanisme est à revoir ;
deux revues de suite sans rien trouver : leur cadence s'allonge.

**Conséquences.** À l'approbation : manifeste, besoins et racine modifiés (seuils de B6 et B7 en Q28) ; la revue des
fondations rejoint le module `regulation`, ou la méthode si l'auteur la veut avant l'étape 5 [À COMPLÉTER : choix de
l'auteur] ; la règle du point 5 est proposée au profil. Le point 3 de `modules-et-palliatifs` se relit avec B6 et B7 :
l'outillage du poste n'y est plus une dérive, c'est un module qui les sert.
