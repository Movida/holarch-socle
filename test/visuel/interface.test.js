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
      data: { projet, cwd: `/ws/${projet}`, sous_agent: false, tours: 12, invites: 3, duree_s: 7200, modeles: [modele] } });
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
    fiche('node', 'arbre/racine', { name: 'Racine fictive', node: '/arbre/index.md', links: { project: ['holarch:project:projet-calme'] }, attributes: { type: 'guideline', statut: 'stable' } }),
    fiche('node', 'arbre/enfant', { name: 'Enfant fictif', node: '/arbre/enfant.md', links: { derives_from: ['/arbre/index.md'], project: ['holarch:project:projet-calme'] }, attributes: { type: 'need', statut: 'draft' } }),
    fiche('project', 'projet-a', { location: '/ws/projet-a', attributes: { branche: 'main', amont: 'origin/main', en_avance: 2, en_retard: 0, fichiers_modifies: 3, dernier_commit: il_y_a(1), dernier_sujet: 'Un commit fictif' } }),
    fiche('project', 'projet-b', { location: '/ws/projet-b', attributes: { branche: 'main', amont: null, fichiers_modifies: 0, dernier_commit: il_y_a(4) } }),
    fiche('project', 'projet-calme', { location: '/ws/projet-calme', attributes: { branche: 'main', amont: 'origin/main', en_avance: 0, en_retard: 0, fichiers_modifies: 0, dernier_commit: il_y_a(300) } }),
    fiche('node', 'profil/racine', { name: 'Profil fictif', node: '/arbre/index.md', attributes: { type: 'guideline', statut: 'draft', racine: true, arbre: 'profil' } }),
    fiche('node', 'profil/perso', { name: 'Perso', node: '/arbre/contextes/perso.md', links: { derives_from: ['/arbre/index.md'] }, attributes: { type: 'context', statut: 'draft', arbre: 'profil', projects: ['holarch:project:projet-a'] } }),
    fiche('node', 'socle/methode', { name: 'Méthode fictive', node: '/arbre/types-transverses/methode/index.md', attributes: { type: 'template', statut: 'draft', arbre: 'socle', id: 'methode' } }),
    fiche('rule', 'profil/avis', { name: 'avis', description: 'Donner un avis.', attributes: { arbre: 'profil', noeud_id: 'holarch:node:profil/racine', enonce: 'Donner un avis argumenté.', pourquoi: 'Exemple.', niveau: 'reminder', statut: 'stable', derogeable: true } }),
    fiche('rule', 'socle/methode/inventer', { name: 'jamais-inventer', description: 'Ne pas inventer.', attributes: { arbre: 'socle', noeud_id: 'holarch:node:socle/methode', enonce: 'Un fait inconnu se marque.', niveau: 'reminder', statut: 'draft', derogeable: true } }),
    fiche('node', 'projet-a/racine', { name: 'Racine A', location: '/ws/projet-a/arbre/index.md', node: '/arbre/index.md', links: { project: ['holarch:project:projet-a'] }, attributes: { type: 'guideline', statut: 'draft', racine: true, arbre: 'projet-a', types: ['methode'], questions_ouvertes: [{ id: 'Q1', noeud: 'x.md', question: 'Une question `fictive` ?', niveau: 'gênant' }] } }),
    fiche('node', 'projet-a/etape', { name: 'Étape 2 — Fictive', location: '/ws/projet-a/arbre/conception/etape-2-fictive.md', node: '/arbre/conception/etape-2-fictive.md', links: { project: ['holarch:project:projet-a'] }, attributes: { type: 'spec', statut: 'draft', etape: 2, avancement: [{ etiquette: 'Fait', date: '2026-10-01', texte: 'Une tranche faite.', sous: [] }, { etiquette: 'Reste', date: null, texte: null, sous: ['Une tranche à faire.'] }] } }),
  ]);
  s.indexer();
  return s;
}

test('interface : chaque page s’affiche sans erreur, barres visibles, barre latérale fixe, tris et filtres', async (t) => {
  const s = donneesFictives();
  const serveur = creerServeur(s);
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  const racine = `http://127.0.0.1:${serveur.address().port}/`;
  t.after(() => serveur.close()); // dès son ouverture : un échec plus loin ne doit pas laisser le processus suspendu
  // Sans les bibliothèques système de Chromium, le lancement échouerait au bout de trois minutes : on échoue vite, en
  // disant quoi installer.
  const navigateur = await chromium.launch({ timeout: 20000 }).catch((e) => {
    throw new Error(`Chromium ne démarre pas (${e.message.split('\n')[0]}). Préparer : npx playwright install --with-deps chromium`);
  });
  t.after(() => navigateur.close());
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
  await page.waitForFunction(() => location.hash === '#/sessions?projet=holarch%3Aproject%3Aprojet-b');
  await page.waitForSelector('.nav a[aria-current="page"][data-vue="sessions"]'); // la page précédente a cédé la place
  await page.waitForSelector('table.triable tbody tr.cliquable');
  assert.equal(await page.$$eval('table.triable tbody tr', (r) => r.length), 1, 'sessions du projet');
  await page.click('table.triable tbody tr.cliquable td:nth-child(2)');
  await page.waitForFunction(() => location.hash.startsWith('#/journal?session=session-2'));
  await page.waitForSelector('.evenement .badge.fam-tool');
  assert.ok((await page.$$eval('.evenement', (e) => e.length)) >= 4, 'événements de la session, refus compris');

  await ouvrir('#/projets', '.carte.projet');
  assert.equal(await page.$$eval('.carte.projet', (c) => c.length), 2, 'une carte par projet en mouvement');
  const carteA = await page.textContent('.carte.projet:first-child');
  assert.match(carteA, /projet-a[\s\S]*3 non commités[\s\S]*2 non poussés[\s\S]*Étape 2 — Fictive[\s\S]*Une tranche à faire[\s\S]*1 question ouverte[\s\S]*7 j : 1 session/);
  assert.match(await page.textContent('main'), /Sans activité sur 30 jours[\s\S]*projet-calme/);
  await page.click('.carte.projet:first-child .activite a');
  await page.waitForFunction(() => location.hash.startsWith('#/sessions?projet=holarch'));
  await page.waitForSelector('.nav a[aria-current="page"][data-vue="sessions"]'); // sinon, le tableau de la page Projets
  await page.waitForSelector('table.triable tbody tr.cliquable');
  assert.equal(await page.$$eval('table.triable tbody tr', (r) => r.length), 2, 'sessions du projet');

  await ouvrir('#/projets', '.carte.projet');
  await page.click('.carte.projet:first-child .regles');
  await page.waitForSelector('.nav a[aria-current="page"][data-vue="regles"]');
  await page.waitForSelector('table.triable tbody tr td a[data-fiche]');
  assert.equal(await page.$$eval('table.triable tbody tr', (r) => r.length), 2, 'règle effective : profil et type');
  assert.match(await page.textContent('main'), /Règles — projet-a[\s\S]*compte : avis\.md[\s\S]*à approuver/);
  await ouvrir('#/regles', 'table.triable tbody tr');
  assert.match(await page.textContent('main'), /Projets qui ont des règles[\s\S]*projet-a[\s\S]*déclaré/);

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
  await page.click('button[data-replier="0"]');
  assert.ok(await page.isVisible('text=Enfant fictif'), 'tout déplier');
  await ouvrir('#/arbre?statut=stable', 'details summary');
  assert.ok(await page.isVisible('text=Racine fictive') && !(await page.isVisible('text=Enfant fictif')), 'filtre stable');
  await ouvrir('#/journal', '.evenement');
  assert.ok(!(await page.textContent('main')).includes('ui.viewed'), 'pages consultées hors du flux par défaut');
  await ouvrir('', 'svg.histo');
  assert.doesNotMatch(await page.textContent('body'), /Interface ouverte 0 jour/, 'la page en cours est comptée');
  assert.deepEqual(erreurs, []);
});
