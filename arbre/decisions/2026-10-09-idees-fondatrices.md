---
type: decision
title: Les idées fondatrices de l'auteur au sommet de l'arbre
description: Le manifeste et les besoins ne disaient pas deux intentions de l'auteur (ne rien recréer d'un projet à l'autre, un outillage emporté partout) ; comme l'agent s'appuie sur eux, le manque cadrait ses avis sans se voir. Un paragraphe du manifeste, deux besoins et la description de la racine ; les mécanismes pour trouver ce genre de manque passent à la revue d'ensemble.
status: stable
approved: { by: human:auteur, at: 2026-10-16, ref: "échange du 2026-10-16, « Ce que tu proposes me convient. » (réécriture détaillée point par point)" }
links:
  derives_from: [/arbre/fondations/manifeste.md]
  modifies: [/arbre/fondations/manifeste.md, /arbre/besoins/besoins-fondateurs.md, /arbre/index.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Les idées fondatrices de l'auteur au sommet de l'arbre

**Contexte (2026-10-09).** Dans l'avis du jour (décision `modules-et-palliatifs`), l'accès distant, la veille du poste et
les conteneurs passaient pour une dérive : aucun besoin fondateur ne les porte. L'auteur a répondu par ses intentions,
absentes de `index.md`, du manifeste, des principes et des besoins (recherche faite) : « L'idée est que ce projet m'évite
de recréer N fois la même chose de projets en projets » ; « Je me base sur mon quotidien et mes expériences avec l'IA afin
de faire de cette solution un couteau suisse que je peux amener avec moi où que j'aille ». L'agent s'appuie sur les
fondations, elles cadrent ses réponses : un manque au sommet ne se voit pas, il se lit comme une dérive. Brouillon jamais
resoumis jusqu'au 2026-10-16, réécrit court ce jour-là avant la revue d'ensemble, qui sans lui jugerait sans ces deux
besoins.

**Décision.**
- Manifeste, paragraphe ajouté après le premier : « HOLARCH naît de l'usage quotidien de l'IA par l'auteur et de ce que
  cet usage a appris. Il doit éviter de recréer N fois la même chose d'un projet à l'autre (règles, outillage,
  environnement, accès, contrôles) et former un couteau suisse qu'on emporte partout : nouveau projet, nouvelle machine,
  au travail comme chez soi. Aucune idée ne s'y perd : elle attend dans la boîte à idées, puis prend sa place quand sa
  phase s'ouvre. » (« dans le cœur, un module optionnel ou le profil » retiré du brouillon : le découpage passe à la
  revue.)
- Besoins, deux lignes. **B6, ne rien refaire d'un projet à l'autre** (outillage, environnement, accès, contrôles ; les
  règles restent à B1, mesurées par la récolte : un critère par chose) : servi quand un projet créé par `holarch projet
  creer` reçoit conteneur, accès distant, journal et contrôles sans geste hors gestes réservés. **B7, emporter son
  outillage partout** : servi quand une machine neuve retrouve l'outillage par `holarch init` et le profil désigné, sans
  recopie à la main, en un temps borné. Ce que l'auteur a observé pour chacun et la durée de B7 : Q28.
- Racine `index.md` : sa description dit aussi « qu'on emporte d'un projet et d'une machine à l'autre ».
- Trouver ce qui manque aux fondations (points 1 à 5 du brouillon : un écart présenté comme une question, revue des
  fondations à l'aveugle, phrases d'intention repérées par la récolte, `review_after` lu par l'audit, règle « un avis de
  dérive nomme son nœud ») : entrées de la revue d'ensemble, sans engagement ; la revue applique elle-même le deuxième,
  une fois. Point 6, relecture du fil des commits : fait le 2026-10-09 ; les trois textes alors choisis par l'auteur
  (décision des retraits, compléments à `modules-et-palliatifs`, mécanisme de la contre-épreuve) restent dus, sauf ce que
  la revue rend caduc.

**Avis retenu (B6 et B1).** B1 dit déjà « un nouveau projet naît avec ses règles ». Élargir B1 à « règles et outillage »
mêlerait deux mesures dans un critère ; B6 se borne à ce qui n'est pas une règle.

**Ce qui le ferait changer.** Une intention de l'auteur qui reste absente malgré la revue : le mécanisme est à revoir.

**Conséquences.** Manifeste, besoins et racine modifiés ; Q28 garde les faits (ce qui a été observé, la durée de B7).
La revue d'ensemble lit l'outillage du poste comme servant B6 et B7, et classe le travail d'après ces critères.
