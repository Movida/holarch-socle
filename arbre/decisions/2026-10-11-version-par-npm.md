---
type: decision
title: Les outils installés par npm suivis par la version du registre
description: "Le contrôle outils-a-jour ne connaît que les publications GitHub et la LTS de node ; devcontainer, qui génère les conteneurs depuis la livraison C, n'a aucune publication GitHub. Une source `npm` lit la dernière version du registre ; contrat de configuration 0.9.0."
status: stable
approved: { by: human:auteur, at: 2026-10-11, ref: "échange du 2026-10-11, choix cliquable (source de version de devcontainer), recommandation suivie" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/conception/contrats/config.md, /arbre/decisions/2026-10-07-veille-securite-versions.md]
  constrained_by: [/arbre/fondations/principes.md]
---

# Les outils installés par npm suivis par la version du registre

**Contexte (2026-10-11, clôture de la livraison C).** `holarch projet creer` et l'accès distant dans le conteneur
s'appuient sur la ligne de commande `devcontainer` (paquet npm `@devcontainers/cli`). Le contrôle `outils-a-jour`
(décision `veille-securite-versions`) compare la version installée d'un outil à la dernière publiée, lue à deux
sources : une publication GitHub (`github: propriétaire/dépôt`) ou la dernière LTS de node. Mesure du 2026-10-11 :

- `releases/latest` du dépôt `devcontainers/cli` répond 404 : le projet ne fait aucune publication GitHub ; ses
  étiquettes existent (`v0.89.0`, `v0.88.0`…) ;
- le registre npm (`https://registry.npmjs.org/@devcontainers/cli/latest`) rend `0.89.0`, la version installée sur le
  poste personnel ;
- sur ce poste, `@devcontainers/cli` est le seul paquet installé globalement par npm (hors npm et corepack) ; `claude`
  vient de l'installateur natif, qui se met à jour seul.

**Avis.** Trois façons de suivre `devcontainer` :

| Voie | Pour | Contre |
|---|---|---|
| Source `npm` : `npm: <paquet>`, version lue à `<registre>/<paquet>/latest` | la source même de l'installation : la version publiée est celle que `npm install -g` poserait ; une ligne de code ; vaut pour tout outil installé par npm | une adresse de plus dans les réglages du site (`url_npm`), comme `url_github` et `url_node` |
| Étiquettes GitHub (`/repos/…/tags`) | aucune source nouvelle | une étiquette n'est pas une publication : trier les étiquettes et écarter les préversions est du code à écrire et à tenir |
| Ne pas suivre `devcontainer` | rien à écrire | l'outil qui génère les conteneurs vieillit sans que l'audit le dise |

La première est recommandée : elle lit la version là où l'outil s'installe (P2), sans tri maison.

**Décision.**

| Point | Choix |
|---|---|
| Source | `npm: <paquet>` dans un élément de `outils_surveilles` ; version publiée : champ `version` de `<url_npm>/<paquet>/latest` |
| Réglage du site | `controles.url_npm`, `https://registry.npmjs.org` par défaut |
| Profil | `{ nom: devcontainer, commande: [devcontainer, --version], npm: "@devcontainers/cli" }` ajouté à `outils_surveilles` |
| Contrat de configuration | 0.9.0 : `outils_surveilles` porte `[{nom, commande, github \| node: lts \| npm}]` |
| `veille-securite-versions` | ligne Versions : « publication GitHub, dernière LTS pour node, ou dernière version du registre npm » |

Le reste du contrôle ne change pas : une source injoignable rend le contrôle non disponible, jamais conforme ; les
sources ne sont interrogées qu'une fois par jour.

**Ce qui le ferait changer.** Un outil publié ailleurs (PyPI, crates.io) : une source de plus, sur le même modèle. Un
registre npm privé ou un miroir : `url_npm` suffit tant qu'il répond au même chemin.

**Conséquences.** `versionPubliee` (`src/controles.js`) lit la source `npm` ; défaut `url_npm` dans `src/config.js` et
dans l'exemple de configuration ; un test ; contrat config 0.9.0 ; une ligne au profil.
