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

test('inventaire Claude Code : skills, hooks, MCP sans arguments ni secrets, mémoires', () => {
  const home = tmp(); const cfg = path.join(home, '..', `${path.basename(home)}.json`);
  ecrire(path.join(home, 'skills', 'demo', 'SKILL.md'), '---\nname: demo\ndescription: Une skill fictive.\n---\n');
  ecrire(path.join(home, 'settings.json'), JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node /x/garde.js --secret=abc' }] }] } }));
  ecrire(path.join(home, 'projects', '-p', 'memory', 'note.md'), '---\nname: note\ndescription: Une note.\nmetadata:\n  type: feedback\n---\ncontenu privé');
  ecrire(cfg, JSON.stringify({ mcpServers: { api: { command: '/usr/bin/serveur', args: ['--token', 'SECRET'], env: { K: 'SECRET' } } }, oauthAccount: { email: 'x@y' } }));
  const fiches = inventaireClaudeCode({ home, config: cfg }, { site: 'local', depots: [] });
  const par = (k) => fiches.filter((f) => f.kind === k);
  assert.equal(par('skill')[0].description, 'Une skill fictive.');
  assert.equal(par('hook')[0].description, 'command : garde.js');
  assert.equal(par('memory')[0].attributes.type, 'feedback');
  assert.ok(!JSON.stringify(fiches).includes('SECRET') && !JSON.stringify(fiches).includes('abc') && !JSON.stringify(fiches).includes('contenu privé') && !JSON.stringify(fiches).includes('x@y'));
  for (const f of fiches) assert.equal(valider('fiche', f), null, f.id);
});

test('dépôts Git : trouvés sous les racines, ~ non cité compris comme le répertoire personnel', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'a', '.git'), { recursive: true }); fs.mkdirSync(path.join(r, 'b', 'c', '.git'), { recursive: true });
  assert.deepEqual(trouverDepots({ racines: [r], profondeur: 3 }).map((d) => path.relative(r, d)), ['a', 'b/c']);
  assert.doesNotThrow(() => trouverDepots({ racines: [null], profondeur: 0 }));
});

test('import des transcriptions : sessions et tokens, dédoublonnage des messages, deltas rejouables', () => {
  const home = tmp(); const donnees = tmp();
  const f = path.join(home, 'projects', '-ws-demo', 's1.jsonl');
  const msg = (id, out, ts) => JSON.stringify({ type: 'assistant', sessionId: 's1', cwd: '/ws/demo', timestamp: ts, requestId: `r${id}`, message: { id: `m${id}`, model: 'modele-x', usage: { input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: out } } });
  ecrire(f, [JSON.stringify({ type: 'user', sessionId: 's1', cwd: '/ws/demo', timestamp: '2026-10-01T10:00:00Z', message: { content: 'bonjour' } }), msg(1, 5, '2026-10-01T10:00:05Z'), msg(1, 5, '2026-10-01T10:00:05Z'), msg(2, 7, '2026-10-01T10:01:00Z')].join('\n') + '\n');
  vieillir(f);
  const journal = new Journal(donnees, 'local');
  const opts = { home, calme_minutes: 10 };
  const r1 = importerTranscriptions(opts, { journal, donnees, tarifs: { 'modele-x': { entree: 0, cache_ecrit: 0, cache_lu: 0, sortie: 1e6 } } });
  assert.equal(r1.ajoutes, 3);
  const cout = [...journal.lire()].find((e) => e.kind === 'cost.recorded');
  assert.equal(cout.cost.tokens.out, 12); assert.equal(cout.cost.usd_list, 12);
  assert.equal(importerTranscriptions(opts, { journal, donnees, tarifs: {} }).fichiers_lus, 0);
  fs.appendFileSync(f, msg(3, 4, '2026-10-01T11:00:00Z') + '\n'); vieillir(f);
  const r3 = importerTranscriptions(opts, { journal, donnees, tarifs: {} });
  assert.equal(r3.ajoutes, 2);
  const couts = [...journal.lire()].filter((e) => e.kind === 'cost.recorded');
  assert.equal(couts.reduce((a, e) => a + e.cost.tokens.out, 0), 16);
  assert.equal([...journal.lire()].filter((e) => e.kind === 'session.started').length, 1);
});

test('socle : chaîne complète vers les lectures de l’interface', () => {
  const donnees = tmp(); const home = tmp();
  const s = new Socle({ site: 'local', donnees, web: {}, tarifs: {}, inventaire: { 'claude-code': { home, config: path.join(home, 'absent.json') }, 'depots-git': { racines: [], profondeur: 1 }, arbre: { depots: [] } }, import: { 'claude-code-transcriptions': { home, calme_minutes: 0 } } });
  const r = s.rafraichir();
  assert.equal(r.inventaire.erreurs.length, 0);
  const e = s.etat();
  assert.equal(e.site, 'local'); assert.ok(e.evenements >= 1);
  assert.deepEqual(s.sessions(), []);
});
