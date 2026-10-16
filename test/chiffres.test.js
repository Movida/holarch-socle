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

// V2, relecture du lot 2 : `git rev-parse` réussit et `git status` échoue (index corrompu, dépôt retiré entre les deux,
// délai dépassé) ; l'état se disait lu en direct avec 0 fichier modifié. Il reprend la valeur du catalogue, datée.
test('V2 : un git status en échec ne vaut pas zéro ; la valeur et la date du catalogue restent', () => {
  const d = path.join(tmp(), 'depot'); fs.mkdirSync(d);
  git(d, 'init', '-q'); git(d, 'config', 'user.name', 'Alice Exemple'); git(d, 'config', 'user.email', 'alice@exemple.test'); git(d, 'config', 'commit.gpgsign', 'false');
  ecrire(path.join(d, 'note.md'), 'un\n'); git(d, 'add', '.'); git(d, 'commit', '-qm', 'départ');
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: {}, import: {}, inventaire: {} });
  const attributs = { branche: 'main', fichiers_modifies: 2, amont: 'origin/main', en_avance: 1, en_retard: 0 };
  s.catalogue.remplacer([{ id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', site: 'local', location: d, provenance: { source: 't' }, attributes: attributs }]);
  s.indexer();
  const date = new Date(s.catalogue.date()).toISOString();
  fs.writeFileSync(path.join(d, '.git', 'index'), 'octets invalides');
  assert.equal(spawnSync('git', ['-C', d, 'status', '--porcelain']).status, 128, 'git status échoue');
  assert.deepEqual(s.projets().projets[0].technique, { fichiers_modifies: 2, amont: 'origin/main', en_avance: 1, en_retard: 0, dernier_fetch: null, integration_continue: null, lu_a: date });
  assert.deepEqual(s.etat().projets_sales, [{ name: 'depot', n: 2, lu_a: date }]);
});

// V1 (décision sorties-mcp-des-chiffres, contrat événement 0.11.0) : les projets retirés du catalogue sortaient de la vue
// Projets (222,06 $ et 21 sessions sur 182 en 30 jours, comptés nulle part) et s'affichaient ailleurs par leur
// identifiant brut. Un retrait porte désormais le nom et l'emplacement de la fiche retirée ; `projets()` rend `retires`.
import { ulid } from '../src/ulid.js';
import { Journal } from '../src/stockage/journal.js';
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

// Relecture du lot 2 : six mutants y restaient verts (premier retrait au lieu du dernier, une session ou un échec sur deux
// retirés compté deux fois, refus de la garde hors du groupe, retraits d'un autre site, `arbre()` sans le nom commun).
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
  // Une session sur deux retirés, avec un échec : une session et un échec, une fois chacun pour le groupe des retirés.
  session(ev, 's7', 2, { cwd: '/ws/z', projets: [{ id: id('r1'), n: 1 }, { id: id('r2'), n: 1 }] }, 2);
  const evt = (kind, j, extra) => ({ id: ulid(Date.parse(il_y_a(j)), `${kind}${j}`), at: il_y_a(j), kind, classification: 'internal', ...extra });
  // Deux retraits de r1 sous deux noms : le dernier fait foi, pour le nom et la date.
  ev.push(evt('element.retired', 8, { actor: 'system:inventaire', subject: id('r1'), data: { name: 'premier-nom', location: '/ws/premier' } }));
  ev.push(evt('element.retired', 6, { actor: 'system:inventaire', subject: id('r1'), data: { name: 'ancien-nom', location: '/ws/ancien' } }));
  ev.push(evt('element.retired', 9, { actor: 'system:inventaire', subject: id('r2'), data: {} })); // avant 0.11.0
  ev.push(evt('tool.failed', 2, { actor: 'agent:claude-code/m', correlation: 's2', data: { motif: 'sortie', programme: 'npm', outil: 'Bash' } }));
  ev.push({ ...evt('tool.failed', 2, { actor: 'agent:claude-code/m', correlation: 's7', data: { motif: 'sortie', programme: 'npm', outil: 'Bash' } }), id: ulid(Date.parse(il_y_a(2)), 's7e') });
  // Un refus de la garde dans le dépôt d'un retiré : compté avec les retirés.
  ev.push(evt('rule.enforced', 3, { actor: 'system:garde', subject: id('r2'), data: { regle: 'x', controle: 'secrets', n: 1, moment: 'avant-commit' } }));
  s.journal.ajouter(ev);
  // Un retrait de r3 sur un autre site : il ne le nomme ni ne le date ici.
  new Journal(donnees, 'ailleurs').ajouter([evt('element.retired', 4, { actor: 'system:inventaire', subject: id('r3'), data: { name: 'autre-site', location: '/ws/r3' } })]);
  const noeud = { id: 'holarch:node:n1', kind: 'node', name: 'Nœud de r1', status: 'active', provenance: { source: 't' }, node: '/arbre/n1.md', links: { project: [id('r1')] } };
  s.catalogue.remplacer([fiche('a', { attributes: { fichiers_modifies: 0 } }), noeud]); s.indexer();
  const { projets, hors_projet: hors, retires } = s.projets();
  assert.deepEqual(retires.projets, [{ id: id('r1'), nom: 'ancien-nom', retire_le: il_y_a(6) }, { id: id('r2'), nom: 'dossier-x', retire_le: il_y_a(9) }, { id: id('r3'), nom: null, retire_le: null }],
    'nom du dernier retrait ; avant 0.11.0, le dossier de départ le plus fréquent ; sinon null');
  assert.deepEqual(retires.activite, { sessions_7: 4, sessions_30: 4, usd_7: 11, usd_30: 11, sortie_30: 11, derniere_session: il_y_a(1), echecs_7: { n: 3, tests_rouges: 0, garde: 1 } });
  // Bouclage : rien ne sort du compte.
  const total = s.etat().periode.tokens.usd;
  assert.equal(projets.reduce((x, p) => x + (p.activite?.usd_30 || 0), 0) + hors.usd_30 + retires.activite.usd_30, total);
  assert.equal(total, 18);
  // Les autres lectures qui nomment un projet prennent le même nom.
  assert.equal(s.consommation({ jours: 30, par: 'projet' }).find((c) => c.cle === id('r1')).nom, 'ancien-nom');
  assert.deepEqual(s.sessions({ jours: 30 }).find((x) => x.session === 's2').projets.map((p) => p.nom), ['dossier-x']);
  assert.deepEqual(s.arbre().find((n) => n.id === noeud.id).projet, { id: id('r1'), nom: 'ancien-nom' });
  // Le serveur MCP les rend aussi.
  const m = await mcp(s);
  try { assert.deepEqual((await m.appel('projets')).retires, retires); } finally { await m.fermer(); }
  const sansRetrait = new Socle({ ...s.config, donnees: tmp() }); sansRetrait.indexer();
  assert.deepEqual(sansRetrait.projets().retires, { activite: null, projets: [] });
});

// V1, relecture du lot 2 : un retiré d'avant 0.11.0 prenait pour nom le dossier de départ le plus fréquent de ses sessions,
// le dossier personnel sur le poste, ou "" pour un départ de `/`. La décision : un nom trompeur se laisse `null`. Un
// dossier de départ qui est l'emplacement d'un projet du catalogue, ou en contient un, ou sans nom, ne nomme pas un retiré.
test('V1 : un retiré d’avant 0.11.0 ne prend pas pour nom un dossier de départ qui est ou contient un projet, ni un nom vide', () => {
  const donnees = tmp(); const ev = [];
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: TARIFS, inventaire: {}, import: {} });
  const id = (n) => `holarch:project:${n}`;
  session(ev, 's1', 1, { cwd: '/ws', projet: 'ws', projets: [{ id: id('ra'), n: 1 }] }, 1); // contient /ws/a
  session(ev, 's2', 1, { cwd: '/ws', projet: 'ws', projets: [{ id: id('rb'), n: 1 }] }, 1);
  session(ev, 's3', 2, { cwd: '/ws', projet: 'ws', projets: [{ id: id('rb'), n: 1 }] }, 1);
  session(ev, 's4', 3, { cwd: '/ws/b', projet: 'b', projets: [{ id: id('rb'), n: 1 }] }, 1); // son dossier : il le nomme
  session(ev, 's5', 3, { cwd: '/', projet: '', projets: [{ id: id('rc'), n: 1 }] }, 1);
  session(ev, 's6', 4, { cwd: '/ws/a', projet: 'a', projets: [{ id: id('rd'), n: 1 }] }, 1); // l'emplacement de a
  for (const [n, r] of ['ra', 'rb', 'rc', 'rd'].entries()) ev.push({ id: ulid(Date.parse(il_y_a(6)), `retrait${r}`), at: il_y_a(6 + n), kind: 'element.retired', actor: 'system:inventaire', subject: id(r), data: {}, classification: 'internal' });
  s.journal.ajouter(ev);
  s.catalogue.remplacer([fiche('a', { attributes: {} })]); s.indexer();
  assert.deepEqual(s.projets().retires.projets.map((p) => [p.id, p.nom]), [[id('ra'), null], [id('rb'), 'b'], [id('rc'), null], [id('rd'), null]]);
});

// V3 (décision sorties-mcp-des-chiffres) : « Tours » comptait la session seule dans la colonne de l'interface, les
// sous-agents compris dans le MCP (72 sessions sur 182 différaient). `tours` garde son sens dans le MCP (total) ;
// `tours_session` s'ajoute (la session seule).
test('V3 : l’outil MCP sessions rend tours (sous-agents compris) et tours_session (la session seule)', async () => {
  const donnees = tmp(); const ev = [];
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: TARIFS, inventaire: {}, import: {} });
  session(ev, 's1', 1, { cwd: '/ws', projet: 'ws', tours: 8 }, 2);
  ev.push({ id: ulid(Date.parse(il_y_a(1)), 's1:a'), at: il_y_a(1), kind: 'session.finished', actor: 'agent:claude-code/m', correlation: 's1:agent-1', classification: 'internal', data: { sous_agent: true, tours: 4 } });
  session(ev, 's2', 2, { cwd: '/ws', projet: 'ws', tours: 5 }, 1);
  s.journal.ajouter(ev); s.indexer();
  const m = await mcp(s);
  try {
    const l = (await m.appel('sessions')).sessions.map((x) => [x.session, x.tours, x.tours_session]);
    assert.deepEqual(l, [['s1', 12, 8], ['s2', 5, 5]]);
  } finally { await m.fermer(); }
});

// Ligne 239 a (décision sorties-mcp-des-chiffres) : un appel MCP de statut inconnu (`null` : passerelle, ou appel sans
// résultat) entrait dans le total sans entrer dans les échecs ; `periode.mcp[]` gagne `inconnus`.
test('239 a : les appels MCP de statut inconnu se comptent à part (inconnus), à côté du total et des échecs', async () => {
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: {}, inventaire: {}, import: {} });
  const appel = (n, statut) => ({ id: ulid(Date.parse(il_y_a(1)), `a${n}`), at: il_y_a(1), kind: 'tool.called', actor: 'agent:claude-code/m', correlation: 's1', classification: 'internal', data: { serveur: 'holarch', outil: 'etat', ...(statut !== undefined && { statut }) } });
  s.journal.ajouter([appel(1, 'ok'), appel(2, 'erreur'), appel(3, null), appel(4)]); s.indexer();
  assert.deepEqual(s.etat().periode.mcp.map((x) => ({ ...x })), [{ cle: 'holarch', n: 4, echecs: 1, inconnus: 2 }]);
  const m = await mcp(s);
  try { assert.deepEqual((await m.appel('etat')).periode.mcp, [{ cle: 'holarch', n: 4, echecs: 1, inconnus: 2 }]); } finally { await m.fermer(); }
});

// V5 (revue des limites) : la carte d'un projet montre sa part du coût (partagé entre les projets où chaque session a
// travaillé, coûts datés dans la période), la liste de ses sessions le coût entier de chacune, sur 90 jours. `sessions()`
// filtrée par un projet rend la part de ce projet pour chaque session, tirée du même partage, sur la même période.
test('V5 : la liste des sessions d’un projet rend sa part de chaque session ; leur somme est le chiffre de la carte', async () => {
  const donnees = tmp(); const ev = [];
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: TARIFS, inventaire: {}, import: {} });
  const id = (n) => `holarch:project:${n}`;
  session(ev, 's1', 1, { cwd: '/ws', projet: 'ws', projets: [{ id: id('a'), n: 3 }, { id: id('b'), n: 1 }] }, 8);
  session(ev, 's2', 10, { cwd: '/ws/b/src', projet: 'src', projets: [] }, 2);
  session(ev, 's3', 20, { cwd: '/ws', projet: 'ws', projets: [{ id: id('a'), n: 1 }] }, 4);
  // À cheval sur le début de la période : 5 $ avant, 3 $ dedans.
  session(ev, 's4', 29, { cwd: '/ws', projet: 'ws', projets: [{ id: id('a'), n: 1 }] }, 3);
  ev.push({ id: ulid(Date.parse(il_y_a(31)), 's4c0'), at: il_y_a(31), kind: 'cost.recorded', actor: 'agent:claude-code/m', correlation: 's4:agent-1', classification: 'internal', data: {}, cost: { provider: 'anthropic', model: 'm', usd_list: null, tokens: { out: 5 } } });
  session(ev, 's5', 3, { cwd: '/ailleurs', projet: 'ailleurs' }, 1);
  session(ev, 's6', 4, { cwd: '/ws', projet: 'ws', projets: [{ id: id('ancien'), n: 1 }] }, 7);
  s.journal.ajouter(ev);
  s.catalogue.remplacer([fiche('a', { attributes: {} }), fiche('b', { location: '/ws/b', attributes: {} })]); s.indexer();
  const { projets, hors_projet: hors } = s.projets();
  const a = projets.find((p) => p.nom === 'a');
  const parts = (jours, projet) => s.sessions({ jours, projet }).map((x) => [x.session, x.part]);
  assert.deepEqual(parts(30, 'a'), [['s1', 6], ['s3', 4], ['s4', 3]]);
  assert.equal(s.sessions({ jours: 30, projet: 'a' }).find((x) => x.session === 's4').usd, 8, 'le coût entier reste');
  const somme = (l) => l.reduce((x, [, p]) => x + p, 0);
  assert.deepEqual([somme(parts(30, 'a')), somme(parts(7, 'a')), somme(parts(30, 'b'))], [a.activite.usd_30, a.activite.usd_7, projets.find((p) => p.nom === 'b').activite.usd_30]);
  assert.equal(somme(parts(30, 'aucun')), hors.usd_30, 'hors projet : le même partage');
  assert.deepEqual(parts(30, id('ancien')), [['s6', 7]], 'un projet retiré se désigne par son identifiant');
  assert.equal(s.sessions({ jours: 30 })[0].part, undefined, 'sans filtre, pas de part');
  assert.throws(() => s.sessions({ projet: id('inconnu') }), /projet inconnu/);
  const m = await mcp(s);
  try { assert.deepEqual((await m.appel('sessions', { projet: 'a' })).sessions.map((x) => [x.session, x.part]), [['s1', 6], ['s3', 4], ['s4', 3]]); } finally { await m.fermer(); }
});

// V6 (revue des limites ; choix de l'auteur : jour local du poste) : l'histogramme rangeait le coût par jour UTC, la
// liste des sessions d'un jour filtrait par jour UTC de fin, alors que les dates s'affichent en heure locale. Le jour est
// partout le jour local du poste ; la liste d'un jour rend les sessions qui ont un coût ce jour-là, et se somme à la barre.
// Le fuseau est fixé pour le test : Node et SQLite suivent `process.env.TZ`, posé en cours d'exécution (vérifié).
test('V6 : l’histogramme et la liste d’un jour comptent par jour local ; un coût à 23 h 30 UTC va au jour local suivant', () => {
  const fuseau = process.env.TZ; process.env.TZ = 'Europe/Paris';
  try {
    const donnees = tmp(); const ev = [];
    const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: TARIFS, inventaire: {}, import: {} });
    const u = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10); // un jour UTC
    const a = (jour, h) => new Date(`${jour}T${h}:00Z`).toISOString().replace(/\.\d+Z$/, 'Z');
    const lendemain = new Date(Date.parse(`${u}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
    const cout = (corr, at, out) => ev.push({ id: ulid(Date.parse(at), `${corr}${at}`), at, kind: 'cost.recorded', actor: 'agent:claude-code/m', correlation: corr, classification: 'internal', data: {}, cost: { provider: 'anthropic', model: 'm', usd_list: null, tokens: { out } } });
    const fin = (corr, at, projets = []) => ev.push({ id: ulid(Date.parse(at), `${corr}f`), at, kind: 'session.finished', actor: 'agent:claude-code/m', correlation: corr, classification: 'internal', data: { sous_agent: false, tours: 1, cwd: '/ws', projet: 'ws', projets } });
    cout('s1', a(u, '23:30'), 1); fin('s1', a(u, '23:35')); // 01 h 30 à Paris : le lendemain local
    cout('s2', a(lendemain, '10:00'), 2); fin('s2', a(lendemain, '10:05'));
    cout('s3', a(u, '21:00'), 4); cout('s3', a(lendemain, '08:00'), 8); fin('s3', a(lendemain, '08:05'), [{ id: 'holarch:project:a', n: 1 }]); // deux jours locaux
    s.journal.ajouter(ev); s.catalogue.remplacer([fiche('a', { attributes: {} })]); s.indexer();
    const jours = Object.fromEntries(s.consommation({ jours: 30, par: 'jour' }).map((x) => [x.cle, [x.sortie, x.usd]]));
    assert.deepEqual(jours, { [u]: [4, 4], [lendemain]: [11, 11] }, 'par jour local');
    const liste = s.sessions({ jours: 30, jour: lendemain });
    assert.deepEqual(liste.map((x) => [x.session, x.usd_jour, x.sortie_jour]).sort(), [['s1', 1, 1], ['s2', 2, 2], ['s3', 8, 8]]);
    const somme = (k) => liste.reduce((x, y) => x + y[k], 0);
    assert.deepEqual([somme('sortie_jour'), somme('usd_jour')], jours[lendemain], 'la liste se somme à la barre');
    assert.deepEqual(s.sessions({ jours: 30, jour: u }).map((x) => [x.session, x.usd_jour]), [['s3', 4]], 's1 a fini le jour UTC, mais pas le jour local');
    // Filtrée par un projet et un jour : `usd_jour` ne compte que ce jour, `part` reste sur la période.
    assert.deepEqual(s.sessions({ jours: 30, jour: lendemain, projet: 'a' }).map((x) => [x.session, x.usd_jour, x.sortie_jour, x.part, x.usd]), [['s3', 8, 8, 12, 12]]);
  } finally { if (fuseau === undefined) delete process.env.TZ; else process.env.TZ = fuseau; }
});

// V6, relecture du lot 2 (choix de l'auteur : jour local partout) : l'audit datait le retrait d'un projet déclaré par son
// jour UTC (« retiré de l'inventaire le D »), la vue Projets le même retrait par son jour local.
test('V6 : l’audit date le retrait d’un projet déclaré par son jour local ; à 23 h 30 UTC, le jour suivant à Paris', () => {
  const fuseau = process.env.TZ; process.env.TZ = 'Europe/Paris';
  try {
    const donnees = tmp(); const p = path.join(tmp(), 'profil');
    ecrire(path.join(p, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\n---\n');
    ecrire(path.join(p, 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:parti]\n---\n');
    const s = new Socle({ site: 'local', profil: p, donnees, accueil: donnees, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [p] } } });
    const at = '2026-10-15T23:30:00Z';
    s.journal.ajouter([{ id: ulid(Date.parse(at), 'retrait'), at, kind: 'element.retired', actor: 'system:inventaire', subject: 'holarch:project:parti', data: { name: 'parti', location: '/ws/parti' }, classification: 'internal' }]);
    s.catalogue.remplacer(inventaireArbre({}, { depots: [p], profil: p, projetDe: () => null })); s.indexer();
    const e = s.audit({}).cibles.find((x) => x.projet === null).ecarts.find((x) => x.cle === 'projet-absent:holarch:project:parti');
    assert.match(e?.message ?? '', /\(retiré de l’inventaire le 2026-10-16\)/);
  } finally { if (fuseau === undefined) delete process.env.TZ; else process.env.TZ = fuseau; }
});
