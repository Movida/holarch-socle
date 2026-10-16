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
