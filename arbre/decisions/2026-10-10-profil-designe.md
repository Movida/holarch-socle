---
type: decision
title: "Le profil désigné par le site : un seul déclarant, aucun identifiant en double, exceptions hors du dépôt"
description: Après la contre-épreuve de exceptions-hors-du-depot (constats a et c). Le dépôt du profil est nommé par la configuration du site ; seuls ses nœuds déclarent des projets ; un identifiant d'arbre ou de type en double n'est jamais résolu au hasard ; les exceptions de donnees_personnelles se lisent comme celles de montage_sensible ; toute ambiguïté devient une règle effective incomplète ou un écart.
status: draft
links:
  derives_from: [/arbre/decisions/2026-10-10-exceptions-hors-du-depot.md, /arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/decisions/2026-10-06-arbre-des-regles.md, /arbre/decisions/2026-10-10-exceptions-hors-du-depot.md, /arbre/decisions/2026-10-09-veille-et-conteneur-precisions.md, /arbre/decisions/2026-10-09-environnement-d-execution.md, /arbre/conception/contrats/noeud.md, /arbre/conception/contrats/config.md, /arbre/types-transverses/depot-public/index.md, "profil:/arbre/index.md", "profil:/arbre/contextes/perso.md", "okf-bundle-template:/arbre/index.md"]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-09-partage-et-bac-a-sable.md]
---

# Le profil désigné par le site

**Contexte (2026-10-10).** La contre-épreuve de `exceptions-hors-du-depot` a reproduit deux défauts antérieurs, qui
rendent sa fermeture contournable :

- (a) **le profil et les déclarants se déduisent.** Le profil est l'arbre qui porte des nœuds `context` ; tout nœud qui
  porte `projects:` peut déclarer un projet, et le premier par titre compte (`regles.js`, `regleEffective`). Un nœud
  écrit dans le dépôt d'un projet, que son conteneur écrit, devient le déclarant : la chaîne repart de ce dépôt et
  `conteneur-isole`, non dérogeable, disparaît sans dérogation. En `type: context`, il fait un second profil : le compte
  devient indéterminé et l'audit dit « conforme ». Sur un site où le dépôt du profil manque, un tel nœud devient le
  profil, sans aucun signal ;
- (c) **un identifiant d'arbre en double se résout au hasard.** L'identité d'un arbre est l'`id` de sa racine ; deux
  racines de même `id`, et la dernière lue l'emporte, y compris pour les liens internes à un arbre (le
  `derives_from: /arbre/index.md` d'un contexte se résout par l'`id`). Les règles des deux arbres prennent alors les
  mêmes identifiants au catalogue. Même chose pour deux types (`template`) de même `id`.

Deux mineurs du même rapport en relèvent : un nœud du dépôt d'un autre projet peut déclarer un projet avec ses
exceptions (4) ; les exceptions de `donnees_personnelles` se lisent encore dans le dépôt contrôlé, la voie même que
`exceptions-hors-du-depot` a fermée pour `montage_sensible` (7).

**Mesures sur le poste (2026-10-10).** Un seul nœud déclare des projets : le contexte personnel (6 projets), dans le
dépôt du profil. Trois racines (`profil`, `holarch`, `okf-bundle-template`) et trois types (`depot-public`,
`methode-holarch`, `projet-dormant`), aucun `id` en double. Le dépôt du profil n'a pas de conteneur, et aucune
configuration de conteneur du poste ne le monte. Trois exceptions de `donnees_personnelles`, toutes dans un dépôt :
`LICENSE` et `NOTICE` au type `depot-public` (dépôt du socle), et le nom du dépôt public que sert okf-bundle-template, à
sa racine ; aucune au profil ni au contexte. Les règles effectives du poste ne changent donc pas, hormis le déplacement
de ces trois exceptions.

**Proposition.**

| Point | Texte proposé |
|---|---|
| Profil désigné | la configuration du site (`config.yaml`, hors de tout dépôt) nomme le dépôt du profil : `profil: <chemin>`. Seul cet arbre est le profil ; un autre arbre qui porte des contextes n'en fait pas un second |
| Qui déclare un projet | seuls les nœuds `context` ou `activity` de l'arbre du profil (`projects`). Ailleurs, un `projects:` ou un nœud `context` n'est pas lu ; il se dit en écart du compte, avec son fichier |
| Profil non désigné | pas de profil sur ce site, comme aujourd'hui quand aucun arbre ne porte de contexte : seules les règles des types et du projet s'appliquent, et l'audit d'un site qui lit des arbres le dit en écart du compte (aujourd'hui, un compte indéterminé se tait) |
| Profil incomplet | dépôt du profil désigné mais absent ou illisible, ou projet déclaré par deux nœuds du profil : la règle effective est incomplète, traitée comme une règle illisible (la garde refuse le commit, `regles appliquer` n'écrit rien, l'audit le dit) ; plus de « le premier compte » |
| Identifiant en double | le profil désigné garde son `id` : un autre arbre qui le reprend n'est pas retenu. Deux autres racines de même `id`, ou deux types de même `id` : aucun n'est retenu, et qui en dépend a une règle effective incomplète. Un lien à l'intérieur d'un arbre se résout dans le dépôt de son nœud, jamais par l'`id` ; un lien vers un autre arbre (`<id>:<chemin>`) dont l'`id` est en double n'est pas résolu, et c'est dit |
| Dépôt du profil monté par un conteneur | en écriture : écart du contrôle `montage-sensible`. Le profil est ce qui fait foi ; un conteneur qui l'écrit lèverait toutes ses règles (hypothèse « ce qui le ferait changer » de `exceptions-hors-du-depot`) |
| Exceptions de `donnees_personnelles` | même lecture que celles de `montage_sensible` : au profil et au contexte seulement, hors du dépôt contrôlé, et dites à l'audit quand elles sont écartées. Les `termes`, qui allongent la liste privée, se lisent à toutes les couches. Les trois exceptions du poste déménagent : `LICENSE` et `NOTICE` à la racine du profil, le nom de dépôt public au contexte personnel |
| Contexte hors du dépôt du profil (amende `arbre-des-regles`) | un contexte de travail qui vit dans le dépôt privé d'un employeur se lira quand la configuration du site le désignera aussi ; cette clé s'ajoutera avec le premier contexte de travail (Q18), pas avant |
| Contrat de configuration | 0.6.0 : `donnees_personnelles`, `termes` à toutes les couches, `exceptions` au profil et au contexte, hors du dépôt contrôlé ; `montage_sensible`, une exception se juge périmée sur ce site, et seulement là où son contrôle l'a lue en entier. La livraison C passe à la 0.7.0 |
| Contrat nœud | 0.4.0 : `projects` lu dans le seul arbre du profil désigné par le site ; l'`id` d'une racine et celui d'un type sont uniques sur un site, un doublon n'est jamais résolu |

**Choix à l'auteur.**

1. Comment le site reconnaît son profil. Recommandation de l'agent : le désigner dans la configuration du site. Rien de
   ce qu'un dépôt écrit ne peut alors faire un profil, même sur un site où le vrai manque ; le coût est une ligne par
   site. Autre voie : le déduire comme aujourd'hui, en faisant de toute ambiguïté (deux profils, déclarant hors du
   profil) un écart. Aucun réglage, mais sur un site sans le dépôt du profil, un dépôt qui écrit un contexte devient le
   profil sans que rien soit ambigu.
2. Exceptions de `donnees_personnelles`. Recommandation de l'agent : les fermer comme celles de `montage_sensible`. La
   menace est la même (la session qui écrit le dépôt écrit l'exception qui fait taire la garde, dans le même commit),
   et les trois exceptions du poste, génériques ou publiques, se déplacent en trois lignes. Autre voie : les laisser
   dans le dépôt et seulement les dire à l'audit ; plus court, la voie reste ouverte.
3. Version du contrat de configuration. Recommandation de l'agent : 0.6.0 pour ce changement, C passe à la 0.7.0 ; c'est
   le choix fait par l'auteur pour la même question le 2026-10-10 (une portée réduite est une rupture, elle prend sa
   version). Autre voie : amender la 0.5.0 en place.

**Ce qui le ferait changer.** Un contexte de travail dans un autre dépôt (une clé de plus, ci-dessus) ; un site partagé
par plusieurs personnes (plusieurs profils) ; un besoin d'exception propre à un projet que ni le profil ni un contexte
ne peuvent porter.

**Conséquences.** À l'approbation : le code (désignation lue dans la configuration du site, déclarants, identifiants en
double, règle effective incomplète, écarts du compte, montage du profil, lecture des exceptions de
`donnees_personnelles`), un commit et un test chacun ; les trois exceptions déplacées dans le même pas que le code, pour
que la garde ne refuse pas entre les deux (profil, type `depot-public` du socle, racine d'okf-bundle-template) ; la
clé `profil` posée dans la configuration du poste ; les contrats dans la version choisie ; puis une contre-épreuve.
Site de travail : [À COMPLÉTER : lit-il des arbres, et porte-t-il un dépôt de profil ? (Q32)] ; sans la clé, il perd
les règles de son profil au compte, et son audit le dit.
