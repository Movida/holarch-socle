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

test('tarifs : coût liste linéaire, écriture de cache à une heure, modèle sans tarif inconnu', () => {
  const grille = { modeles: { m: { entree: 4, cache_ecrit: 5, cache_ecrit_1h: 8, cache_lu: 0.2, sortie: 20 } } };
  assert.equal(prix(grille, 'm', { in: 1e6, cache_write: 3e6, cache_write_1h: 2e6, cache_read: 1e7, out: 1e5 }), 4 + 5 + 16 + 2 + 2);
  const a = { in: 10, cache_write: 1000, cache_write_1h: 0, out: 7 }; const b = { cache_write: 0, cache_write_1h: 1000 };
  assert.equal(prix(grille, 'm', a) + prix(grille, 'm', b), prix(grille, 'm', { in: 10, cache_write: 1000, cache_write_1h: 1000, out: 7 }));
  assert.equal(prix(grille, 'autre', a), null); assert.equal(prix({}, 'm', a), null);
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

test('socle : chaîne complète vers les lectures de l’interface', () => {
  const donnees = tmp(); const home = tmp();
  const s = new Socle({ site: 'local', donnees, web: {}, tarifs: {}, inventaire: { 'claude-code': { home, config: path.join(home, 'absent.json') }, 'depots-git': { racines: [], profondeur: 1 }, arbre: { depots: [] } }, import: { 'claude-code-transcriptions': { home, calme_minutes: 0 } } });
  const r = s.rafraichir();
  assert.equal(r.inventaire.erreurs.length, 0);
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
  assert.deepEqual(e.sans_tarif_30j.map((m) => m.model), ['inconnu']);
  assert.ok([...s.journal.lire()].every((x) => x.cost.usd_list === null));
});
