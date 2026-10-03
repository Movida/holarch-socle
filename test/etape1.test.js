// Tests de l'étape 1, sur des données fictives construites dans un répertoire temporaire.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ulid, tempsDe } from '../src/ulid.js';
import { valider } from '../src/contrats/valider.js';
import { Journal } from '../src/stockage/journal.js';
import { Catalogue } from '../src/stockage/catalogue.js';
import inventaireClaudeCode from '../src/inventaire/claude-code.js';
import { trouverDepots } from '../src/inventaire/depots-git.js';
import importerTranscriptions from '../src/import/claude-code-transcriptions.js';
import { Socle } from '../src/socle.js';
import { prix } from '../src/tarifs.js';
import http from 'node:http';
import inventaireDocker from '../src/inventaire/docker.js';
import inventaireClaudeDesktop, { emplacementParDefaut } from '../src/inventaire/claude-desktop.js';
import { SourceAbsente } from '../src/inventaire/source.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-'));
const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const vieillir = (f) => { const t = new Date(Date.now() - 3600e3); fs.utimesSync(f, t, t); };
const ev = (extra = {}) => ({ id: ulid(Date.parse('2026-10-01T10:00:00Z'), JSON.stringify(extra)), at: '2026-10-01T10:00:00Z', kind: 'session.started', actor: 'agent:claude-code/m', data: {}, ...extra });

test('ulid : 26 caractères, triable, déterministe avec une graine', () => {
  const a = ulid(1000, 'x'); const b = ulid(1000, 'x'); const c = ulid(2000, 'x');
  assert.equal(a.length, 26); assert.equal(a, b); assert.ok(c > a); assert.equal(tempsDe(a), 1000);
  assert.notEqual(ulid(1000), ulid(1000));
});

test('contrat événement : site obligatoire, acteur typé', () => {
  assert.equal(valider('evenement', { ...ev(), site: 'local' }), null);
  assert.match(valider('evenement', ev()), /site/);
  assert.match(valider('evenement', { ...ev(), site: 'local', actor: 'quelqu-un' }), /actor/);
});

test('journal : ajout seul, idempotent, refuse l’invalide', () => {
  const j = new Journal(tmp(), 'local');
  const e = ev();
  assert.equal(j.ajouter([e]).ajoutes, 1);
  assert.equal(j.ajouter([e]).ignores, 1);
  assert.equal(j.ajouter([{ ...ev({ data: { a: 1 } }), kind: 'invalide' }]).refuses.length, 1);
  assert.equal([...j.lire()].length, 1);
  assert.equal([...new Journal(j.racine.replace(/\/journal$/, ''), 'local').lire()][0].site, 'local');
});

test('catalogue : instantané par site, apparitions et disparitions', () => {
  const c = new Catalogue(tmp(), 'local');
  const f = (id) => ({ id: `holarch:skill:${id}`, kind: 'skill', name: id, status: 'active', provenance: { source: 't' } });
  assert.deepEqual(c.remplacer([f('a'), f('b')]).apparues.length, 2);
  const r = c.remplacer([f('b'), { id: 'mauvais' }]);
  assert.deepEqual(r.disparues, ['holarch:skill:a']); assert.equal(r.refusees.length, 1); assert.equal(c.lire().length, 1);
});

test('inventaire Claude Code : skills, hooks, MCP sans arguments ni secrets, mémoires', async () => {
  const home = tmp(); const cfg = path.join(home, '..', `${path.basename(home)}.json`);
  ecrire(path.join(home, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Une skill fictive.\n---\n');
  ecrire(path.join(home, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node "/x/garde.js" --secret=abc' }] }] } }));
  ecrire(path.join(home, 'projects', '-p', 'memory', 'note.md'), '---\nname: note\ndescription: Une note.\nmetadata:\n  type: feedback\n---\ncontenu privé');
  fs.mkdirSync(path.join(home, 'projects', '-ancien')); fs.symlinkSync('../-p/memory', path.join(home, 'projects', '-ancien', 'memory'));
  ecrire(cfg, JSON.stringify({ mcpServers: { api: { command: '/usr/bin/serveur', args: ['--token', 'SECRET'], env: { K: 'SECRET' } } }, oauthAccount: { email: 'x@y' } }));
  const fiches = inventaireClaudeCode({ home, config: cfg }, { site: 'local', depots: [] });
  const par = (k) => fiches.filter((f) => f.kind === k);
  assert.equal(par('skill')[0].description, 'Une skill fictive.');
  assert.equal(par('hook')[0].description, 'command : garde.js');
  const { premiereLigne } = await import('../src/inventaire/outils.js');
  assert.equal(premiereLigne('la clé vit seulement ici', 16), 'la clé vit…');
  assert.equal(par('memory')[0].attributes.type, 'feedback');
  assert.equal(par('memory').length, 1, 'un dossier de mémoire en lien n’est pas compté deux fois');
  assert.ok(!JSON.stringify(fiches).includes('SECRET') && !JSON.stringify(fiches).includes('abc') && !JSON.stringify(fiches).includes('contenu privé') && !JSON.stringify(fiches).includes('x@y'));
  for (const f of fiches) assert.equal(valider('fiche', f), null, f.id);
});

test('dépôts Git : trouvés sous les racines, ~ non cité compris comme le répertoire personnel', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'a', '.git'), { recursive: true }); fs.mkdirSync(path.join(r, 'b', 'c', '.git'), { recursive: true });
  assert.deepEqual(trouverDepots({ racines: [r], profondeur: 3 }).map((d) => path.relative(r, d)), ['a', 'b/c']);
  assert.doesNotThrow(() => trouverDepots({ racines: [null], profondeur: 0 }));
});

test('dépôts Git : identifiés par leur premier commit, stables quand ils changent de chemin ; clones départagés', async () => {
  const { default: inventaireDepots } = await import('../src/inventaire/depots-git.js');
  const { spawnSync } = await import('node:child_process');
  const g = (d, ...a) => spawnSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@exemple.test', ...a], { encoding: 'utf8' });
  const r = tmp(); const a = path.join(r, 'a'); fs.mkdirSync(a);
  g(a, 'init', '-q'); g(a, 'commit', '-q', '--allow-empty', '-m', 'premier');
  fs.mkdirSync(path.join(r, 'vide')); g(path.join(r, 'vide'), 'init', '-q');
  const id = (fiches, nom) => fiches.find((f) => f.name === nom).id;
  const f1 = inventaireDepots({ racines: [r], profondeur: 2 }, { site: 'local' });
  assert.match(id(f1, 'a'), /^holarch:project:[0-9a-f]{12}$/);
  assert.match(id(f1, 'vide'), /vide$/);
  fs.renameSync(a, path.join(r, 'a-deplace'));
  assert.equal(id(inventaireDepots({ racines: [r], profondeur: 2 }, { site: 'local' }), 'a-deplace'), id(f1, 'a'));
  spawnSync('git', ['clone', '-q', path.join(r, 'a-deplace'), path.join(r, 'clone')]);
  const f3 = inventaireDepots({ racines: [r], profondeur: 2 }, { site: 'local' });
  assert.notEqual(id(f3, 'clone'), id(f3, 'a-deplace')); assert.ok(id(f3, 'clone').startsWith(id(f1, 'a')));
});

test('catalogue : déplacement et ré-identification deviennent element.moved, pas une disparition', () => {
  const c = new Catalogue(tmp(), 'local');
  const f = (id, location) => ({ id, kind: 'project', name: 'p', status: 'active', provenance: { source: 't' }, location });
  c.remplacer([f('holarch:project:/ancien/chemin', '/ancien/chemin'), f('holarch:project:abc', '/x')]);
  const r = c.remplacer([f('holarch:project:123', '/ancien/chemin'), f('holarch:project:abc', '/y')]);
  assert.deepEqual([r.apparues, r.disparues], [[], []]);
  assert.deepEqual(r.deplacees.map((d) => [d.de.id, d.id, d.de.location, d.vers.location]).sort(), [
    ['holarch:project:/ancien/chemin', 'holarch:project:123', '/ancien/chemin', '/ancien/chemin'], ['holarch:project:abc', 'holarch:project:abc', '/x', '/y']]);
});

test('import des transcriptions : sessions et tokens, dédoublonnage des messages, deltas rejouables', () => {
  const home = tmp(); const donnees = tmp();
  const f = path.join(home, 'projects', '-ws-demo', 's1.jsonl');
  const msg = (id, out, ts) => JSON.stringify({ type: 'assistant', sessionId: 's1', cwd: '/ws/demo', timestamp: ts, requestId: `r${id}`, message: { id: `m${id}`, model: 'modele-x', usage: { input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: out } } });
  ecrire(f, [JSON.stringify({ type: 'user', sessionId: 's1', cwd: '/ws/demo', timestamp: '2026-10-01T10:00:00Z', message: { content: 'bonjour' } }), msg(1, 5, '2026-10-01T10:00:05Z'), msg(1, 5, '2026-10-01T10:00:05Z'), msg(2, 7, '2026-10-01T10:01:00Z')].join('\n') + '\n');
  vieillir(f);
  const journal = new Journal(donnees, 'local');
  const opts = { home, calme_minutes: 10 };
  const r1 = importerTranscriptions(opts, { journal, donnees });
  assert.equal(r1.ajoutes, 3);
  const cout = [...journal.lire()].find((e) => e.kind === 'cost.recorded');
  assert.equal(cout.cost.tokens.out, 12); assert.equal(cout.cost.usd_list, null);
  assert.equal(importerTranscriptions(opts, { journal, donnees }).fichiers_lus, 0);
  fs.appendFileSync(f, msg(3, 4, '2026-10-01T11:00:00Z') + '\n'); vieillir(f);
  const r3 = importerTranscriptions(opts, { journal, donnees });
  assert.equal(r3.ajoutes, 2);
  const couts = [...journal.lire()].filter((e) => e.kind === 'cost.recorded');
  assert.equal(couts.reduce((a, e) => a + e.cost.tokens.out, 0), 16);
  assert.equal([...journal.lire()].filter((e) => e.kind === 'session.started').length, 1);
});

test('configuration : commune, puis propre au site, le site venant de HOLARCH_SITE ou du fichier commun', async () => {
  const { chargerConfig } = await import('../src/config.js');
  const d = tmp(); const f = path.join(d, 'config.yaml');
  ecrire(f, 'site: local\ntarifs: { releve: 2026-10-03 }\n');
  ecrire(path.join(d, 'config.hote.yaml'), 'inventaire:\n  claude-code: { actif: false }\n  docker: { hote: unix:///run/docker.sock }\n');
  const local = chargerConfig(f, undefined); const hote = chargerConfig(f, 'hote');
  assert.equal(local.site, 'local'); assert.equal(local.inventaire['claude-code'].actif, true);
  assert.equal(hote.site, 'hote'); assert.equal(hote.inventaire['claude-code'].actif, false);
  assert.equal(hote.inventaire.docker.hote, 'unix:///run/docker.sock'); assert.equal(hote.inventaire.docker.actif, true);
  assert.equal(hote.tarifs.releve, '2026-10-03');
});

test('tarifs : coût liste linéaire, écriture de cache à une heure, modèle sans tarif inconnu', () => {
  const grille = { modeles: { m: { entree: 4, cache_ecrit: 5, cache_ecrit_1h: 8, cache_lu: 0.2, sortie: 20 } } };
  assert.equal(prix(grille, 'm', { in: 1e6, cache_write: 3e6, cache_write_1h: 2e6, cache_read: 1e7, out: 1e5 }), 4 + 5 + 16 + 2 + 2);
  const a = { in: 10, cache_write: 1000, cache_write_1h: 0, out: 7 }; const b = { cache_write: 0, cache_write_1h: 1000 };
  assert.equal(prix(grille, 'm', a) + prix(grille, 'm', b), prix(grille, 'm', { in: 10, cache_write: 1000, cache_write_1h: 1000, out: 7 }));
  assert.equal(prix(grille, 'autre', a), null); assert.equal(prix({}, 'm', a), null);
  const g2 = { modeles: { 'claude-x-1': { sortie: 10 } } };
  assert.equal(prix(g2, 'anthropic/claude-x-1', { out: 1e6 }), 10);
  assert.equal(prix(g2, 'autre/claude-x-1', { out: 1e6 }), null); assert.equal(prix(g2, 'x', { out: 1e6 }), null);
});

test('import : cache à une heure ventilé, mode rapide à part, complément pour un fichier lu par une version antérieure', () => {
  const home = tmp(); const donnees = tmp();
  const f = path.join(home, 'projects', '-ws-demo', 's2.jsonl');
  const msg = (id, speed) => JSON.stringify({ type: 'assistant', sessionId: 's2', cwd: '/ws/demo', timestamp: `2026-10-01T10:0${id}:00Z`, requestId: `r${id}`, message: { id: `m${id}`, model: 'modele-x', usage: { input_tokens: 1, cache_creation_input_tokens: 30, cache_creation: { ephemeral_5m_input_tokens: 10, ephemeral_1h_input_tokens: 20 }, output_tokens: 5, speed } } });
  ecrire(f, [msg(1, 'standard'), msg(2, 'fast')].join('\n') + '\n'); vieillir(f);
  const journal = new Journal(donnees, 'local'); const opts = { home, calme_minutes: 10 };
  // État laissé par la version 1 de l'import : cumuls sans `cache_write_1h`, sans numéro de version.
  ecrire(path.join(donnees, 'import', 'claude-code-transcriptions.json'), JSON.stringify({ [f]: { taille: fs.statSync(f).size, session: true,
    cumuls: { 'modele-x': { in: 1, cache_write: 30, cache_read: 0, out: 5 }, 'modele-x:rapide': { in: 1, cache_write: 30, cache_read: 0, out: 5 } } } }));
  importerTranscriptions(opts, { journal, donnees });
  const couts = [...journal.lire()].filter((e) => e.kind === 'cost.recorded');
  assert.deepEqual(couts.map((e) => e.cost.model).sort(), ['modele-x', 'modele-x:rapide']);
  for (const e of couts) assert.deepEqual(e.cost.tokens, { in: 0, cache_write: 0, cache_write_1h: 20, cache_read: 0, out: 0 });
  assert.equal(importerTranscriptions(opts, { journal, donnees }).fichiers_lus, 0);
});

test('inventaire Docker : conteneurs et volumes par l’API en lecture, rattachés au projet, sans secrets', async () => {
  const socket = path.join(tmp(), 'docker.sock'); const vus = [];
  const api = { '/containers/json?all=1': [
    { Id: 'a'.repeat(64), Names: ['/boring_yalow'], Image: 'vsc-demo-123', State: 'running', Status: 'Up 2 hours', Created: 1790000000,
      Labels: { 'devcontainer.local_folder': '/home/quelquun/demo', secret: 'SECRET' }, Mounts: [{ Type: 'volume', Name: 'demo-ssh' }, { Type: 'bind', Source: '/x' }] },
    { Id: 'b'.repeat(64), Names: ['/vieux'], Image: 'alpine', State: 'exited', Status: 'Exited (0)', Labels: {}, Mounts: [] }],
  '/volumes': { Volumes: [{ Name: 'demo-ssh', Driver: 'local' }, { Name: 'oublie', Driver: 'local', Labels: null }] } };
  const srv = http.createServer((req, res) => { vus.push(`${req.method} ${req.url}`); res.end(JSON.stringify(api[req.url])); });
  await new Promise((ok) => srv.listen(socket, ok));
  try {
    const fiches = await inventaireDocker({ hote: `unix://${socket}` }, { site: 'local' });
    const par = (n) => fiches.find((f) => f.name === n);
    assert.equal(par('boring_yalow').attributes.projet, 'demo'); assert.equal(par('boring_yalow').status, 'active');
    assert.equal(par('vieux').status, 'suspended');
    assert.deepEqual(par('demo-ssh').attributes.conteneurs, ['boring_yalow']); assert.equal(par('oublie').attributes.orphelin, true);
    assert.ok(!JSON.stringify(fiches).includes('SECRET'));
    assert.ok(vus.every((v) => v.startsWith('GET ')));
    for (const f of fiches) assert.equal(valider('fiche', f), null, f.id);
  } finally { srv.close(); }
  await assert.rejects(inventaireDocker({ hote: `unix://${path.join(tmp(), 'absent.sock')}` }, { site: 'local' }), SourceAbsente);
});

test('inventaire Claude Desktop : serveurs MCP sans arguments ni secrets ; absente là où rien n’est documenté', () => {
  const f = path.join(tmp(), 'claude_desktop_config.json');
  ecrire(f, JSON.stringify({ mcpServers: { fichiers: { command: '/usr/bin/npx', args: ['--token', 'SECRET'], env: { K: 'SECRET' } }, distant: { type: 'http', url: 'https://u:SECRET@mcp.exemple.test/x?cle=SECRET' } } }));
  const fiches = inventaireClaudeDesktop({ config: f }, { site: 'local' });
  assert.deepEqual(fiches.map((x) => x.name).sort(), ['distant', 'fichiers']);
  assert.ok(!JSON.stringify(fiches).includes('SECRET'));
  assert.ok(fiches.every((x) => x.provenance.source === 'inventaire:claude-desktop' && valider('fiche', x) === null));
  assert.throws(() => inventaireClaudeDesktop({ config: path.join(tmp(), 'absent.json') }, { site: 'local' }), SourceAbsente);
  assert.equal(emplacementParDefaut('linux', {}), null);
  assert.match(emplacementParDefaut('win32', { APPDATA: 'C:/Users/x/AppData/Roaming' }), /Claude.claude_desktop_config\.json$/);
  const w = tmp(); const msix = path.join(w, 'Local', 'Packages', 'Claude_abc123', 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json');
  ecrire(msix, '{}');
  assert.equal(emplacementParDefaut('win32', { APPDATA: path.join(w, 'Roaming'), LOCALAPPDATA: path.join(w, 'Local') }), msix, 'installation en paquet MSIX');
  assert.equal(emplacementParDefaut('linux', { WSL_DISTRO_NAME: undefined }), null, 'hors WSL, rien');
});

test('import : refus d’outil repérés par leur message en tête, origine et outil, jamais le contenu', () => {
  const home = tmp(); const donnees = tmp();
  const f = path.join(home, 'projects', '-ws-demo', 's3.jsonl');
  const appel = (id, name, ts) => JSON.stringify({ type: 'assistant', sessionId: 's3', cwd: '/ws/demo', timestamp: ts, requestId: `r${id}`, message: { id: `m${id}`, model: 'modele-x', content: [{ type: 'tool_use', id: `t${id}`, name }], usage: { output_tokens: 1 } } });
  const resultat = (id, contenu, ts, erreur = true) => JSON.stringify({ type: 'user', sessionId: 's3', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: `t${id}`, is_error: erreur, content: contenu }] } });
  ecrire(f, [
    appel(1, 'Bash', '2026-10-01T10:00:00Z'), resultat(1, 'Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Unauthorized Persistence]. rm -rf /secret', '2026-10-01T10:00:01Z'),
    appel(2, 'Edit', '2026-10-01T10:01:00Z'), resultat(2, [{ type: 'text', text: "The user doesn't want to proceed with this tool use. /chemin/prive" }], '2026-10-01T10:01:01Z'),
    appel(3, 'Bash', '2026-10-01T10:02:00Z'), resultat(3, 'PreToolUse:Bash hook error: [garde] non', '2026-10-01T10:02:01Z'),
    appel(4, 'Bash', '2026-10-01T10:03:00Z'), resultat(4, '80 Permission for this action was denied by the Claude Code auto mode classifier', '2026-10-01T10:03:01Z'),
    appel(5, 'Bash', '2026-10-01T10:04:00Z'), resultat(5, 'Permission to use Bash has been denied.', '2026-10-01T10:04:01Z', false),
  ].join('\n') + '\n'); vieillir(f);
  const journal = new Journal(donnees, 'local');
  importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees });
  const refus = [...journal.lire()].filter((e) => e.kind === 'tool.denied');
  assert.deepEqual(refus.map((e) => [e.data.outil, e.data.origine, e.data.categorie]), [['Bash', 'classifieur', 'Unauthorized Persistence'], ['Edit', 'humain', null], ['Bash', 'hook', null]]);
  assert.ok(!JSON.stringify(refus).includes('secret') && !JSON.stringify(refus).includes('prive'));
  assert.equal(importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees }).fichiers_lus, 0);
});

test('import et inventaire : appels MCP au journal sans arguments, usage porté par les fiches des connecteurs', async () => {
  const home = tmp(); const donnees = tmp();
  const f = path.join(home, 'projects', '-ws-demo', 's4.jsonl');
  const appel = (id, name, ts) => JSON.stringify({ type: 'assistant', sessionId: 's4', cwd: '/ws/demo', timestamp: ts, requestId: `r${id}`, message: { id: `m${id}`, model: 'modele-x', content: [{ type: 'tool_use', id: `t${id}`, name, input: { q: 'SECRET' } }], usage: { output_tokens: 1 } } });
  const resultat = (id, contenu, erreur, ts) => JSON.stringify({ type: 'user', sessionId: 's4', timestamp: ts, message: { content: [{ type: 'tool_result', tool_use_id: `t${id}`, is_error: erreur, content: contenu }] } });
  ecrire(f, [
    appel(1, 'mcp__claude_ai_Gmail__search_threads', '2026-10-01T10:00:00Z'), resultat(1, 'réponse PRIVEE', false, '2026-10-01T10:00:01Z'),
    appel(2, 'mcp__serveur_local__lire', '2026-10-01T10:01:00Z'), resultat(2, 'échec', true, '2026-10-01T10:01:01Z'),
    appel(3, 'Bash', '2026-10-01T10:02:00Z'),
  ].join('\n') + '\n'); vieillir(f);
  const journal = new Journal(donnees, 'local');
  importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees });
  const appels = [...journal.lire()].filter((e) => e.kind === 'tool.called');
  assert.deepEqual(appels.map((e) => [e.data.serveur, e.data.outil, e.data.statut]), [['claude_ai_Gmail', 'search_threads', 'ok'], ['serveur_local', 'lire', 'erreur']]);
  assert.ok(!JSON.stringify(appels).includes('SECRET') && !JSON.stringify(appels).includes('PRIVEE'));
  const cfg = path.join(home, 'config.json');
  ecrire(cfg, JSON.stringify({ claudeAiMcpEverConnected: ['claude.ai Gmail', 'claude.ai Drive'] }));
  const appelsMcp = new Map([['claude_ai_Gmail', { count: 3, last_used: '2026-10-01T10:00:00Z' }], ['serveur_local', { count: 1, last_used: '2026-10-01T10:01:00Z' }]]);
  const fiches = inventaireClaudeCode({ home, config: cfg }, { site: 'local', depots: [], appelsMcp }).filter((x) => x.kind === 'connector');
  const par = (n) => fiches.find((x) => x.name === n);
  assert.equal(par('claude.ai Gmail').usage.count, 3); assert.equal(par('claude.ai Drive').usage, undefined);
  assert.equal(par('serveur_local').attributes.portee, 'vu');
  for (const x of fiches) assert.equal(valider('fiche', x), null, x.id);
});

test('socle : chaîne complète vers les lectures de l’interface, sources absentes signalées à part', async () => {
  const donnees = tmp(); const home = tmp();
  const s = new Socle({ site: 'local', donnees, web: {}, tarifs: {}, inventaire: { 'claude-code': { home, config: path.join(home, 'absent.json') }, 'depots-git': { racines: [], profondeur: 1 }, arbre: { depots: [] },
    docker: { hote: `unix://${path.join(home, 'absent.sock')}` }, 'claude-desktop': { config: path.join(home, 'absent-desktop.json') } }, import: { 'claude-code-transcriptions': { home, calme_minutes: 0 } } });
  const r = await s.rafraichir();
  assert.equal(r.inventaire.erreurs.length, 0);
  assert.deepEqual(r.inventaire.absentes.map((a) => a.split(' : ')[0]), ['docker', 'claude-desktop']);
  const e = s.etat();
  assert.equal(e.site, 'local'); assert.ok(e.evenements >= 1);
  assert.deepEqual(s.sessions(), []);
});

test('socle : le coût se calcule à l’indexation depuis la grille, sans réécrire le journal', () => {
  const donnees = tmp();
  const at = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const cout = (model, tokens) => ({ id: ulid(Date.parse(at), model), at, kind: 'cost.recorded', actor: 'agent:claude-code/m', correlation: 's', data: {}, cost: { provider: 'anthropic', model, usd_list: null, tokens } });
  const tarifs = { source: 'https://exemple.test/tarifs', releve: '2026-10-03', modeles: { m: { entree: 0, cache_ecrit: 0, cache_ecrit_1h: 0, cache_lu: 0, sortie: 10 } } };
  const s = new Socle({ site: 'local', donnees, web: {}, tarifs, inventaire: {}, import: {} });
  s.journal.ajouter([cout('m', { out: 2e5 }), cout('inconnu', { out: 1 })]);
  s.indexer();
  const e = s.etat();
  assert.equal(e.tokens.find((t) => t.jours === 30).usd, 2);
  assert.equal(e.tarifs.releve, '2026-10-03');
  assert.deepEqual(e.periode.sans_tarif.map((m) => m.model), ['inconnu']);
  assert.equal(e.periode.tokens.usd, 2); assert.equal(s.etat({ jours: 7 }).periode.jours, 7);
  assert.equal(s.noterVue({ page: 'sessions' }).ajoute, 1); assert.equal(s.noterVue({ page: '../x' }).ajoute, 0);
  assert.deepEqual([s.etat().periode.ui.jours_actifs, s.etat().periode.ui.pages[0].cle], [1, 'sessions']);
  assert.equal([...s.journal.lire()].find((x) => x.kind === 'ui.viewed').actor, 'human:local');
  assert.ok([...s.journal.lire()].filter((x) => x.kind === 'cost.recorded').every((x) => x.cost.usd_list === null));
});

test('serveur MCP : outils en lecture, réponses du socle, par le client officiel sur stdio', async () => {
  const { Client } = await import('@modelcontextprotocol/client');
  const { StdioClientTransport } = await import('@modelcontextprotocol/client/stdio');
  const accueil = tmp();
  const s = new Socle({ site: 'local', donnees: accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([{ id: 'holarch:skill:demo', kind: 'skill', name: 'demo', description: 'Une skill fictive.', status: 'active', provenance: { source: 't' } }]);
  ecrire(path.join(accueil, 'config.yaml'), `site: local\ninventaire: { claude-code: { actif: false }, depots-git: { actif: false }, arbre: { actif: false }, docker: { actif: false }, claude-desktop: { actif: false } }\n`);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: ['--no-warnings', path.resolve('bin/holarch.js'), 'mcp'], env: { ...process.env, HOLARCH_HOME: accueil } }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['arbre', 'catalogue', 'consommation', 'etat', 'fiche', 'journal', 'sessions']);
    assert.ok(tools.every((t) => t.annotations?.readOnlyHint === true), 'tous en lecture');
    const r = await client.callTool({ name: 'catalogue', arguments: { kind: 'skill' } });
    assert.deepEqual(JSON.parse(r.content[0].text).fiches.map((f) => f.name), ['demo']);
    const e = JSON.parse((await client.callTool({ name: 'etat', arguments: { jours: 7 } })).content[0].text);
    assert.equal(e.periode.jours, 7);
  } finally { await client.close(); }
});

test('serveur web : refuse le DNS rebinding et les écritures venues d’un autre site', async () => {
  const { creerServeur } = await import('../src/web/serveur.js');
  const http = await import('node:http');
  const s = new Socle({ site: 'local', donnees: tmp(), web: { hote: '127.0.0.1' }, tarifs: {}, inventaire: {}, import: {} });
  s.indexer();
  const srv = creerServeur(s); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port;
  const req = (method, chemin, entetes = {}) => new Promise((ok) => { const r = http.request({ host: '127.0.0.1', port, method, path: chemin, headers: entetes }, (res) => { res.resume(); ok(res.statusCode); }); r.end(); });
  try {
    assert.equal(await req('GET', '/api/etat'), 200);
    assert.equal(await req('GET', '/api/etat', { Host: `localhost:${port}` }), 200);
    assert.equal(await req('GET', '/api/etat', { Host: 'evil.example' }), 403, 'DNS rebinding');
    assert.equal(await req('GET', '/api/etat', { Host: `evil.example:${port}` }), 403);
    assert.equal(await req('POST', '/api/vue?page=test', { Origin: 'http://evil.example' }), 403, 'écriture depuis un autre site');
    assert.equal(await req('POST', '/api/vue?page=test', { 'Sec-Fetch-Site': 'cross-site' }), 403);
    assert.equal(await req('POST', '/api/vue?page=test', { Origin: `http://127.0.0.1:${port}` }), 200);
  } finally { srv.close(); }
});
