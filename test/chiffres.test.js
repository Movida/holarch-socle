// Tests de la famille Chiffres, lot 2 (revue des limites, décision sorties-mcp-des-chiffres) : les lectures communes de
// l'interface et du serveur MCP (`src/socle.js`) disent des chiffres frais, complets et qui se recoupent d'une vue à l'autre.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { Socle } from '../src/socle.js';
import { creerServeurMcp } from '../src/mcp/serveur.js';
import inventaireArbre from '../src/inventaire/arbre.js';
import { resume } from '../src/contexte.js';
import { tmp } from './temporaire.js';

const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
// Les octets de chaque fichier d'un dossier : une lecture n'en change aucun.
const octets = (d) => (fs.existsSync(d) ? Object.fromEntries(fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, f))
  .filter((f) => fs.statSync(f).isFile()).map((f) => [f, fs.readFileSync(f, 'base64')])) : {});

// Le serveur MCP du socle, en mémoire : `appel(outil, arguments)` rend la réponse lue.
async function mcp(s) {
  const [c, srv] = InMemoryTransport.createLinkedPair();
  await creerServeurMcp(s, '0').connect(srv);
  const client = new Client({ name: 'test', version: '0' }); await client.connect(c);
  return { appel: async (name, args = {}) => JSON.parse((await client.callTool({ name, arguments: args })).content[0].text), fermer: () => client.close() };
}

// Ligne 238 (revue des limites) : les règles, la vue Projets, l'arbre et le seuil de passation se lisaient dans l'index,
// donc dans le catalogue de l'inventaire horaire ; une règle changée restait invisible jusqu'à une heure. Ils lisent
// `arbreFrais` (relu en mémoire quand un arbre a changé), une fois par lecture, sans inventaire ni écriture.
test('238 : règles, projets, arbre et seuil de passation se lisent frais, une fois par lecture, sans rien écrire', async () => {
  const donnees = tmp(); const p = path.join(tmp(), 'profil'); const d = path.join(tmp(), 'depot');
  const profil = (seuil) => ecrire(path.join(p, 'arbre', 'index.md'), `---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nconfig:\n  claude_code: { passation: { seuil_tokens: ${seuil} } }\n---\n`);
  profil(100000);
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: en-place\n  statement: Déjà approuvée.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  const s = new Socle({ site: 'local', profil: p, donnees, accueil: donnees, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [p] } } });
  const projetDe = (x) => (x === d ? { id: 'holarch:project:depot' } : null);
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [p, d], profil: p, projetDe }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', site: 'local', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const lu = () => ({ regles: s.regles({ projet: 'depot' }).regles.map((e) => e.id).sort(), decisions: s.projets().projets[0].decisions.map((x) => x.titre),
    arbre: s.arbre().filter((n) => n.type === 'decision').map((n) => n.titre), seuil: s.contexte().seuil, etat: s.etat().contexte.seuil });
  assert.deepEqual(lu(), { regles: ['en-place'], decisions: [], arbre: [], seuil: 100000, etat: 100000 });
  // Après le catalogue : une règle ajoutée, une décision écrite, le seuil du profil changé.
  fs.appendFileSync(path.join(d, 'arbre', 'rules.yaml'), '- id: nouvelle\n  statement: Ajoutée après l’inventaire.\n');
  ecrire(path.join(d, 'arbre', 'decisions', 'd1.md'), '---\ntype: decision\ntitle: Décision neuve\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  profil(50000);
  const apres = new Date(s.catalogue.date() + 2000);
  for (const f of [path.join(d, 'arbre', 'rules.yaml'), path.join(d, 'arbre', 'decisions', 'd1.md'), path.join(d, 'arbre', 'decisions'), path.join(p, 'arbre', 'index.md')]) fs.utimesSync(f, apres, apres);
  const avant = { catalogue: octets(path.join(donnees, 'catalogue')), journal: octets(path.join(donnees, 'journal')) };
  assert.deepEqual(lu(), { regles: ['en-place', 'nouvelle'], decisions: ['Décision neuve'], arbre: ['Décision neuve'], seuil: 50000, etat: 50000 });
  // Par le serveur MCP (outils en lecture seule) : les mêmes lectures.
  const m = await mcp(s);
  try {
    assert.deepEqual((await m.appel('regles', { projet: 'depot' })).regles.map((e) => e.id).sort(), ['en-place', 'nouvelle']);
    assert.deepEqual((await m.appel('projets')).projets[0].decisions.map((x) => x.titre), ['Décision neuve']);
    assert.ok((await m.appel('arbre')).some((n) => n.titre === 'Décision neuve'));
  } finally { await m.fermer(); }
  assert.deepEqual({ catalogue: octets(path.join(donnees, 'catalogue')), journal: octets(path.join(donnees, 'journal')) }, avant, 'ni inventaire ni journal : rien n’est écrit');
  // Une seule relecture par lecture, passée aux fonctions appelées.
  let n = 0; const frais = s.arbreFrais.bind(s); s.arbreFrais = () => { n++; return frais(); };
  const appels = (f) => { n = 0; f(); return n; };
  assert.deepEqual([appels(() => s.etat()), appels(() => s.projets()), appels(() => s.regles()), appels(() => resume(s, d))], [1, 1, 1, 1]);
});

// V2 (décision sorties-mcp-des-chiffres) : l'état du dépôt était celui du dernier inventaire dans l'interface et le MCP, et
// lu en direct dans la reprise (deux chiffres pour la même chose). Lu en direct partout quand le chemin existe, sinon
// celui du catalogue ; `technique.lu_a` dit d'où vient la valeur. Une seule fonction pour la vue, le tableau de bord et
// la reprise.
import { spawnSync } from 'node:child_process';
const git = (d, ...a) => { const r = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
test('V2 : l’état du dépôt se lit en direct dans la vue Projets, le tableau de bord et la reprise ; lu_a dit d’où il vient', () => {
  const d = path.join(tmp(), 'depot'); fs.mkdirSync(d);
  git(d, 'init', '-q'); git(d, 'config', 'user.name', 'Alice Exemple'); git(d, 'config', 'user.email', 'alice@exemple.test'); git(d, 'config', 'commit.gpgsign', 'false');
  ecrire(path.join(d, 'note.md'), 'un\n'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'départ');
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: {}, import: {}, inventaire: {} });
  const projet = (nom, location, attributes) => ({ id: `holarch:project:${nom}`, kind: 'project', name: nom, status: 'active', site: 'local', location, provenance: { source: 't' }, attributes });
  s.catalogue.remplacer([projet('depot', d, { branche: 'main', fichiers_modifies: 0, amont: null }), projet('absent', path.join(tmp(), 'parti'), { fichiers_modifies: 2, amont: 'origin/main', en_avance: 1, en_retard: 0 }),
    projet('sans-git', tmp(), { fichiers_modifies: 3 })]);
  s.indexer();
  const date = new Date(s.catalogue.date()).toISOString();
  ecrire(path.join(d, 'note.md'), 'deux\n'); // après l'inventaire : non commité
  const avant = new Date().toISOString();
  const vue = Object.fromEntries(s.projets().projets.map((p) => [p.nom, p.technique]));
  const apres = new Date().toISOString();
  assert.equal(vue.depot.fichiers_modifies, 1, 'lu en direct');
  assert.ok(vue.depot.lu_a >= avant && vue.depot.lu_a <= apres, `l’heure de la lecture directe : ${vue.depot.lu_a}`);
  assert.deepEqual(vue.absent, { fichiers_modifies: 2, amont: 'origin/main', en_avance: 1, en_retard: 0, dernier_fetch: null, integration_continue: null, lu_a: date }, 'chemin absent : la valeur du catalogue, datée');
  assert.deepEqual([vue['sans-git'].fichiers_modifies, vue['sans-git'].lu_a], [3, date], 'un chemin que git ne lit pas ne vaut pas zéro');
  const sales = s.etat().projets_sales;
  assert.deepEqual(sales.map((x) => [x.name, x.n]), [['sans-git', 3], ['absent', 2], ['depot', 1]]);
  assert.equal(sales[1].lu_a, date); assert.ok(sales[2].lu_a >= avant);
  // La reprise dit le même chiffre que la vue.
  assert.match(resume(s, d), /Dépôt : 1 fichier\(s\) non commité\(s\), 0 commit\(s\) non poussé\(s\)\./);
});

// V1 (décision sorties-mcp-des-chiffres, contrat événement 0.11.0) : les projets retirés du catalogue sortaient de la vue
// Projets (222,06 $ et 21 sessions sur 182 en 30 jours, comptés nulle part) et s'affichaient ailleurs par leur
// identifiant brut. Un retrait porte désormais le nom et l'emplacement de la fiche retirée ; `projets()` rend `retires`.
import { ulid } from '../src/ulid.js';
const il_y_a = (j) => new Date(Date.now() - j * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
const TARIFS = { modeles: { m: { entree: 0, cache_ecrit: 0, cache_lu: 0, sortie: 1e6 } } }; // 1 $ par token de sortie
// Une session : un coût (`out` tokens, donc `out` $), sa fin ; `data` complète la fin (projets touchés, dossier de départ).
function session(ev, corr, j, data, out) {
  const base = { actor: 'agent:claude-code/m', correlation: corr, classification: 'internal' };
  ev.push({ ...base, id: ulid(Date.parse(il_y_a(j)), `${corr}c`), at: il_y_a(j), kind: 'cost.recorded', data: {}, cost: { provider: 'anthropic', model: 'm', usd_list: null, tokens: { out } } });
  ev.push({ ...base, id: ulid(Date.parse(il_y_a(j)), `${corr}f`), at: il_y_a(j), kind: 'session.finished', data: { sous_agent: false, tours: 4, ...data } });
}
const fiche = (nom, extra = {}) => ({ id: `holarch:project:${nom}`, kind: 'project', name: nom, status: 'active', site: 'local', location: `/ws/${nom}`, provenance: { source: 't' }, ...extra });

test('V1 : un retrait porte le nom et l’emplacement de la fiche retirée', async () => {
  const r = tmp(); const d = path.join(r, 'parti'); fs.mkdirSync(d); git(d, 'init', '-q');
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: {}, import: {}, inventaire: { 'depots-git': { racines: [r], profondeur: 1 } } });
  await s.inventaire();
  const [p] = s.catalogue.lire().filter((f) => f.kind === 'project');
  fs.rmSync(d, { recursive: true });
  assert.equal((await s.inventaire()).disparues.length, 1);
  const retrait = [...s.journal.lire()].find((e) => e.kind === 'element.retired');
  assert.deepEqual([retrait.subject, retrait.data], [p.id, { name: 'parti', location: d }]);
});

test('V1 : projets() rend les projets retirés (activité, nom, date du retrait) ; projets + hors projet + retirés = total', async () => {
  const donnees = tmp(); const ev = [];
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: TARIFS, inventaire: {}, import: {} });
  const id = (n) => `holarch:project:${n}`;
  session(ev, 's1', 1, { cwd: '/ws', projet: 'ws', projets: [{ id: id('a'), n: 3 }, { id: id('r1'), n: 1 }] }, 8);
  session(ev, 's2', 2, { cwd: '/ws/x', projet: 'dossier-x', projets: [{ id: id('r2'), n: 2 }] }, 4);
  session(ev, 's3', 40, { cwd: '/ws/x', projet: 'dossier-x', projets: [{ id: id('r2'), n: 1 }] }, 50);
  session(ev, 's4', 45, { cwd: '/ws/y', projet: 'autre', projets: [{ id: id('r2'), n: 1 }] }, 50);
  session(ev, 's5', 3, { cwd: '/ailleurs', projet: 'ailleurs' }, 1);
  session(ev, 's6', 5, { cwd: '/ws/z', projets: [{ id: id('r3'), n: 1 }] }, 3);
  const evt = (kind, j, extra) => ({ id: ulid(Date.parse(il_y_a(j)), `${kind}${j}`), at: il_y_a(j), kind, classification: 'internal', ...extra });
  ev.push(evt('element.retired', 6, { actor: 'system:inventaire', subject: id('r1'), data: { name: 'ancien-nom', location: '/ws/ancien' } }));
  ev.push(evt('element.retired', 9, { actor: 'system:inventaire', subject: id('r2'), data: {} })); // avant 0.11.0
  ev.push(evt('tool.failed', 2, { actor: 'agent:claude-code/m', correlation: 's2', data: { motif: 'sortie', programme: 'npm', outil: 'Bash' } }));
  s.journal.ajouter(ev);
  s.catalogue.remplacer([fiche('a', { attributes: { fichiers_modifies: 0 } })]); s.indexer();
  const { projets, hors_projet: hors, retires } = s.projets();
  assert.deepEqual(retires.projets, [{ id: id('r1'), nom: 'ancien-nom', retire_le: il_y_a(6) }, { id: id('r2'), nom: 'dossier-x', retire_le: il_y_a(9) }, { id: id('r3'), nom: null, retire_le: null }],
    'nom du dernier retrait ; avant 0.11.0, le dossier de départ le plus fréquent ; sinon null');
  assert.deepEqual(retires.activite, { sessions_7: 3, sessions_30: 3, usd_7: 9, usd_30: 9, sortie_30: 9, derniere_session: il_y_a(1), echecs_7: { n: 1, tests_rouges: 0, garde: 0 } });
  // Bouclage : rien ne sort du compte.
  const total = s.etat().periode.tokens.usd;
  assert.equal(projets.reduce((x, p) => x + (p.activite?.usd_30 || 0), 0) + hors.usd_30 + retires.activite.usd_30, total);
  assert.equal(total, 16);
  // Les autres lectures qui nomment un projet prennent le même nom.
  assert.equal(s.consommation({ jours: 30, par: 'projet' }).find((c) => c.cle === id('r1')).nom, 'ancien-nom');
  assert.deepEqual(s.sessions({ jours: 30 }).find((x) => x.session === 's2').projets.map((p) => p.nom), ['dossier-x']);
  // Le serveur MCP les rend aussi.
  const m = await mcp(s);
  try { assert.deepEqual((await m.appel('projets')).retires, retires); } finally { await m.fermer(); }
  const sansRetrait = new Socle({ ...s.config, donnees: tmp() }); sansRetrait.indexer();
  assert.deepEqual(sansRetrait.projets().retires, { activite: null, projets: [] });
});
