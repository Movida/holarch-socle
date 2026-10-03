// Test visuel de l'interface, dans un vrai navigateur (Playwright, Chromium) et sur des données fictives : ce que la
// lecture du code ne montre pas (une barre de 0 px, une barre latérale qui part au défilement). Hors de `npm test`
// parce qu'il demande un navigateur : `npm run test:visuel` (préparer : `npx playwright install --with-deps chromium`).
// HOLARCH_CAPTURES=<dossier> enregistre une capture de chaque page.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Socle } from '../../src/socle.js';
import { creerServeur } from '../../src/web/serveur.js';
import { ulid } from '../../src/ulid.js';

const JOUR = 864e5;
const il_y_a = (j, h = 10) => new Date(Math.floor(Date.now() / JOUR - j) * JOUR + h * 36e5).toISOString().replace(/\.\d+Z$/, 'Z');

function donneesFictives() {
  const donnees = fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-visuel-'));
  const s = new Socle({ site: 'local', donnees, web: {}, inventaire: {}, import: {},
    tarifs: { source: 'https://exemple.test/tarifs', releve: '2026-10-01', modeles: { 'modele-a': { entree: 1, cache_ecrit: 1, cache_ecrit_1h: 2, cache_lu: 0.1, sortie: 10 } } } });
  const ev = [];
  const session = (n, jours, projet, sortie, modele = 'modele-a') => {
    const corr = `session-${n}`; const base = { actor: `agent:claude-code/${modele}`, correlation: corr, classification: 'internal' };
    ev.push({ ...base, id: ulid(Date.parse(il_y_a(jours, 9)), `${n}d`), at: il_y_a(jours, 9), kind: 'session.started', data: { projet, sous_agent: false } });
    ev.push({ ...base, id: ulid(Date.parse(il_y_a(jours, 11)), `${n}c`), at: il_y_a(jours, 11), kind: 'cost.recorded', data: { projet, sous_agent: false },
      cost: { provider: 'anthropic', model: modele, usd_list: null, tokens: { in: 1200, cache_write: 5e4, cache_write_1h: 0, cache_read: sortie * 40, out: sortie } } });
    ev.push({ ...base, id: ulid(Date.parse(il_y_a(jours, 11)), `${n}f`), at: il_y_a(jours, 11), kind: 'session.finished',
      data: { projet, sous_agent: false, tours: 12, invites: 3, duree_s: 7200, modeles: [modele] } });
  };
  // Des jours sans activité au milieu de la plage : l'histogramme doit les montrer à zéro.
  [[1, 0, 'projet-a', 9e5], [2, 2, 'projet-b', 3e6], [3, 9, 'projet-a', 4e5], [4, 20, 'projet-c', 2e5], [5, 2, 'projet-c', 1e5, 'modele-sans-tarif']]
    .forEach(([n, j, p, o, m]) => session(n, j, p, o, m));
  ev.push({ id: ulid(Date.parse(il_y_a(2, 10)), 'a'), at: il_y_a(2, 10), kind: 'tool.called', actor: 'agent:claude-code/modele-a', correlation: 'session-2', data: { projet: 'projet-b', serveur: 'holarch', outil: 'etat', statut: 'ok' } });
  ev.push({ id: ulid(Date.parse(il_y_a(2, 10)), 'r'), at: il_y_a(2, 10), kind: 'tool.denied', actor: 'agent:claude-code/modele-a', correlation: 'session-2', data: { projet: 'projet-b', outil: 'Bash', origine: 'regle' } });
  s.journal.ajouter(ev);
  const fiche = (kind, nom, extra = {}) => ({ id: `holarch:${kind}:${nom}`, kind, name: nom, status: 'active', provenance: { source: 'test' }, ...extra });
  s.catalogue.remplacer([
    fiche('skill', 'demo', { description: 'Une skill fictive.' }),
    fiche('memory', 'note-a', { description: 'Même note.', attributes: { projet: 'projet-a' } }),
    fiche('memory', 'note-a-bis', { name: 'note-a', description: 'Même note.', attributes: { projet: 'projet-b' } }),
    fiche('node', 'arbre/contrat', { name: 'Contrat fictif', status: 'proposed', node: '/arbre/contrat.md', attributes: { type: 'contract', statut: 'draft' } }),
    fiche('node', 'arbre/racine', { name: 'Racine fictive', node: '/arbre/index.md', attributes: { type: 'guideline', statut: 'stable', depot: 'demo' } }),
    fiche('node', 'arbre/enfant', { name: 'Enfant fictif', node: '/arbre/enfant.md', links: { derives_from: ['/arbre/index.md'] }, attributes: { type: 'need', statut: 'draft', depot: 'demo' } }),
  ]);
  s.indexer();
  return s;
}

test('interface : chaque page s’affiche sans erreur, barres visibles, barre latérale fixe, tris et filtres', async (t) => {
  const s = donneesFictives();
  const serveur = creerServeur(s);
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const racine = `http://127.0.0.1:${serveur.address().port}/`;
  const navigateur = await chromium.launch();
  t.after(async () => { await navigateur.close(); serveur.close(); });
  const page = await navigateur.newPage({ viewport: { width: 1280, height: 600 } });
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  const captures = process.env.HOLARCH_CAPTURES;
  const ouvrir = async (hash, attendre) => {
    await page.goto(`${racine}${hash}`);
    await page.waitForSelector(attendre);
    if (captures) { fs.mkdirSync(captures, { recursive: true }); await page.screenshot({ path: path.join(captures, `${hash.replace(/[^a-z]+/gi, '-') || 'tableau'}.png`), fullPage: true }); }
  };

  await ouvrir('', 'svg.histo');
  assert.equal((await page.request.get(`${racine}vendor/pico.css`)).status(), 200, 'système de design servi en local');
  const largeurs = await page.$$eval('.barre .rempli', (els) => els.map((e) => e.getBoundingClientRect().width));
  assert.ok(largeurs.length > 0 && largeurs.every((l) => l > 0), `barres de progression : ${largeurs}`);
  assert.equal(await page.$$eval('svg.histo rect', (r) => r.length), 30, 'un rectangle par jour, jours vides compris');
  assert.equal(await page.$$eval('.axe span', (r) => r.length), 4);
  assert.match(await page.textContent('.tuile:last-child .note'), /hors 1 modèle sans tarif/);
  assert.match(await page.textContent('body'), /mémoire en 2 exemplaires/);
  assert.match(await page.textContent('body'), /Appels MCP, 30 j[\s\S]*holarch/);
  assert.equal(await page.$eval('table.triable tbody tr td', (td) => td.textContent), 'modele-a', 'modèles triés par coût');
  await page.click('.entete .puce:has-text("7 j")');
  await page.waitForFunction(() => document.querySelectorAll('svg.histo rect').length === 7);
  assert.match(await page.textContent('.tuile:nth-child(2) .libelle'), /7 j/);
  await page.goto(racine); await page.waitForSelector('svg.histo');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const nav = await page.$eval('.nav', (n) => n.getBoundingClientRect().top);
  assert.ok(Math.abs(nav) < 1, `la barre latérale reste en place au défilement (décalage ${nav} px, arrondi sous le pixel toléré)`);

  assert.equal(await page.getAttribute('.nav a[aria-current="page"]', 'data-vue'), 'tableau');
  await page.click('.barre a.nom:has-text("projet-b")');
  await page.waitForFunction(() => location.hash.startsWith('#/sessions?projet=projet-b'));
  await page.waitForSelector('table.triable tbody tr.cliquable');
  assert.equal(await page.$$eval('table.triable tbody tr', (r) => r.length), 1, 'sessions du projet');
  await page.click('table.triable tbody tr.cliquable td:nth-child(2)');
  await page.waitForFunction(() => location.hash.startsWith('#/journal?session=session-2'));
  await page.waitForSelector('.evenement .badge.fam-tool');
  assert.ok((await page.$$eval('.evenement', (e) => e.length)) >= 4, 'événements de la session, refus compris');

  await ouvrir('#/catalogue', 'table tbody tr');
  assert.match(await page.textContent('tr[data-fiche="holarch:node:arbre/contrat"]'), /draft/);

  await ouvrir('#/sessions', 'table.triable tbody tr');
  await page.click('table.triable th:nth-child(9)'); // premier clic : du plus grand au plus petit
  const couts = await page.$$eval('table.triable tbody tr td:nth-child(9)', (td) => td.map((x) => +x.dataset.v));
  assert.deepEqual(couts, [...couts].sort((a, b) => b - a), 'tri décroissant par coût');
  assert.match(await page.textContent('table.triable tbody tr td:nth-child(10)'), /\$$/, 'coût par tour affiché');
  await ouvrir(`#/sessions?jour=${il_y_a(2).slice(0, 10)}`, 'table.triable tbody tr');
  assert.equal(await page.$$eval('table.triable tbody tr', (r) => r.length), 2, 'filtre par jour');

  await page.setViewportSize({ width: 1100, height: 600 });
  await ouvrir('#/sessions', 'table.triable tbody tr');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'la page Sessions ne déborde pas en largeur');

  await ouvrir('#/journal', '.evenement');
  assert.ok((await page.$$eval('.evenement .badge', (b) => new Set(b.map((x) => x.className)).size)) >= 3, 'une teinte par famille');
  await ouvrir('#/arbre', 'details summary');
  assert.ok(await page.isVisible('text=Enfant fictif'));
  await page.click('details summary .noeud', { position: { x: 4, y: 8 } });
  assert.ok(!(await page.isVisible('text=Enfant fictif')), 'un nœud parent se replie');
  assert.deepEqual(erreurs, []);
});
