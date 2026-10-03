# HOLARCH

**Un socle autour des agents d'IA que vous utilisez déjà** — Claude Code, Claude Desktop, l'Agent SDK, d'autres
frameworks demain — pour qu'ils suivent vos règles sans que vous les redisiez, que tout ce qu'ils font soit visible, que
ce qu'ils apprennent soit conservé, vérifié et partagé entre vos projets, et que le tout se régule.

HOLARCH ne refait pas l'orchestration d'agents : les runtimes existants le font et évoluent plus vite que n'importe quel
projet. Il apporte ce qu'aucun d'eux ne fournit d'une session, d'un projet ou d'un outil à l'autre.

> **Statut : étape 0 — spécification.** Rien n'est encore exécutable. L'architecture est approuvée ; l'arbre du
> système et ses contrats sont en brouillon (`arbre/`).

## L'idée en une image

- **Un hub MCP unique** : tous les clients (Desktop, Claude Code, interface web…) passent par lui ; derrière, chaque
  brique et chaque API tourne dans son propre conteneur.
- **Un catalogue** de tout ce qui est en place, **un journal** de tout ce qui se passe, **une interface web** pour
  voir, configurer, administrer.
- **Un seul arbre** (socle → profil → contexte → activité → projet) qui porte les intentions, les règles et la
  configuration : on généralise en posant plus haut, on uniformise des pairs en posant chez leur parent.
- **Des briques** optionnelles et remplaçables : Intentions, Règles et configuration, Savoir, Exécution (adaptateurs de
  runtimes), Vérification, Humain, Connecteurs, Projets, Mémoire (rêve et idéation).
- **Des boucles de régulation** qui proposent ; l'humain approuve ce qui est irréversible.

Le détail : [`docs/architecture.md`](docs/architecture.md).

## Principes

1. **Les contrats sont le produit** ; chaque implémentation est un adaptateur remplaçable.
2. **Modulable, configurable, évolutif** : tout est optionnel, toute configuration est une donnée de l'arbre.
3. **Autour des runtimes, pas à leur place.**
4. **Visible** : ce qui n'est pas au catalogue n'existe pas, ce qui n'est pas au journal ne s'est pas passé.
5. **Rien n'est créé à l'avance** : un élément n'existe que s'il aide à décider ou à agir.
6. **Mesure avant réglage** : une évolution s'adopte sur une mesure, pas sur une intuition.
7. **L'humain décide de l'irréversible**, en un seul endroit ; l'agent n'est que le scribe de ses approbations.

## Organisation du dépôt

| Chemin | Contenu |
|---|---|
| `docs/architecture.md` | l'architecture macro, de laquelle tout dérive |
| `arbre/` | l'arbre du système lui-même, écrit avec sa propre méthode (fondations, besoins, conception, décisions) |
| `arbre/conception/contrats/` | les contrats en brouillon : nœud, règle, fiche du catalogue, événement du journal |
| `CLAUDE.md` | consignes pour une session d'agent dans ce dépôt |

## Licence

MIT — voir [`LICENSE`](LICENSE).
