// Tests de l'étape 3 : accès distant par projet (tranche 1). systemctl est remplacé par un enregistreur : aucun service
// réel n'est touché.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerDistant, declarerConfiance, nomDe } from '../src/distant.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-'));

function banc({ mode = 'auto' } = {}) {
  const racine = tmp(); const unites = tmp(); const cfgClaude = path.join(tmp(), '.claude.json');
  fs.mkdirSync(path.join(racine, 'demo'));
  fs.writeFileSync(cfgClaude, JSON.stringify({ autre: 1, projects: { '/x': { hasTrustDialogAccepted: false, garde: true } } }));
  const appels = []; const actifs = new Set();
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'enable') actifs.add(args.at(-1));
    if (args[0] === 'disable') actifs.delete(args.at(-1));
    return { status: 0, stdout: args[0] === 'is-active' ? (actifs.has(args[1]) ? 'active\n' : 'inactive\n') : '', stderr: '' };
  };
  const config = { inventaire: { 'depots-git': { racines: [racine] }, 'claude-code': { config: cfgClaude } }, acces_distant: { mode_permissions: mode } };
  const projets = [{ id: 'holarch:project:demo', nom: 'demo', location: path.join(racine, 'demo') }];
  return { racine, unites, cfgClaude, appels, d: creerDistant(config, { unites, systemctl, claude: '/opt/outils/claude', projets }) };
}

test('accès distant : activer écrit un service marqué, déclare la confiance et démarre ; desactiver le retire', () => {
  const { racine, unites, cfgClaude, appels, d } = banc();
  assert.deepEqual(d.liste(), []);
  const r = d.activer('demo');
  assert.deepEqual([r.nom, r.chemin, r.unite, r.confiance_declaree], ['demo', path.join(racine, 'demo'), 'holarch-distant-demo.service', true]);
  const texte = fs.readFileSync(path.join(unites, r.unite), 'utf8');
  assert.match(texte, /^# Écrit par HOLARCH/);
  assert.match(texte, new RegExp(`^WorkingDirectory=${path.join(racine, 'demo')}$`, 'm'));
  // Reprise de la dernière session du dossier, sinon une nouvelle (pas de session vide à chaque redémarrage).
  const options = "'--name' 'demo' '--remote-control-session-name-prefix' 'demo' '--permission-mode' 'auto'";
  assert.match(texte, new RegExp(`^ExecStart=/bin/sh -c "'/opt/outils/claude' remote-control --continue ${options} \\|\\| exec '/opt/outils/claude' remote-control ${options}"$`, 'm'));
  assert.match(texte, /^Environment="PATH=\/opt\/outils:/m);
  const c = JSON.parse(fs.readFileSync(cfgClaude, 'utf8'));
  assert.equal(c.projects[path.join(racine, 'demo')].hasTrustDialogAccepted, true);
  assert.deepEqual([c.autre, c.projects['/x']], [1, { hasTrustDialogAccepted: false, garde: true }]);
  assert.deepEqual(appels.slice(0, 2), ['daemon-reload', 'enable --now holarch-distant-demo.service']);
  assert.deepEqual(d.liste(), [{ nom: 'demo', chemin: path.join(racine, 'demo'), projet: 'holarch:project:demo', actif: true }]);
  assert.equal(d.activer('holarch:project:demo').projet, 'holarch:project:demo', 'par son identifiant');
  assert.equal(d.activer(path.join(racine, 'demo')).confiance_declaree, false);
  d.desactiver('demo');
  assert.ok(!fs.existsSync(path.join(unites, r.unite)));
  assert.ok(appels.includes('disable --now holarch-distant-demo.service'));
  assert.deepEqual(d.liste(), []);
});

test('accès distant : projet introuvable refusé, service étranger jamais touché, mode par défaut omis', () => {
  const { unites, d } = banc({ mode: null });
  assert.throws(() => d.activer('absent'), /inconnu du catalogue/);
  fs.writeFileSync(path.join(unites, 'holarch-distant-demo.service'), '[Service]\nExecStart=/bin/true\n');
  assert.throws(() => d.activer('demo'), /pas été écrit par HOLARCH/);
  assert.throws(() => d.desactiver('demo'), /pas été écrit par HOLARCH/);
  assert.deepEqual(d.liste(), []);
  fs.rmSync(path.join(unites, 'holarch-distant-demo.service'));
  d.activer('demo');
  assert.doesNotMatch(fs.readFileSync(path.join(unites, 'holarch-distant-demo.service'), 'utf8'), /--permission-mode/);
  assert.equal(nomDe('/a/mon projet!'), 'mon-projet-');
  const f = path.join(tmp(), 'neuf.json');
  assert.equal(declarerConfiance(f, '/p'), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { projects: { '/p': { hasTrustDialogAccepted: true } } });
});

// ---------------------------------------------------------------- tranche 2 : vue Projets
import { spawnSync } from 'node:child_process';
import { Journal } from '../src/stockage/journal.js';
import { Socle } from '../src/socle.js';
import importerTranscriptions, { cheminsAppel } from '../src/import/claude-code-transcriptions.js';
import { localiserProjet, resoudreProjet } from '../src/projets.js';
import inventaireArbre from '../src/inventaire/arbre.js';
import inventaireDepots from '../src/inventaire/depots-git.js';
import { ulid } from '../src/ulid.js';

const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const vieillir = (f) => { const t = new Date(Date.now() - 3600e3); fs.utimesSync(f, t, t); };
const PROJETS = [{ id: 'holarch:project:a', nom: 'a', location: '/ws/a' }, { id: 'holarch:project:b', nom: 'b', location: '/ws/b' }, { id: 'holarch:project:sous', nom: 'sous', location: '/ws/a/sous' }];

function transcription(home) {
  const f = path.join(home, 'projects', '-ws', 's1.jsonl');
  let n = 0;
  const appel = (cwd, name, input) => JSON.stringify({ type: 'assistant', sessionId: 's1', cwd, timestamp: `2026-10-01T10:0${n}:00Z`, requestId: `r${n}`,
    message: { id: `m${n++}`, model: 'modele-x', content: [{ type: 'tool_use', id: `t${n}`, name, input }], usage: { input_tokens: 1, output_tokens: 5 } } });
  ecrire(f, [
    appel('/ws', 'Read', { file_path: '/ws/a/x.js' }),
    appel('/ws', 'Bash', { command: 'cd /ws/b && git status 2>/dev/null' }),
    appel('/ws/b', 'Bash', { command: 'ls' }),
    appel('/ws/b', 'Bash', { command: 'git -C ../a log --oneline' }),
    appel('/ws/b', 'Edit', { file_path: '/ws/a/sous/y.md', old_string: 'secret', new_string: 'x' }),
    appel('/ws', 'Bash', { command: 'cat /tmp/z' }),
    appel('/ws', 'mcp__holarch__etat', {}),
  ].join('\n') + '\n');
  vieillir(f);
  return f;
}

test('projets : une session se rattache aux projets dont ses appels ont touché le dépôt, sans garder chemins ni commandes', () => {
  assert.deepEqual(cheminsAppel({ command: 'cd b && cat ~/n.txt /etc/x' }, '/ws'), ['/ws/b', path.join(os.homedir(), 'n.txt'), '/etc/x']);
  // Vu d'un conteneur : rattaché par le nom du dépôt si la suite du chemin existe dans le dépôt.
  const existe = (p) => ['/ws/a/src/x.js', '/ws/a/sous'].includes(p);
  const loc = localiserProjet(PROJETS, existe);
  assert.deepEqual(['/home/dev/a/src/x.js', '/home/dev/a/sous', '/home/dev/a/absent', '/home/dev/b/x', '/ws/b/y'].map((p) => loc(p)?.nom ?? null), ['a', 'sous', null, null, 'b']);
  const home = tmp(); const donnees = tmp(); transcription(home);
  const journal = new Journal(donnees, 'local');
  importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees, projets: PROJETS });
  const fin = [...journal.lire()].find((e) => e.kind === 'session.finished');
  assert.deepEqual(fin.data.projets, [{ id: 'holarch:project:a', n: 2 }, { id: 'holarch:project:b', n: 2 }, { id: 'holarch:project:sous', n: 1 }]);
  // Une référence donnée par une personne : identifiant, nom, chemin ; un nom porté par deux projets est refusé.
  assert.deepEqual(['holarch:project:b', 'sous', '/ws/a/x', 'absent'].map((r) => resoudreProjet(PROJETS, r)?.nom ?? null), ['b', 'sous', 'a', null]);
  assert.throws(() => resoudreProjet([...PROJETS, { id: 'holarch:project:a2', nom: 'a', location: '/autre/a' }], 'a'), /ambigu/);
  const tout = JSON.stringify([...journal.lire()]);
  assert.ok(!tout.includes('x.js') && !tout.includes('git status') && !tout.includes('secret') && !tout.includes('/tmp/z'), 'ni chemin, ni commande, ni argument');
});

test('projets : une transcription déjà importée reçoit un complément de projets, et rien d’autre', () => {
  const home = tmp(); const donnees = tmp(); const f = transcription(home);
  const journal = new Journal(donnees, 'local');
  // État de la version 4 : la session, ses coûts et ses appels sont déjà au journal, sous une autre graine.
  ecrire(path.join(donnees, 'import', 'claude-code-transcriptions.json'), JSON.stringify({ 'projects/-ws/s1.jsonl': { v: 4, taille: fs.statSync(f).size, session: true, cumuls: { 'modele-x': { in: 7, cache_write: 0, cache_write_1h: 0, cache_read: 0, out: 35 } } } }));
  const r = importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees, projets: PROJETS });
  const ev = [...journal.lire()];
  assert.deepEqual(ev.map((e) => e.kind), ['session.finished'], `un seul complément (${r.ajoutes} ajouté(s))`);
  assert.equal(ev[0].data.complement, 'projets'); assert.equal(ev[0].data.projets.length, 3); assert.equal(ev[0].data.tours, 7);
  assert.equal(importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees, projets: PROJETS }).fichiers_lus, 0);
});

test('projets : avancement de l’étape, questions, décisions, activité partagée, état du dépôt', () => {
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, web: {}, inventaire: {}, import: {}, tarifs: { modeles: { m: { entree: 0, cache_ecrit: 0, cache_lu: 0, sortie: 1e6 } } } });
  const il_y_a = (j) => new Date(Date.now() - j * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  const ev = [];
  const session = (corr, j, data, usd) => {
    const base = { actor: 'agent:claude-code/m', correlation: corr, classification: 'internal' };
    ev.push({ ...base, id: ulid(Date.parse(il_y_a(j)), `${corr}c`), at: il_y_a(j), kind: 'cost.recorded', data: {}, cost: { provider: 'anthropic', model: 'm', usd_list: null, tokens: { out: usd } } });
    ev.push({ ...base, id: ulid(Date.parse(il_y_a(j)), `${corr}f`), at: il_y_a(j), kind: 'session.finished', data: { sous_agent: false, tours: 4, ...data } });
  };
  session('s1', 1, { cwd: '/ws', projet: 'ws', projets: [{ id: 'holarch:project:a', n: 3 }, { id: 'holarch:project:b', n: 1 }] }, 8);
  session('s2', 10, { cwd: '/ws/b/src', projet: 'src', projets: [] }, 2);
  session('s3', 20, { cwd: '/ws', projet: 'ws' }, 4);
  ev.push({ actor: 'agent:claude-code/m', correlation: 's3', classification: 'internal', id: ulid(Date.parse(il_y_a(20)), 's3x'), at: il_y_a(20), kind: 'session.finished', data: { sous_agent: false, tours: 4, cwd: '/ws', projet: 'ws', projets: [{ id: 'holarch:project:a', n: 1 }], complement: 'projets' } });
  session('s4', 3, { cwd: '/ailleurs', projet: 'ailleurs' }, 1);
  s.journal.ajouter(ev);
  const projet = (nom, attributes) => ({ id: `holarch:project:${nom}`, kind: 'project', name: nom, status: 'active', provenance: { source: 't' }, location: `/ws/${nom}`, attributes });
  const noeud = (projet, rel, type, statut, attributes = {}) => ({ id: `holarch:node:${projet}${rel}`, kind: 'node', name: `${type} ${rel}`, status: 'proposed', provenance: { source: 't' }, location: `/ws/${projet}${rel}`, node: rel, links: { project: [`holarch:project:${projet}`] }, attributes: { type, statut, ...attributes } });
  s.catalogue.remplacer([
    projet('a', { branche: 'main', amont: 'origin/main', en_avance: 2, en_retard: 0, fichiers_modifies: 1, dernier_commit: il_y_a(2), dernier_sujet: 'Un commit' }),
    projet('b', { branche: 'main', amont: 'origin/main', en_avance: 0, en_retard: 0, fichiers_modifies: 0 }),
    projet('c', { branche: 'main', amont: null, fichiers_modifies: 0, dernier_commit: il_y_a(200) }),
    noeud('a', '/arbre/index.md', 'guideline', 'draft', { questions_ouvertes: [{ id: 'Q1', noeud: 'x.md', question: 'Quoi ?', niveau: 'gênant' }] }),
    noeud('a', '/arbre/conception/etape-1-voir.md', 'spec', 'draft', { etape: 1, avancement: [{ etiquette: 'Fait', date: '2026-10-01', texte: 'un', sous: [] }, { etiquette: 'Clôture', date: '2026-10-02', texte: 'close', sous: [] }] }),
    noeud('a', '/arbre/conception/etape-2-agir.md', 'spec', 'draft', { etape: 2, avancement: [{ etiquette: 'Fait', date: '2026-10-03', texte: 'deux', sous: [] }, { etiquette: 'Fait', date: '2026-10-04', texte: 'trois', sous: [] }, { etiquette: 'Reste, hors clôture', date: null, texte: null, sous: ['r1', 'r2'] }] }),
    noeud('a', '/arbre/decisions/d1.md', 'decision', 'draft'),
    noeud('a', '/arbre/decisions/d2.md', 'decision', 'stable'),
  ]);
  s.indexer();
  const { projets, hors_projet } = s.projets();
  const [a, b, c] = ['a', 'b', 'c'].map((n) => projets.find((p) => p.nom === n));
  assert.deepEqual(projets.map((p) => p.nom), ['a', 'b', 'c'], 'rangés par activité récente');
  assert.deepEqual([a.etape.numero, a.etape.faits, a.etape.dernier_fait.texte, a.etape.reste], [2, 2, 'trois', ['r1', 'r2']]);
  assert.deepEqual([a.questions.map((q) => q.id), a.decisions.map((d) => d.titre)], [['Q1'], ['decision /arbre/decisions/d1.md']]);
  assert.deepEqual([a.technique.en_avance, a.technique.fichiers_modifies, a.dernier_commit.sujet], [2, 1, 'Un commit']);
  // s1 : 8 $ partagés 3/4 a, 1/4 b ; s2 : sans dépôt touché, rattachée au dépôt de son répertoire (b) ; s3 : complément (a).
  assert.deepEqual([a.activite.sessions_7, a.activite.sessions_30, a.activite.usd_7, a.activite.usd_30], [1, 2, 6, 10]);
  assert.deepEqual([b.activite.sessions_7, b.activite.sessions_30, b.activite.usd_30], [1, 2, 4]);
  assert.deepEqual([hors_projet.sessions_30, hors_projet.usd_30], [1, 1]);
  assert.deepEqual([a.calme, b.calme, c.calme, c.activite], [false, false, true, null]);
  assert.equal(s.sessions({ jours: 30 }).length, 4, 'le complément ne fait pas une session de plus');
  assert.deepEqual(s.sessions({ jours: 30, projet: 'holarch:project:b' }).map((x) => x.session).sort(), ['s1', 's2']);
  assert.deepEqual(s.sessions({ jours: 30, projet: 'b' }).map((x) => x.session).sort(), ['s1', 's2'], 'par son nom');
  assert.deepEqual(s.sessions({ jours: 30, projet: 'aucun' }).map((x) => x.session), ['s4']);
  assert.equal(s.etat().sessions.total, 4);
  // Le tableau de bord compte comme la vue Projets : même attribution, même partage du coût.
  const conso = Object.fromEntries(s.consommation({ jours: 30, par: 'projet' }).map((x) => [x.cle, x.usd]));
  assert.deepEqual(conso, { 'holarch:project:a': 10, 'holarch:project:b': 4, null: 1 });
  assert.deepEqual(s.arbre().find((n) => n.chemin === '/arbre/index.md').projet, { id: 'holarch:project:a', nom: 'a' });
});

test('projets : l’inventaire lit l’avancement, les questions et l’écart à l’amont sans réseau', async () => {
  const env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@exemple.test', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@exemple.test' };
  Object.assign(process.env, env);
  const g = (d, ...a) => { const r = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  const racine = tmp(); const nu = path.join(racine, 'nu.git'); const depot = path.join(racine, 'demo'); const autre = path.join(racine, 'autre');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', nu]);
  spawnSync('git', ['clone', '-q', nu, depot]);
  ecrire(path.join(depot, 'arbre', 'index.md'), '---\ntype: guideline\ntitle: Racine\nstatus: draft\n---\n');
  ecrire(path.join(depot, 'arbre', 'questions.md'), '# Questions ouvertes\n\n| # | Nœud | Question | Niveau |\n|---|---|---|---|\n| Q3 | `x.md` §1 | Une **question** ? | gênant |\n\n## Résolues\n\n| Q1 | fini | oui |\n');
  ecrire(path.join(depot, 'arbre', 'conception', 'etape-1-demo.md'), '---\ntype: spec\ntitle: Étape 1 — Démo\nstatus: draft\n---\n\n## Avancement\n\n- **Fait (2026-10-01)** : première\n  partie.\n- **Reste** :\n  1. **Un** : à faire\n     suite.\n  2. Deux.\n\n## Hors périmètre\n\n- **Fait (2026-10-09)** : pas ici\n');
  g(depot, 'checkout', '-q', '-b', 'main'); g(depot, 'add', '.'); g(depot, 'commit', '-q', '-m', 'Premier'); g(depot, 'push', '-q', '-u', 'origin', 'main');
  spawnSync('git', ['clone', '-q', nu, autre]); ecrire(path.join(autre, 'f'), 'x'); g(autre, 'add', '.'); g(autre, 'commit', '-q', '-m', 'Ailleurs'); g(autre, 'push', '-q');
  g(depot, 'fetch', '-q'); ecrire(path.join(depot, 'g'), 'y'); g(depot, 'add', '.'); g(depot, 'commit', '-q', '-m', 'Ici');
  const ctx = { site: 'local' };
  const p = inventaireDepots({ racines: [racine], profondeur: 1 }, ctx).find((f) => f.name === 'demo');
  assert.deepEqual([p.attributes.amont, p.attributes.en_avance, p.attributes.en_retard, p.attributes.dernier_sujet], ['origin/main', 1, 1, 'Ici']);
  assert.ok(p.attributes.dernier_fetch);
  const n = inventaireArbre({}, ctx);
  const ici = n.filter((f) => f.location.startsWith(depot + path.sep)); // le clone « autre » porte le même arbre
  const idx = ici.find((f) => f.node === '/arbre/index.md'); const et = ici.find((f) => f.node === '/arbre/conception/etape-1-demo.md');
  assert.deepEqual(idx.attributes.questions_ouvertes, [{ id: 'Q3', noeud: 'x.md §1', question: 'Une question ?', niveau: 'gênant' }]);
  assert.equal(et.attributes.etape, 1);
  assert.deepEqual(et.links.project, [p.id], 'un nœud appartient au projet de son dépôt');
  const { slug } = await import('../src/inventaire/outils.js');
  assert.equal(et.id, `holarch:node:${slug(p.id.slice('holarch:project:'.length) + '/arbre/conception/etape-1-demo.md')}`, 'identifiant fondé sur celui du projet');
  assert.deepEqual(et.attributes.avancement, [{ etiquette: 'Fait', date: '2026-10-01', texte: 'première partie.', sous: [] }, { etiquette: 'Reste', date: null, texte: null, sous: ['Un : à faire suite.', 'Deux.'] }]);
});
