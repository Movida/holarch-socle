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
