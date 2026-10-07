// Tests de l'étape 3 : accès distant par projet (tranche 1). systemctl est remplacé par un enregistreur : aucun service
// réel n'est touché.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerDistant, creerInterface, declarerConfiance, nomDe } from '../src/distant.js';

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

// ---- Tranche 3 : arbre des règles (décision arbre-des-regles). Données fictives.
import { regleEffective, regleDuCompte, fusionnerConfig } from '../src/regles.js';
import { planifier, appliquer, MARQUE } from '../src/regles-claude-code.js';

function arbresFictifs() {
  const r = tmp(); const d = (n) => path.join(r, n);
  const ok = 'status: stable\n    approved: { by: human:alice, at: 2026-10-06 }';
  // Profil : racine, contexte qui déclare deux projets.
  ecrire(path.join(d('profil'), 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\n---\n');
  ecrire(path.join(d('profil'), 'arbre', 'rules.yaml'), `- id: avis-argumente\n  statement: Donner un avis argumenté avant d'appliquer une consigne de conception.\n  why: Une consigne appliquée à la lettre a déjà coûté une reprise.\n  ${ok.replace('\n    ', '\n  ')}\n- id: francais\n  statement: Répondre en français.\n  ${ok.replace('\n    ', '\n  ')}\n- id: secret-du-profil\n  statement: Ne jamais citer le profil.\n  derogable: false\n  ${ok.replace('\n    ', '\n  ')}\n- id: proposee\n  statement: Une règle pas encore approuvée.\n`);
  ecrire(path.join(d('profil'), 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:socle, holarch:project:bundle]\nrules:\n  - id: commit-sur-main\n    statement: Commiter sur main.\n    status: stable\n---\n');
  // Socle : un type transverse, et sa propre racine (projet).
  ecrire(path.join(d('socle'), 'arbre', 'index.md'), '---\ntype: guideline\nid: socle\ntitle: Socle fictif\nstatus: draft\ntypes: [methode]\nderogations:\n  - { rule: francais, why: dépôt en anglais, by: human:alice, at: 2026-10-06 }\n  - { rule: secret-du-profil, why: essai, by: human:alice, at: 2026-10-06 }\n---\n');
  ecrire(path.join(d('socle'), 'arbre', 'rules.yaml'), `- id: tests-verts\n  statement: Les tests passent avant de rendre la main.\n  ${ok.replace('\n    ', '\n  ')}\n- id: avis-argumente\n  statement: Avis argumenté, version du projet.\n  ${ok.replace('\n    ', '\n  ')}\n- id: secret-du-profil\n  statement: Redéfinie, interdit.\n  ${ok.replace('\n    ', '\n  ')}\n`);
  ecrire(path.join(d('socle'), 'arbre', 'types-transverses', 'methode', 'index.md'), '---\ntype: template\nid: methode\ntitle: Méthode fictive\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  ecrire(path.join(d('socle'), 'arbre', 'types-transverses', 'methode', 'rules.yaml'), `- id: jamais-inventer\n  statement: Un fait inconnu se marque, il ne s'invente pas.\n  ${ok.replace('\n    ', '\n  ')}\n- id: garde\n  statement: Bloquer l'envoi sans vérification.\n  level: blocking\n  ${ok.replace('\n    ', '\n  ')}\n- id: doc-courte\n  statement: Les documents de conception restent courts.\n  level: guided\n  applies_to: { paths: ["arbre/**/*.md"] }\n  ${ok.replace('\n    ', '\n  ')}\n`);
  // Bundle OKF : racine à la racine du dépôt, ses documents ne sont pas lus.
  ecrire(path.join(d('bundle'), 'index.md'), '---\nokf_version: "0.2"\ntypes: [methode, inexistant]\n---\n# Bundle\n');
  ecrire(path.join(d('bundle'), 'rules.yaml'), 'pas: une liste\n');
  ecrire(path.join(d('bundle'), 'notes', 'doc.md'), '---\ntype: Protocole\ntitle: Document du bundle\n---\n');
  const ctx = { depots: ['profil', 'socle', 'bundle'].map(d), projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) };
  return { r, d, fiches: inventaireArbre({}, ctx) };
}

test('règles : l’inventaire lit les règles des nœuds, la racine d’un bundle OKF, et signale un rules.yaml invalide', () => {
  const { fiches } = arbresFictifs();
  const regles = fiches.filter((f) => f.kind === 'rule');
  const ids = regles.map((f) => f.id).sort();
  assert.ok(ids.includes('holarch:rule:profil/avis-argumente') && ids.includes('holarch:rule:socle/methode/jamais-inventer') && ids.includes('holarch:rule:profil/contextes/perso/commit-sur-main'), ids.join(' '));
  const avis = regles.find((f) => f.id === 'holarch:rule:profil/avis-argumente');
  assert.deepEqual([avis.status, avis.classification, avis.attributes.niveau, avis.attributes.statut], ['active', 'confidential', 'reminder', 'stable']);
  assert.equal(regles.find((f) => f.name === 'proposee').attributes.statut, 'draft', 'sans statut : brouillon');
  const okf = fiches.filter((f) => f.kind === 'node' && f.location.includes(`${path.sep}bundle${path.sep}`));
  assert.deepEqual(okf.map((f) => f.node), ['/index.md'], 'd’un bundle OKF, seule la racine est lue');
  assert.match(okf[0].attributes.erreur_regles, /liste de règles/);
});

test('règles : règle effective d’un projet (profil, contexte, types, projet), redéfinition, dérogation, non dérogeable', () => {
  const { fiches } = arbresFictifs();
  const e = regleEffective(fiches, 'holarch:project:socle');
  const par = Object.fromEntries(e.regles.map((x) => [x.id, x]));
  assert.deepEqual(e.arbre.types, ['methode']);
  assert.equal(par['avis-argumente'].origine, 'projet', 'le plus spécifique l’emporte');
  assert.deepEqual(par['avis-argumente'].recouvre.map((x) => x.origine), ['profil']);
  assert.equal(par['commit-sur-main'].origine, 'contexte');
  assert.equal(par['jamais-inventer'].origine, 'type');
  assert.equal(par['secret-du-profil'].origine, 'profil', 'une règle non dérogeable tient');
  assert.ok(e.signaux.some((x) => /non dérogeable redéfinie : secret-du-profil/.test(x)) && e.signaux.some((x) => /dérogation refusée : secret-du-profil/.test(x)));
  assert.deepEqual([par.francais.applicable, par.francais.derogee.pourquoi], [false, 'dépôt en anglais']);
  assert.deepEqual([par.proposee.applicable, par.proposee.statut], [false, 'draft'], 'un brouillon se montre, il ne s’applique pas');
  assert.ok(e.rappels > 0);
  const b = regleEffective(fiches, 'holarch:project:bundle');
  assert.ok(b.signaux.some((x) => /type inconnu : inexistant/.test(x)) && b.signaux.some((x) => /liste de règles/.test(x)));
  assert.ok(b.regles.some((x) => x.id === 'jamais-inventer'), 'un bundle OKF adopte un type par sa racine');
  const sans = regleEffective(fiches, 'holarch:project:inconnu');
  assert.ok(sans.signaux.some((x) => /aucun contexte ne déclare/.test(x)) && sans.regles.every((x) => x.origine === 'profil'));
  const c = regleDuCompte(fiches);
  assert.deepEqual(c.regles.map((x) => x.id).sort(), ['avis-argumente', 'commit-sur-main', 'francais', 'proposee', 'secret-du-profil'], 'un seul contexte : profil et contexte au compte');
});

test('règles : l’adaptateur Claude Code écrit un fichier marqué par règle, retire ce qui n’a plus de règle, ne touche pas le reste', () => {
  const { fiches } = arbresFictifs();
  const e = regleEffective(fiches, 'holarch:project:socle');
  const plan = planifier(e.regles, { portee: 'projet', classificationDepot: 'internal' });
  assert.deepEqual(plan.fichiers.map((x) => x.fichier).sort(), ['avis-argumente.md', 'doc-courte.md', 'jamais-inventer.md', 'tests-verts.md']);
  assert.deepEqual(Object.fromEntries(plan.non.map((x) => [x.regle, x.raison])), { garde: 'niveau blocking sans contrôle ni permission' });
  assert.ok(plan.signaux.some((x) => /dérogation à francais sans effet/.test(x)), 'Claude Code additionne les portées : le dire');
  const avis = plan.fichiers.find((x) => x.regle === 'avis-argumente').contenu;
  assert.ok(avis.startsWith(MARQUE) && /prévaut sur celle du même nom posée au niveau du compte/.test(avis));
  assert.match(plan.fichiers.find((x) => x.regle === 'doc-courte').contenu, /^---\npaths:\n {2}- "arbre\/\*\*\/\*\.md"\n---\n/);
  const public_ = planifier(e.regles, { portee: 'projet', classificationDepot: 'public' });
  assert.equal(public_.fichiers.length, 0, 'une règle interne ne s’écrit pas dans un dépôt public');
  assert.match(public_.non.find((x) => x.regle === 'tests-verts').raison, /classification internal plus fermée que le dépôt \(public\)/);
  const dossier = path.join(tmp(), '.claude', 'rules', 'holarch');
  ecrire(path.join(dossier, 'a-la-main.md'), 'règle écrite à la main\n');
  ecrire(path.join(dossier, 'tests-verts.md'), 'écrite à la main, même nom\n');
  ecrire(path.join(dossier, 'ancienne.md'), `${MARQUE}\nrègle retirée de l'arbre\n`);
  const essai = appliquer(dossier, plan, { ecrire: false });
  assert.deepEqual([essai.crees.length, essai.retires, essai.ignores], [3, ['ancienne.md'], ['tests-verts.md']]);
  assert.ok(fs.existsSync(path.join(dossier, 'ancienne.md')), 'un essai n’écrit rien');
  const r = appliquer(dossier, plan);
  assert.deepEqual([r.crees.sort(), r.retires], [['avis-argumente.md', 'doc-courte.md', 'jamais-inventer.md'], ['ancienne.md']]);
  assert.equal(fs.readFileSync(path.join(dossier, 'tests-verts.md'), 'utf8'), 'écrite à la main, même nom\n', 'un fichier non marqué n’est jamais touché');
  assert.ok(fs.existsSync(path.join(dossier, 'a-la-main.md')));
  assert.deepEqual(appliquer(dossier, plan).inchanges.sort(), ['avis-argumente.md', 'doc-courte.md', 'jamais-inventer.md'], 'idempotent');
  const compte = planifier(regleDuCompte(fiches).regles, { portee: 'compte' });
  assert.deepEqual(compte.fichiers.map((x) => x.fichier).sort(), ['avis-argumente.md', 'commit-sur-main.md', 'francais.md', 'secret-du-profil.md']);
});

test('ligne de commande : --help affiche l’aide et une option inconnue arrête tout avant d’agir', () => {
  const accueil = tmp();
  const holarch = (...a) => spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), ...a], { encoding: 'utf8', env: { ...process.env, HOLARCH_HOME: accueil } });
  const aide = holarch('regles', 'appliquer', '--help');
  assert.equal(aide.status, 0);
  assert.match(aide.stdout, /holarch regles appliquer/);
  const r = holarch('regles', 'appliquer', '--essai');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /option inconnue --essai/);
  assert.deepEqual(fs.readdirSync(accueil), [], 'rien n’est écrit');
});

// ---- Tranche 4 : audit de conformité (décision controles-de-regles). Données fictives.
import { listePrivee, chercheur, executer } from '../src/controles.js';
import { crochetDe, poserCrochet } from '../src/garde-git.js';
import { appliquerPermissions, lecturesRefusees } from '../src/regles-claude-code.js';

function depotGit(d = tmp()) {
  const g = (...a) => { const r = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  g('init', '-q'); g('config', 'user.name', 'Alice Exemple'); g('config', 'user.email', 'alice@exemple.test'); g('config', 'commit.gpgsign', 'false');
  return { d, g };
}
const jourIl = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

test('contrôles : liste privée déduite et amendée, mots entiers, un écart dit où sans répéter le terme', () => {
  const { d, g } = depotGit();
  const t = listePrivee({ depot: d, config: { donnees_personnelles: { termes: ['Projet Zeta', { terme: 'zz' }], exceptions: [{ terme: 'alice@exemple.test', pourquoi: 'adresse de test' }] } },
    comptes: [{ home: '/srv/comptes/.claude-pro' }], projetsPrives: ['carnet-prive', 'demo'], nomProjet: 'demo' });
  assert.ok(['Alice Exemple', 'Projet Zeta', 'carnet-prive', '/srv/comptes/.claude-pro', os.homedir()].every((x) => t.includes(x)), t.join(' | '));
  assert.ok(!t.includes('alice@exemple.test') && !t.includes('demo') && !t.includes('zz'), 'exception, nom du projet, terme trop court');
  const c = chercheur(['Projet Zeta', 'carnet-prive']);
  assert.ok(c('voir le projet zeta.') && c('(carnet-prive)') && !c('carnet-priveX') && !c('xcarnet-prive'));
  ecrire(path.join(d, 'a.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'a');
  ecrire(path.join(d, 'a.md'), 'propre\nnote du Projet Zeta\nencore projet zeta\n'); ecrire(path.join(d, 'carnet-prive.txt'), 'x\n'); g('add', '.');
  const ctx = { depot: d, termes: ['Projet Zeta', 'carnet-prive'] };
  const avant = executer('donnees-personnelles', ctx, 'avant-commit');
  assert.deepEqual(avant.ecarts.map((e) => [e.fichier, e.ligne, e.n]).sort(), [['a.md', 2, 2], ['carnet-prive.txt', null, 1]]);
  assert.ok(!/zeta/i.test(JSON.stringify(avant)), 'un écart ne cite jamais le terme trouvé');
  g('commit', '-qm', 'b');
  assert.deepEqual(executer('donnees-personnelles', ctx, 'audit').ecarts.map((e) => e.fichier).sort(), ['a.md', 'carnet-prive.txt']);
  assert.deepEqual(executer('donnees-personnelles', { ...ctx, config: { donnees_personnelles: { exceptions: [{ fichier: 'a.md', pourquoi: 'titulaire du droit d’auteur' }] } } }, 'audit').ecarts.map((e) => e.fichier), ['carnet-prive.txt'], 'un fichier soustrait, avec sa raison');
  assert.deepEqual(fusionnerConfig({ donnees_personnelles: { termes: ['a'] }, journal: 'x' }, { donnees_personnelles: { exceptions: [{ fichier: 'L' }] }, journal: 'y' }),
    { donnees_personnelles: { termes: ['a'], exceptions: [{ fichier: 'L' }] }, journal: 'y' }, 'réglages : objets fusionnés, listes allongées, le plus spécifique l’emporte');
  assert.match(executer('donnees-personnelles', { depot: d, termes: [] }, 'audit').indisponible, /vide/);
  assert.match(executer('inconnu', ctx, 'audit').indisponible, /contrôle inconnu/);
  assert.match(executer('donnees-personnelles', { depot: path.join(d, 'absent'), termes: ['x'] }, 'audit').indisponible, /absent/);
});

test('contrôles : secrets par gitleaks (avant commit, audit du contenu suivi), absent ou en panne : non disponible', () => {
  const { d, g } = depotGit();
  ecrire(path.join(d, 'conf.txt'), 'a\nb\nc\n'); g('add', '.'); g('commit', '-qm', 'x');
  // Un gitleaks fictif : il signale conf.txt, ligne 3, sous le chemin qu'on lui donne.
  const faux = path.join(tmp(), 'gitleaks');
  ecrire(faux, '#!/bin/sh\nif [ "$1" = dir ]; then f="$2/conf.txt"; else f=conf.txt; fi\nprintf \'[{"RuleID":"cle-fictive","File":"%s","StartLine":3}]\' "$f"\nexit 1\n'); fs.chmodSync(faux, 0o755);
  assert.deepEqual(executer('secrets', { depot: d, gitleaks: faux }, 'avant-commit').ecarts.map((e) => [e.fichier, e.ligne, e.message]), [['conf.txt', 3, 'secret possible (cle-fictive)']]);
  assert.deepEqual(executer('secrets', { depot: d, gitleaks: faux }, 'audit').ecarts.map((e) => e.fichier), ['conf.txt'], 'chemin relatif au dépôt');
  assert.match(executer('secrets', { depot: d, gitleaks: null }, 'audit').indisponible, /gitleaks absent/);
  const panne = path.join(tmp(), 'gitleaks'); ecrire(panne, '#!/bin/sh\necho panne >&2\nexit 2\n'); fs.chmodSync(panne, 0o755);
  assert.match(executer('secrets', { depot: d, gitleaks: panne }, 'audit').indisponible, /gitleaks en échec : panne/);
});

test('contrôles : journal tenu, un jour de commits sur l’arbre sans entrée datée', () => {
  const { d, g } = depotGit();
  const [j1, j2, j3] = [jourIl(4), jourIl(3), jourIl(2)];
  const commit = (jour, f, t = jour) => {
    ecrire(path.join(d, f), t); g('add', '.');
    const r = spawnSync('git', ['-C', d, 'commit', '-qm', `${jour} ${f}`], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: `${jour}T12:00:00`, GIT_COMMITTER_DATE: `${jour}T12:00:00` } });
    assert.equal(r.status, 0, r.stderr);
  };
  commit(j1, 'arbre/a.md'); commit(j1, 'arbre/log.md', `# Journal\n\n## ${j1}\n\n* fait\n`);
  commit(j2, 'arbre/b.md'); commit(j3, 'src/x.js'); commit(j3, 'arbre/log.md', `# Journal\n\n## ${j1}\n`);
  const r = executer('journal-tenu', { depot: d, arbre: path.join(d, 'arbre'), config: { journal: 'arbre/log.md' } }, 'audit');
  assert.deepEqual(r.ecarts.map((e) => [e.cle, e.n]), [[`jour:${j2}`, 1]], 'le journal lui-même et ce qui sort de l’arbre ne comptent pas');
  assert.match(executer('journal-tenu', { depot: d, config: {} }, 'audit').indisponible, /réglage journal absent/);
  assert.equal(executer('journal-tenu', { depot: d, config: {} }, 'avant-commit').hors_moment, true);
});

test('garde : crochet de git marqué (posé, inchangé, retiré ; un crochet étranger jamais touché) et lectures refusées du compte', () => {
  const { d } = depotGit();
  const crochet = path.join(d, '.git', 'hooks', 'pre-commit');
  const texte = crochetDe({ node: '/inexistant/node', holarch: '/inexistant/holarch.js', accueil: '/inexistant' });
  assert.equal(poserCrochet(d, texte, { ecrire: false }).etat, 'pose'); assert.ok(!fs.existsSync(crochet), 'rien n’est écrit à blanc');
  assert.equal(poserCrochet(d, texte).etat, 'pose'); assert.equal(poserCrochet(d, texte).etat, 'inchange');
  const r = spawnSync(crochet, { encoding: 'utf8' });
  assert.deepEqual([r.status, /injoignable/.test(r.stderr)], [0, true], 'HOLARCH injoignable : le commit passe, et c’est dit');
  assert.equal(poserCrochet(d, null).etat, 'retire');
  ecrire(crochet, '#!/bin/sh\nexit 0\n');
  assert.deepEqual([poserCrochet(d, texte).etat, poserCrochet(d, null).etat, fs.readFileSync(crochet, 'utf8')], ['ignore', 'ignore', '#!/bin/sh\nexit 0\n']);
  assert.equal(poserCrochet(tmp(), texte).etat, 'hors-git');
  // Un core.hooksPath qui vise un chemin inaccessible (montage d'un conteneur) : dit, sans interrompre la commande.
  const { d: d2, g: g2 } = depotGit(); const bloque = path.join(tmp(), 'ro'); fs.mkdirSync(bloque, { mode: 0o500 });
  g2('config', 'core.hooksPath', path.join(bloque, 'hooks'));
  const e = poserCrochet(d2, texte); if (process.getuid?.() !== 0) assert.deepEqual([e.etat, typeof e.raison], ['erreur', 'string']);

  const home = tmp(); const lu = () => JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  ecrire(path.join(home, 'settings.json'), JSON.stringify({ model: 'x', permissions: { deny: ['Bash(rm -rf / *)', 'Read(//**/.env)'] } }));
  const p1 = appliquerPermissions(home, ['Read(//**/.env)', 'Read(~/.ssh/**)']);
  assert.deepEqual([p1.ajoutees, p1.inchangees], [['Read(~/.ssh/**)'], ['Read(//**/.env)']]);
  assert.deepEqual([lu().model, lu().permissions.deny], ['x', ['Bash(rm -rf / *)', 'Read(//**/.env)', 'Read(~/.ssh/**)']]);
  assert.deepEqual(appliquerPermissions(home, []).retirees, ['Read(~/.ssh/**)'], 'seule l’entrée posée par HOLARCH se retire');
  assert.deepEqual(lu().permissions.deny, ['Bash(rm -rf / *)', 'Read(//**/.env)']);
  assert.deepEqual(lecturesRefusees({ niveau: 'blocking', match: { action: 'read', paths: ['//**/.env'] } }), ['Read(//**/.env)']);
  assert.deepEqual(lecturesRefusees({ niveau: 'reminder', match: { action: 'read', paths: ['//**/.env'] } }), []);
});

test('audit : un commit fautif est refusé par le crochet ; forcé, il apparaît au journal, puis s’y résout', () => {
  const r = tmp(); const accueil = tmp();
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\nconfig:\n  donnees_personnelles:\n    termes: [Projet Zeta]\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\nclassification: public\n---\n');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: rien-de-personnel\n  statement: Aucune donnée personnelle dans un fichier suivi.\n  level: blocking\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(d, 'note.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'départ');
  const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
  ecrire(path.join(accueil, 'config.yaml'), 'site: local\ninventaire: { claude-code: { actif: false }, depots-git: { actif: false }, arbre: { actif: false }, docker: { actif: false }, claude-desktop: { actif: false } }\n');
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();

  const a0 = s.audit({ journaliser: true });
  assert.deepEqual(a0.cibles.find((c) => c.projet === 'holarch:project:depot').ecarts.map((e) => [e.controle, e.message]), [['crochet-pose', 'crochet de git absent']]);
  assert.equal(poserCrochet(d, crochetDe({ holarch: path.resolve('bin/holarch.js'), accueil })).etat, 'pose');

  ecrire(path.join(d, 'note.md'), 'note du projet zeta\n'); g('add', '.');
  const refus = spawnSync('git', ['-C', d, 'commit', '-qm', 'fautif'], { encoding: 'utf8' });
  assert.equal(refus.status, 1, refus.stderr);
  assert.match(refus.stderr, /commit refusé par la règle rien-de-personnel/); assert.match(refus.stderr, /note\.md:1/);
  assert.ok(!/zeta/i.test(refus.stderr), 'le refus ne répète pas le terme');
  g('commit', '-qm', 'forcé', '--no-verify');

  const a1 = s.audit({ journaliser: true });
  assert.deepEqual([a1.journal.apparus, a1.journal.resolus], [1, 1], 'l’écart du commit forcé apparaît, celui du crochet se résout');
  assert.deepEqual(s.regles({ projet: 'holarch:project:depot' }).ecarts.map((e) => [e.controle, e.fichier, e.ligne]), [['donnees-personnelles', 'note.md', 1]]);
  assert.equal(s.projets().projets.find((p) => p.id === 'holarch:project:depot').ecarts, 1);

  ecrire(path.join(d, 'note.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'corrigé');
  assert.deepEqual([s.audit({ journaliser: true }).journal.resolus, s.ecartsOuverts().length], [1, 0]);
  const evs = [...s.journal.lire()].filter((e) => e.kind.startsWith('rule.'));
  assert.deepEqual(evs.map((e) => e.kind), ['rule.violated', 'rule.violated', 'rule.resolved', 'rule.resolved']);
  assert.ok(evs.every((e) => e.actor === 'system:audit' && !/zeta/i.test(JSON.stringify(e))), 'au journal, jamais le terme');
});

test('interface en service : unité marquée qui relit la même configuration, activée puis retirée ; une unité étrangère jamais touchée', () => {
  const unites = tmp(); const appels = [];
  const systemctl = (args) => { appels.push(args.join(' ')); return { status: 0, stdout: args[0] === 'is-active' ? 'active\n' : '', stderr: '' }; };
  const i = creerInterface({ holarch: '/opt/holarch/bin/holarch.js', accueil: '/srv/donnees holarch' }, { unites, systemctl, node: '/opt/node/bin/node' });
  assert.deepEqual(i.etat(), { unite: 'holarch-interface.service', presente: false, geree: false, actif: false });
  i.activer();
  const texte = fs.readFileSync(path.join(unites, 'holarch-interface.service'), 'utf8');
  assert.match(texte, /^# Écrit par HOLARCH/); assert.match(texte, /Environment="HOLARCH_HOME=\/srv\/donnees holarch"/);
  assert.match(texte, /Environment="PATH=\/opt\/node\/bin:[^"]*\/\.local\/bin:/, 'les outils du poste, comme dans un terminal');
  assert.match(texte, /ExecStart="\/opt\/node\/bin\/node" --no-warnings "\/opt\/holarch\/bin\/holarch.js" voir/);
  assert.deepEqual(appels, ['daemon-reload', 'enable --now holarch-interface.service']);
  assert.equal(i.etat().actif, true);
  i.desactiver(); assert.ok(!fs.existsSync(path.join(unites, 'holarch-interface.service')));
  fs.writeFileSync(path.join(unites, 'holarch-interface.service'), '[Service]\n');
  assert.throws(() => i.activer(), /pas été écrit par HOLARCH/); assert.throws(() => i.desactiver(), /pas été écrit par HOLARCH/);
});

// ---- Tranche 5 : veille de sécurité et de versions (décision veille-securite-versions). Données fictives.
import { versionPubliee } from '../src/controles.js';

test('contrôles : dépendances vulnérables au-dessus du seuil, gardées une journée, réinterrogées si le verrou change', () => {
  const { d, g } = depotGit();
  ecrire(path.join(d, 'package-lock.json'), '{"v":1}\n'); ecrire(path.join(d, 'web', 'uv.lock'), 'v1\n'); g('add', '.'); g('commit', '-qm', 'x');
  const appels = path.join(tmp(), 'appels');
  const sortie = JSON.stringify({ results: [{ source: { path: path.join(d, 'package-lock.json') }, packages: [
    { package: { name: 'paquet-a', version: '1.0.0' }, groups: [{ ids: ['GHSA-aaaa'], max_severity: '8.7' }, { ids: ['GHSA-bbbb'], max_severity: '9.8' }], vulnerabilities: [] },
    { package: { name: 'paquet-b', version: '2.0.0' }, groups: [{ ids: ['GHSA-cccc'], max_severity: '5.3' }], vulnerabilities: [] },
    { package: { name: 'paquet-c', version: '3.0.0' }, groups: [{ ids: ['GHSA-dddd'], max_severity: '' }], vulnerabilities: [{ id: 'GHSA-dddd', database_specific: { severity: 'HIGH' } }] }] }] });
  const faux = path.join(tmp(), 'osv-scanner'); ecrire(path.join(path.dirname(faux), 'sortie.json'), sortie);
  ecrire(faux, `#!/bin/sh\necho "$@" >> '${appels}'\ncat '${path.join(path.dirname(faux), 'sortie.json')}'\nexit 1\n`); fs.chmodSync(faux, 0o755);
  const ctx = { depot: d, osv: faux, cache: tmp(), config: {} };
  const r = executer('dependances-vulnerables', ctx, 'audit');
  assert.deepEqual(r.ecarts.map((e) => [e.fichier, e.cle, e.n]), [['package-lock.json', 'package-lock.json:paquet-a@1.0.0', 2], ['package-lock.json', 'package-lock.json:paquet-c@3.0.0', 1]], 'seuil 7 ; à défaut de score, la gravité déclarée');
  assert.match(r.ecarts[0].message, /pire 9\.8, GHSA-bbbb/);
  assert.match(fs.readFileSync(appels, 'utf8'), /-L package-lock\.json -L web\/uv\.lock --format json/);
  executer('dependances-vulnerables', ctx, 'audit');
  assert.equal(fs.readFileSync(appels, 'utf8').trim().split('\n').length, 1, 'une seconde fois dans la journée : rien n’est réinterrogé');
  ecrire(path.join(d, 'package-lock.json'), '{"v":2}\n');
  executer('dependances-vulnerables', ctx, 'audit');
  assert.equal(fs.readFileSync(appels, 'utf8').trim().split('\n').length, 2, 'un verrou changé : réinterrogé');
  assert.deepEqual(executer('dependances-vulnerables', { ...ctx, cache: null, config: { dependances: { seuil_cvss: 5 } } }, 'audit').ecarts.length, 3);
  const panne = path.join(tmp(), 'osv-scanner'); ecrire(panne, '#!/bin/sh\necho "base injoignable" >&2\nexit 127\n'); fs.chmodSync(panne, 0o755);
  assert.match(executer('dependances-vulnerables', { ...ctx, osv: panne, cache: null }, 'audit').indisponible, /osv-scanner en échec : base injoignable/);
  const vide = path.join(tmp(), 'osv-scanner'); ecrire(vide, '#!/bin/sh\nexit 128\n'); fs.chmodSync(vide, 0o755);
  assert.deepEqual(executer('dependances-vulnerables', { ...ctx, osv: vide, cache: null }, 'audit').ecarts, []);
  assert.match(executer('dependances-vulnerables', { ...ctx, osv: null }, 'audit').indisponible, /osv-scanner absent/);
  const sans = depotGit(); ecrire(path.join(sans.d, 'a.md'), 'x'); sans.g('add', '.'); sans.g('commit', '-qm', 'x');
  assert.deepEqual(executer('dependances-vulnerables', { ...ctx, depot: sans.d }, 'audit').ecarts, [], 'sans verrou, rien à scanner');
});

test('contrôles : outils à jour (installé contre publié), introuvable signalé, sources de version', () => {
  const config = { outils_surveilles: [
    { nom: 'outil-a', commande: ['sh', '-c', 'echo outil-a version 1.2.3'], github: 'exemple/outil-a' },
    { nom: 'outil-b', commande: ['sh', '-c', 'echo v2.0.0'], github: 'exemple/outil-b' },
    { nom: 'outil-c', commande: ['/inexistant/outil-c', '--version'], node: 'lts' }] };
  const r = executer('outils-a-jour', { config, publiees: { 'outil-a': 'v1.3.0', 'outil-b': '2.0.0', 'outil-c': 'v24.1.0' } }, 'audit');
  const sansPath = spawnSync(process.execPath, ['--input-type=module', '-e', `import { executer } from '${path.resolve('src/controles.js')}'; console.log(JSON.stringify(executer('outils-a-jour', { config: { outils_surveilles: [{ nom: 'sh', commande: ['sh', '-c', 'echo 1.0.0'], github: 'x/y' }] }, publiees: { sh: '1.0.0' } }, 'audit')))`], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.deepEqual(JSON.parse(sansPath.stdout).ecarts, [], 'un PATH réduit trouve encore un outil du système');
  assert.deepEqual(r.ecarts.map((e) => [e.cle, e.message]), [['outil-a', 'outil-a 1.2.3 installé, 1.3.0 publié'], ['outil-c', 'outil-c introuvable sur ce site']]);
  assert.match(executer('outils-a-jour', { config: {} }, 'audit').indisponible, /outils_surveilles absent/);
  const piege = path.join(tmp(), 'piege');
  assert.equal(executer('outils-a-jour', { config: { outils_surveilles: [{ nom: 'x', commande: [`sh; touch ${piege}`], github: 'x/y' }] }, publiees: { x: '1.0.0' } }, 'audit').ecarts[0].message, 'x introuvable sur ce site');
  assert.ok(!fs.existsSync(piege), 'un nom d’outil ne passe jamais par un shell');
  assert.match(executer('outils-a-jour', { config, publiees: { 'outil-a': 'pas une version' } }, 'audit').indisponible, /illisible pour outil-a/);
  const lu = []; const lire = (u) => { lu.push(u); return u.includes('github') ? { tag_name: 'v8.30.1' } : [{ version: 'v25.0.0', lts: false }, { version: 'v24.11.0', lts: 'Krypton' }]; };
  assert.deepEqual([versionPubliee({ github: 'exemple/outil' }, lire), versionPubliee({ node: 'lts' }, lire)], ['v8.30.1', 'v24.11.0']);
  assert.deepEqual(lu, ['https://api.github.com/repos/exemple/outil/releases/latest', 'https://nodejs.org/dist/index.json']);
});

test('audit : un contrôle de portée site s’exécute au compte, jamais dans chaque projet', () => {
  const r = tmp(); const accueil = tmp();
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: outils-a-jour\n  statement: Les outils du poste restent à jour.\n  level: verified\n  check: [outils-a-jour]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  fs.mkdirSync(path.join(r, 'depot')); depotGit(path.join(r, 'depot'));
  const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil')], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: path.join(r, 'depot'), provenance: { source: 't' } }]);
  s.indexer();
  const a = s.audit();
  const compte = a.cibles.find((c) => c.projet === null); const projet = a.cibles.find((c) => c.projet === 'holarch:project:depot');
  assert.deepEqual(compte.controles.map((c) => [c.id, c.etat]), [['outils-a-jour', 'indisponible']], 'sans liste d’outils : non disponible, jamais conforme');
  assert.deepEqual(projet.controles, [], 'le projet ne le refait pas');
});

// ---- Tranche 6 : consolidation (réglages et briques communes).
import { porteMarque, trouverOutil, shell } from '../src/commun.js';

test('consolidation : les réglages de l’audit agissent, et les briques communes tiennent leurs promesses', () => {
  const { d, g } = depotGit();
  const commit = (jour, f) => { ecrire(path.join(d, f), jour); g('add', '.'); const r = spawnSync('git', ['-C', d, 'commit', '-qm', f], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: `${jour}T12:00:00`, GIT_COMMITTER_DATE: `${jour}T12:00:00` } }); assert.equal(r.status, 0, r.stderr); };
  commit(jourIl(5), 'arbre/a.md'); commit(jourIl(1), 'arbre/b.md'); ecrire(path.join(d, 'arbre', 'log.md'), '# Journal\n'); g('add', '.'); g('commit', '-qm', 'log');
  const ctx = { depot: d, arbre: path.join(d, 'arbre'), config: { journal: 'arbre/log.md' } };
  assert.equal(executer('journal-tenu', ctx, 'audit').ecarts.length, 2);
  assert.equal(executer('journal-tenu', { ...ctx, reglages: { journal_jours: 3 } }, 'audit').ecarts.length, 1, 'fenêtre réglable');
  ecrire(path.join(d, 'gros.txt'), 'x'.repeat(2048) + '\nProjet Zeta\n'); g('add', '.'); g('commit', '-qm', 'gros');
  assert.equal(executer('donnees-personnelles', { depot: d, termes: ['Projet Zeta'] }, 'audit').ecarts.length, 1);
  assert.equal(executer('donnees-personnelles', { depot: d, termes: ['Projet Zeta'], reglages: { taille_max_mo: 0.001 } }, 'audit').ecarts.length, 0, 'taille maximale réglable');
  // Briques communes.
  assert.ok(porteMarque('---\npaths: [x]\n---\n# MARQUE ici\n', '# MARQUE') && !porteMarque('texte\n# MARQUE plus loin'.padStart(2000, '\n'), '# MARQUE'));
  // Un fichier de règle limité à beaucoup de chemins garde sa marque reconnue (en-tête long).
  const regle = { id: 'large', fiche: 'f', enonce: 'Une règle.', niveau: 'guided', statut: 'stable', applicable: true, origine: 'projet', applique_a: { paths: Array.from({ length: 15 }, (_, i) => `d${i}/**`) }, provenance: { arbre: 'a', noeud: '/' }, recouvre: [] };
  const dossier = tmp(); const plan = planifier([regle], { portee: 'projet', classificationDepot: 'internal' });
  appliquer(dossier, plan);
  assert.deepEqual(appliquer(dossier, planifier([{ ...regle, enonce: 'Une règle modifiée.' }], { portee: 'projet', classificationDepot: 'internal' })).modifies, ['large.md']);
  assert.equal(trouverOutil('sh'), trouverOutil('sh') && path.isAbsolute(trouverOutil('sh')) ? trouverOutil('sh') : null, 'chemin absolu seulement');
  assert.equal(trouverOutil('a b'), null); assert.equal(trouverOutil('../sh'), null); assert.ok(trouverOutil('sh'));
  assert.equal(shell("l'outil"), `'l'\\''outil'`);
});

// ---- Tranche 7 : économie du contexte (décision passation-sereine). Données fictives.
import { tailleContexte, alerte, resume } from '../src/contexte.js';
import { reglagesVoulus, appliquerReglages } from '../src/regles-claude-code.js';

test('contexte : taille lue à la fin de la transcription, avis au-delà du seuil seulement', () => {
  const t = path.join(tmp(), 'session.jsonl');
  const reponse = (cr) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, cache_read_input_tokens: cr, cache_creation_input_tokens: 1000, output_tokens: 50 } } });
  ecrire(t, ['{"tronqu', reponse(90000), JSON.stringify({ type: 'user', message: { content: 'suite' } }), reponse(199000), JSON.stringify({ type: 'user', message: { content: 'encore' } })].join('\n') + '\n');
  assert.equal(tailleContexte(t), 200002);
  assert.equal(alerte({ transcription: t, seuil: 250000 }), null, 'sous le seuil : rien');
  const a = alerte({ transcription: t, seuil: 150000 });
  assert.match(a.agent, /200 k tokens.*passation.*\/clear/); assert.match(a.auteur, /passation puis \/clear/);
  assert.equal(tailleContexte(path.join(tmp(), 'absente.jsonl')), null);
  const r = spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), 'contexte', 'alerte', '--seuil', '150000'], { encoding: 'utf8', input: JSON.stringify({ transcript_path: t }), env: { ...process.env, HOLARCH_HOME: tmp() } });
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const vide = spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), 'contexte', 'alerte', '--seuil', '150000'], { encoding: 'utf8', input: 'pas du json', env: { ...process.env, HOLARCH_HOME: tmp() } });
  assert.deepEqual([vide.status, vide.stdout], [0, ''], 'une entrée illisible ne bloque jamais un message');
});

test('réglages Claude Code : posés depuis le profil, valeur posée à la main laissée, retrait de ce que HOLARCH a posé', () => {
  const home = tmp(); const lu = () => JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  ecrire(path.join(home, 'settings.json'), JSON.stringify({ model: 'x', effortLevel: 'high', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a-moi' }] }] } }));
  const config = { claude_code: { reglages: { autoCompactWindow: 300000, effortLevel: 'medium' }, passation: { seuil_tokens: 150000, reprise: true } } };
  const v = reglagesVoulus(config, { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv/donnees' });
  assert.match(v.crochets[0].command, /HOLARCH_HOME='\/srv\/donnees' '\/opt\/node' --no-warnings '\/opt\/holarch\.js' contexte alerte --seuil 150000 2>\/dev\/null \|\| true/);
  assert.equal(v.crochets[1].matcher, 'startup|clear|compact');
  const r1 = appliquerReglages(home, v);
  assert.deepEqual([r1.cles.posees, r1.cles.ignorees, r1.crochets.poses.length], [['autoCompactWindow'], ['effortLevel'], 2], 'une valeur posée à la main est laissée');
  assert.deepEqual([lu().autoCompactWindow, lu().effortLevel, lu().model, lu().hooks.Stop[0].hooks[0].command], [300000, 'high', 'x', 'a-moi']);
  assert.equal(appliquerReglages(home, v).crochets.inchanges.length, 2, 'idempotent');
  // Le seuil change : l'ancien crochet part, le nouveau arrive ; plus de réglage : la clé posée par HOLARCH se retire.
  const v2 = reglagesVoulus({ claude_code: { passation: { seuil_tokens: 200000 } } }, { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv/donnees' });
  const r2 = appliquerReglages(home, v2);
  assert.deepEqual([r2.cles.retirees, r2.crochets.retires.length, r2.crochets.poses.length], [['autoCompactWindow'], 2, 1]);
  assert.deepEqual([lu().autoCompactWindow, Object.keys(lu().hooks).sort()], [undefined, ['Stop', 'UserPromptSubmit']]);
  ecrire(path.join(home, 'settings.json'), '{ cassé');
  assert.throws(() => appliquerReglages(home, v2), /illisible/, 'un settings.json illisible n’est jamais réécrit');
  assert.equal(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'), '{ cassé');
});

test('contexte : résumé de reprise du projet du dossier de travail, court ; rien hors projet', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(path.join(d, 'arbre', 'conception', 'etape-2-demo.md'), `---\ntype: specification\ntitle: Étape 2 — démonstration\nstatus: draft\n---\n\n## Avancement\n\n- **Fait (2026-10-01)** : ${'premier lot livré. '.repeat(30)}\n- **Reste** :\n  1. Second lot.\n`);
  g('add', '.'); g('commit', '-qm', 'x');
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id: 'holarch:project:depot' }) }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const t = resume(s, path.join(d, 'arbre'));
  assert.match(t, /reprise du projet depot/); assert.match(t, /Étape 2 : Étape 2 — démonstration/); assert.match(t, /Reste : Second lot\./);
  assert.ok(t.length <= 1500);
  assert.doesNotMatch(t, /Dépôt :/, 'dépôt propre : rien à dire');
  assert.match(t, /Intégration continue : aucune/);
  // L'état du dépôt se lit en direct, pas dans l'inventaire (qui peut dater de l'heure précédente).
  ecrire(path.join(d, 'brouillon.txt'), 'x');
  assert.match(resume(s, d), /Dépôt : 1 fichier\(s\) non commité\(s\), 0 commit\(s\) non poussé\(s\)\./);
  ecrire(path.join(d, '.gitlab-ci.yml'), 'test: {}\n');
  assert.match(resume(s, d), /Intégration continue : GitLab CI \(lire son résultat après un envoi\)\./);
  assert.equal(resume(s, tmp()), null);
});

import { poserIdentite } from '../src/identite-git.js';
import { materialiserProjet } from '../src/materialisation.js';

test('identité de commit : posée en réglage local, réglage à la main laissé, commit sous une autre identité refusé, écart résolu', () => {
  // Ni l'identité globale de la machine ni une identité laissée dans l'environnement ne doivent compter : un fichier
  // global à lui, sans variables GIT_AUTHOR_* ni GIT_COMMITTER_*.
  const cles = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', ...['AUTHOR', 'COMMITTER'].flatMap((x) => [`GIT_${x}_NAME`, `GIT_${x}_EMAIL`])];
  const avant = Object.fromEntries(cles.map((k) => [k, process.env[k]])); for (const k of cles) delete process.env[k];
  const globale = path.join(tmp(), 'gitconfig'); process.env.GIT_CONFIG_GLOBAL = globale; process.env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    const voulue = { nom: 'Alice Exemple', email: 'alice@noreply.test' };
    const r = tmp(); const accueil = tmp();
    ecrire(globale, '[user]\n\tname = Alice Exemple\n\temail = alice@noreply.test\n');
    ecrire(path.join(r, 'profil', 'arbre', 'index.md'), `---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\nconfig:\n  identite: { nom: ${voulue.nom}, email: ${voulue.email} }\n---\n`);
    ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: identite-de-commit\n  statement: Chaque commit porte l’identité de son contexte.\n  level: blocking\n  check: [identite-de-commit]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
    ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
    fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));  // réglage local posé à la main
    ecrire(path.join(d, 'note.md'), 'un\n'); g('add', '.'); g('commit', '-qm', 'départ');
    const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil')], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
    const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
    s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
    s.indexer();

    const re = s.regles({ projet: 'holarch:project:depot' });
    assert.deepEqual([re.declare, re.config.identite], [true, voulue]);
    const m = materialiserProjet(re, d, { accueil, ecrire: false });
    assert.deepEqual([m.identite.etat, m.crochet.demande?.id], ['ignore', 'identite-de-commit'], 'le réglage local posé à la main est laissé');
    const ecartsDe = (a) => a.cibles.find((c) => c.projet === 'holarch:project:depot').ecarts.map((e) => [e.controle, e.message]);
    const a0 = s.audit({ journaliser: true });
    assert.deepEqual(ecartsDe(a0), [['identite-de-commit', "identité git du dépôt : ne correspond pas à l'identité déclarée (adresse)"], ['crochet-pose', 'crochet de git absent']]);
    assert.ok(!JSON.stringify([...s.journal.lire()]).includes('exemple.test'), 'au journal, jamais l’adresse');

    materialiserProjet(re, d, { accueil, holarch: path.resolve('bin/holarch.js') });
    ecrire(path.join(d, 'note.md'), 'deux\n'); g('add', '.');
    const refus = spawnSync('git', ['-C', d, 'commit', '-qm', 'sous la main'], { encoding: 'utf8' });
    assert.equal(refus.status, 1, refus.stderr); assert.match(refus.stderr, /refusé par la règle identite-de-commit/);
    assert.ok(!/exemple\.test|noreply\.test/.test(refus.stderr), 'le refus ne répète pas les adresses');

    g('config', '--local', '--unset', 'user.name'); g('config', '--local', '--unset', 'user.email');
    g('commit', '-qm', 'sous l’identité déclarée');
    const autre = spawnSync('git', ['-C', d, 'commit', '-q', '--allow-empty', '-m', 'emprunt', '--author', 'Bob <bob@exemple.test>'], { encoding: 'utf8' });
    assert.equal(autre.status, 1, 'un auteur d’emprunt est refusé');
    const a1 = s.audit({ journaliser: true });
    assert.deepEqual([ecartsDe(a1), a1.journal.resolus], [[], 2], 'écart d’identité et crochet absent résolus');

    // Une identité globale différente : HOLARCH pose la déclarée, la met à jour, puis retire ce qu'il a posé.
    ecrire(globale, '[user]\n\tname = Autre\n\temail = autre@exemple.test\n');
    const local = () => [g('config', '--local', '--get', 'user.email').trim()];
    assert.equal(poserIdentite(d, voulue, { ecrire: false }).etat, 'pose');
    assert.deepEqual([poserIdentite(d, voulue).etat, local(), poserIdentite(d, voulue).etat], ['pose', [voulue.email], 'inchange']);
    assert.equal(poserIdentite(d, { ...voulue, email: 'alice2@noreply.test' }).etat, 'modifie');
    assert.deepEqual([poserIdentite(d, null).etat, spawnSync('git', ['-C', d, 'config', '--local', '--get', 'user.email']).status], ['retire', 1]);
    assert.equal(poserIdentite(d, null).etat, 'absent');
    assert.equal(poserIdentite(tmp(), voulue).etat, 'hors-git');
    assert.match(executer('identite-de-commit', { depot: d, config: { identite: voulue }, declare: false }, 'audit').indisponible, /aucun contexte/);
    assert.match(executer('identite-de-commit', { depot: d, config: {}, declare: true }, 'audit').indisponible, /absent/);
  } finally {
    for (const [k, v] of Object.entries(avant)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
