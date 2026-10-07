---
type: decision
title: Veille de sécurité et de versions par l'audit
description: Les failles connues des dépendances (osv-scanner) et le retard des outils du poste deviennent des contrôles de l'audit, portés par le profil, interrogés une fois par jour.
status: stable
approved: { by: human:auteur, at: 2026-10-07, ref: "échange du 2026-10-07, choix cliquables (périmètre, outil et seuil, versions, fréquence, projets déclarés)" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-07-controles-de-regles.md, /arbre/decisions/2026-10-06-arbre-des-regles.md]
---

# Veille de sécurité et de versions par l'audit

**Contexte.** Demande de l'auteur (2026-10-07) : une veille automatique, la vérification des failles connues (CVE) et
des nouvelles versions. Six projets ont des dépendances verrouillées (npm, uv) ; l'un d'eux porte une centaine de failles
connues, toutes gravités confondues. Les outils du poste (gitleaks, osv-scanner, node) se mettent à jour à la main.

**Avis.** Pas de détecteur maison (P2) : la base OSV agrège les avis de sécurité des écosystèmes, et `osv-scanner` la
lit pour tous les fichiers de verrouillage. Le mécanisme existe déjà : un contrôle de l'audit, dont l'écart va au journal
et sur la carte du projet. La veille plus large (nouveaux modèles, nouveautés des runtimes) relève de la régulation
(étape 5) et n'est pas traitée ici.

**Décision.**

| Point | Choix |
|---|---|
| Périmètre | deux règles du profil, donc valables partout ; l'audit couvre les projets que le contexte déclare, et l'auteur y déclare ceux à surveiller |
| Failles | contrôle `dependances-vulnerables` : `osv-scanner` sur les fichiers de verrouillage suivis par git ; un écart par paquet qui porte une faille de gravité élevée ou critique (CVSS ≥ 7, ou gravité déclarée `HIGH` ou `CRITICAL`) |
| Versions | contrôle `outils-a-jour`, de portée site : chaque outil de la liste du profil (`outils_surveilles`), version installée contre dernière publiée (publication GitHub, ou dernière LTS pour node) |
| Fréquence | les sources ne sont interrogées qu'une fois par jour ; entre deux, l'audit relit le résultat gardé (et réinterroge si un fichier de verrouillage change) |
| Outil absent ou source injoignable | contrôle non disponible, jamais conforme |

**Raison.** Le seuil évite qu'une centaine d'avis mineurs noient les failles qui comptent. Une règle de profil suit
l'auteur dans tous ses projets sans rien recopier ; déclarer un projet dans le contexte est le geste déjà en place.

**Ce qui le ferait changer.** Des avis importants sans gravité chiffrée : abaisser le seuil ou lire la gravité
déclarée en premier. Un besoin de suivre les dépendances en retard d'une version majeure : un contrôle de plus.

**Conséquences.** Tranche 5 de l'étape 3, `conception/etape-3-regles-projets.md`.
