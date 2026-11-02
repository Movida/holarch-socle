// Tests de la décision membres-du-hub : HOLARCH, membre du hub, dit son état selon le contrat etat-de-membre (statut,
// dernière activité, résumé), dans sa lecture commune `etat()` et en sortie déclarée de l'outil MCP `etat`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { Socle } from '../src/socle.js';
import { creerServeurMcp } from '../src/mcp/serveur.js';
import { ulid } from '../src/ulid.js';
import { tmp } from './temporaire.js';

const il_y_a = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const inventaire = (h) => ({ id: ulid(Date.parse(il_y_a(h)), `inventaire${h}`), at: il_y_a(h), kind: 'inventory.finished', actor: 'system:inventaire', subject: null, data: { fiches: 0 }, classification: 'internal' });
const ignoree = (h, serveur) => ({ id: ulid(Date.parse(il_y_a(h)), `ignoree${h}${serveur}`), at: il_y_a(h), kind: 'system.degraded', actor: 'system:passerelle',
  correlation: null, classification: 'internal', data: { composant: 'passerelle', serveur, phase: 'demarrage', via: 'hub' } });
// Un site neuf, son journal, puis les trois champs du contrat lus par `etat()`.
function etat(evenements, config = {}) {
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: {}, inventaire: {}, import: {}, ...config });
  assert.deepEqual(s.journal.ajouter(evenements).refuses, []); s.indexer();
  const { statut, derniere_activite, resume } = s.etat();
  return { statut, derniere_activite, resume };
}

test('membres-du-hub : sans inventaire au journal, HOLARCH se dit indisponible, jamais ok', () => {
  assert.deepEqual(etat([]), { statut: 'indisponible', derniere_activite: null, resume: 'Aucun inventaire au journal de ce site.' });
});

test('membres-du-hub : l’âge du dernier inventaire fait le statut, ok sous 2 h, alerte au-delà, panne au-delà de 24 h', () => {
  const recent = inventaire(0.5); const ok = etat([inventaire(30), recent]);
  assert.equal(ok.statut, 'ok'); assert.equal(ok.derniere_activite, recent.at);
  assert.match(ok.resume, /^Dernier inventaire il y a 30 min\.$/);
  const alerte = etat([inventaire(3)]);
  assert.equal(alerte.statut, 'alerte'); assert.match(alerte.resume, /il y a 3 h \(seuil 2 h\)/);
  const panne = etat([inventaire(30)]);
  assert.equal(panne.statut, 'panne'); assert.match(panne.resume, /il y a 30 h \(seuil 24 h\)/);
});

test('membres-du-hub : une cible ignorée par la passerelle dans l’heure met en alerte et se nomme ; plus ancienne, elle ne compte plus', () => {
  const r = etat([inventaire(0.2), ignoree(0.5, 'okf-hub'), ignoree(0.4, 'okf-hub')]);
  assert.equal(r.statut, 'alerte'); assert.match(r.resume, /la passerelle a ignoré okf-hub dans l'heure\.$/);
  assert.equal(etat([inventaire(0.2), ignoree(3, 'okf-hub')]).statut, 'ok');
});

test('membres-du-hub : les seuils se règlent dans la configuration du site (etat.alerte_heures, etat.panne_heures)', () => {
  assert.equal(etat([inventaire(1)], { etat: { alerte_heures: 0.5 } }).statut, 'alerte');
  assert.equal(etat([inventaire(5)], { etat: { alerte_heures: 6, panne_heures: 48 } }).statut, 'ok');
  assert.equal(etat([inventaire(5)], { etat: { panne_heures: 4 } }).statut, 'panne');
});

test('membres-du-hub : l’outil MCP etat déclare sa sortie (contrat etat-de-membre) et la rend structurée, en lecture seule', async () => {
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.journal.ajouter([inventaire(0.5)]); s.indexer();
  const [c, srv] = InMemoryTransport.createLinkedPair();
  await creerServeurMcp(s, '0').connect(srv);
  const client = new Client({ name: 'test', version: '0' }); await client.connect(c);
  try {
    const outil = (await client.listTools()).tools.find((t) => t.name === 'etat');
    assert.deepEqual(outil.outputSchema.properties.statut.enum, ['ok', 'alerte', 'panne', 'indisponible']);
    assert.deepEqual([...outil.outputSchema.required].sort(), ['derniere_activite', 'resume', 'statut']);
    assert.equal(outil.annotations.readOnlyHint, true);
    const r = await client.callTool({ name: 'etat', arguments: {} });
    assert.equal(r.structuredContent.statut, 'ok');
    assert.deepEqual(JSON.parse(r.content[0].text), JSON.parse(JSON.stringify(r.structuredContent)));
  } finally { await client.close(); }
});
