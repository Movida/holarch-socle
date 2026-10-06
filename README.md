# HOLARCH

**Un socle autour des agents d'IA que vous utilisez déjà** — Claude Code, Claude Desktop, l'Agent SDK, d'autres
frameworks demain — pour qu'ils suivent vos règles sans que vous les redisiez, que tout ce qu'ils font soit visible, que
ce qu'ils apprennent soit conservé, vérifié et partagé entre vos projets, et que le tout se régule.

HOLARCH ne refait pas l'orchestration d'agents : les runtimes existants le font et évoluent plus vite que n'importe quel
projet. Il apporte ce qu'aucun d'eux ne fournit d'une session, d'un projet ou d'un outil à l'autre.

> **Statut : étape 2 — Un seul point d'entrée**, en cours ; l'étape 1 (Voir) est close. Les fondations et les
> contrats événement, fiche du catalogue et acteurs sont approuvés ; nœud et règle restent en brouillon (`arbre/`).
> Ce qui marche : inventaire de ce qui est en place (Claude Code et ses connecteurs, dépôts Git, arbre HOLARCH,
> conteneurs et volumes Docker, serveurs MCP de Claude Desktop), journal importé des transcriptions Claude Code
> (sessions, coûts, refus, appels MCP), coût liste, interface web, et HOLARCH servi en MCP aux agents.

## Essayer

```bash
npm install
node bin/holarch.js init     # configuration d'exemple dans ~/.holarch/config.yaml (répertoire : HOLARCH_HOME)
node bin/holarch.js voir     # inventaire + import, puis http://127.0.0.1:4280
npm test                     # tests, sans navigateur
npm run test:visuel          # interface dans Chromium (préparer : npx playwright install --with-deps chromium)
```

### Pour les agents : HOLARCH en MCP

`node bin/holarch.js mcp` sert en MCP (stdio), en lecture, ce que montre l'interface : état et coûts, catalogue, fiches,
sessions, consommation, journal, arbre. Dans ce dépôt, Claude Code le trouve dans `.mcp.json` (à approuver au premier
lancement) ; ailleurs : `claude mcp add holarch -- node <chemin du dépôt>/bin/holarch.js mcp`. Claude Desktop sous Windows,
avec le dépôt dans WSL : une entrée `holarch` de commande `wsl.exe` et d'arguments
`["-e", "node", "<chemin du dépôt dans WSL>/bin/holarch.js", "mcp"]` (variable `HOLARCH_HOME` à passer si les données ne
sont pas à l'emplacement par défaut). Une passerelle qui fédère plusieurs serveurs ne se justifie que là où il y en a à
fédérer (décision `passerelle-par-site`) ; un client qui ne parle que stdio la joint par
`node bin/holarch.js pont http://127.0.0.1:<port>/mcp --cle <fichier>`, qui reprend une session expirée et ferme la sienne.

Node.js ≥ 22.5. Les données (catalogue, journal, index) restent dans `~/.holarch`, jamais dans le dépôt ; rien ne
quitte la machine. Le coût en dollars n'apparaît que si une grille de tarifs, relevée sur la page officielle du
fournisseur, est renseignée dans la configuration : aucun tarif n'est inventé.

### Dans un conteneur de développement

Un conteneur ne voit ni Docker ni Claude Desktop, et ne doit pas recevoir le socket Docker. HOLARCH tourne alors aussi
sur l'hôte, comme un second site qui partage le répertoire de données et n'inventorie que ce que l'hôte voit
(décision [`sources-hote`](arbre/decisions/2026-10-03-sources-hote.md)) :

```bash
# sur l'hôte, avec HOLARCH_HOME pointant vers le répertoire de données monté dans le conteneur
HOLARCH_SITE=hote node bin/holarch.js inventaire    # lit config.yaml, puis config.hote.yaml
```

`config.hote.yaml` désactive ce que le conteneur relève déjà ; l'interface du conteneur montre l'union des sites.

## L'idée en une image

- **Un hub MCP unique** : tous les clients (Desktop, Claude Code, interface web…) passent par lui ; derrière, chaque
  brique et chaque API tourne dans son propre conteneur.
- **Un catalogue** de tout ce qui est en place, **un journal** de tout ce qui se passe, **une interface web** pour
  voir, configurer, administrer.
- **Un seul arbre** (profil → contexte → activité → projet) qui porte les intentions, les règles et la configuration :
  on généralise en posant plus haut, on uniformise des pairs en posant chez leur parent ; le socle fournit des types
  transverses (ensembles de règles) qu'un projet adopte.
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
| `arbre/conception/contrats/` | les contrats : nœud, règle, fiche du catalogue, événement du journal, acteurs |
| `src/`, `bin/`, `test/` | l'implémentation de l'étape en cours (`arbre/conception/etape-1-voir.md`) |
| `CLAUDE.md` | consignes pour une session d'agent dans ce dépôt |

## Licence

MIT — voir [`LICENSE`](LICENSE).
