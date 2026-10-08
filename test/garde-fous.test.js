// Tests des corrections courtes de la passe par famille (2026-10-08) : ce qui rendait un garde-fou muet ou ouvrait le
// poste. Chaque test reproduit le défaut constaté.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { etatDepot } from '../src/inventaire/depots-git.js';
import { Journal } from '../src/stockage/journal.js';
import { Index } from '../src/stockage/index.js';
import { ulid } from '../src/ulid.js';
import { executer } from '../src/controles.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-'));

test('X2 : la configuration locale d’un dépôt lu par l’inventaire n’exécute rien (core.fsmonitor)', () => {
  const d = tmp(); const temoin = path.join(tmp(), 'execute');
  spawnSync('git', ['init', '-q', d]);
  const script = path.join(d, '.git', 'piege.sh');
  fs.writeFileSync(script, `#!/bin/sh\ntouch '${temoin}'\n`, { mode: 0o755 });
  spawnSync('git', ['-C', d, 'config', 'core.fsmonitor', script]);
  fs.writeFileSync(path.join(d, 'f.txt'), 'x');
  const e = etatDepot(d);
  assert.equal(e.fichiers_modifies, 1);
  assert.equal(fs.existsSync(temoin), false, 'le core.fsmonitor du dépôt a été exécuté');
});

test('X3 : l’interface est servie avec une politique de contenu qui n’admet que ses propres scripts', async () => {
  const { creerServeur } = await import('../src/web/serveur.js');
  const { Socle } = await import('../src/socle.js');
  const s = new Socle({ site: 'local', donnees: tmp(), web: {}, tarifs: {}, inventaire: {}, import: {} });
  const srv = creerServeur(s); await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  try {
    for (const chemin of ['/', '/app.js']) {
      const r = await fetch(`http://127.0.0.1:${srv.address().port}${chemin}`);
      const csp = r.headers.get('content-security-policy') || '';
      assert.match(csp, /default-src 'self'/, chemin);
      assert.doesNotMatch(csp, /script-src[^;]*unsafe/, chemin);
    }
  } finally { srv.close(); }
});

const evenement = (n) => ({ id: ulid(Date.parse('2026-10-01T10:00:00Z') + n, `n${n}`), at: '2026-10-01T10:00:00Z', kind: 'inventory.ran', actor: 'system:holarch', site: 'local', data: {} });

test('N1 : une ligne coupée du journal ne bloque pas sa lecture, se compte, et l’ajout suivant ne s’y colle pas', () => {
  const donnees = tmp(); const j = new Journal(donnees, 'local');
  assert.equal(j.ajouter([evenement(1)]).ajoutes, 1);
  const f = path.join(donnees, 'journal', 'local', '2026-10.jsonl');
  fs.appendFileSync(f, '{"id":"coupe","at":"2026-10'); // écriture interrompue : ni fin de ligne ni fin d’objet
  const lu = new Journal(donnees, 'local');
  assert.deepEqual([...lu.lire()].map((e) => e.id), [evenement(1).id]);
  assert.equal(lu.illisibles, 1, 'la ligne coupée se compte');
  assert.equal(lu.ajouter([evenement(2)]).ajoutes, 1);
  const relu = new Journal(donnees, 'local');
  assert.deepEqual([...relu.lire()].map((e) => e.id), [evenement(1).id, evenement(2).id], 'l’événement ajouté après la coupure est lisible');
});

test('E1 : une reconstruction de l’index en échec annule sa transaction et ne garde pas le verrou', () => {
  const donnees = tmp(); const index = new Index(donnees);
  index.reconstruire({ evenements: [evenement(1)], fiches: [], tarifs: {} });
  function* enPanne() { yield evenement(2); throw new Error('journal illisible'); }
  assert.throws(() => index.reconstruire({ evenements: enPanne(), fiches: [], tarifs: {} }), /journal illisible/);
  const autre = new DatabaseSync(path.join(donnees, 'index.sqlite'));
  autre.exec('PRAGMA busy_timeout = 0');
  autre.exec('BEGIN IMMEDIATE'); autre.exec('ROLLBACK'); // verrou libre : sinon « database is locked »
  assert.equal(autre.prepare('SELECT count(*) AS n FROM evenements').get().n, 1, 'l’index d’avant reste entier');
  autre.close();
});

test('E2 : un rules.yaml illisible ne fait pas passer la garde, n’efface rien de ce qui est posé, et se voit à l’audit', async () => {
  const { Socle } = await import('../src/socle.js');
  const { default: inventaireArbre } = await import('../src/inventaire/arbre.js');
  const { materialiserProjet } = await import('../src/materialisation.js');
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const d = path.join(r, 'depot');
  const g = (...a) => { const x = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(x.status, 0, x.stderr); };
  fs.mkdirSync(d); g('init', '-q'); g('config', 'user.name', 'Alice Exemple'); g('config', 'user.email', 'alice@exemple.test'); g('config', 'commit.gpgsign', 'false');
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Projet Zeta]\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  const regles = path.join(d, 'arbre', 'rules.yaml');
  ecrire(regles, '- id: rien-de-personnel\n  statement: Aucune donnée personnelle dans un fichier suivi.\n  level: blocking\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n'
    + '- id: rappel\n  statement: Un rappel fictif.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(d, 'note.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'départ');
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
  const relire = () => { s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer(); };
  relire();
  const m = materialiserProjet(s.regles({ projet: 'depot' }), d, { accueil, holarch: '/opt/holarch/bin/holarch.js' });
  assert.equal(m.crochet.etat, 'pose');
  const poses = fs.readdirSync(path.join(d, '.claude', 'rules', 'holarch')).sort();

  // Le fichier de règles devient illisible (édition en cours, conflit de fusion) : avant, ses règles disparaissaient
  // en silence, la garde laissait tout passer et `regles appliquer` retirait fichiers et crochet.
  fs.writeFileSync(regles, '- id: [ouverte\n');
  const plusTard = new Date(Date.now() + 2000); fs.utimesSync(regles, plusTard, plusTard);
  ecrire(path.join(d, 'note.md'), 'note du projet zeta\n'); g('add', '.');
  assert.deepEqual(s.garde({ depot: d }).refus.map((x) => x.regle), ['regles-lisibles'], 'la garde ne dit pas conforme ce qu’elle ne peut pas lire');
  relire();
  const re = s.regles({ projet: 'depot' });
  assert.ok(re.illisibles.length, 'la règle effective dit qu’elle est incomplète');
  assert.throws(() => materialiserProjet(re, d, { accueil, holarch: '/opt/holarch/bin/holarch.js' }), /illisible/);
  assert.deepEqual(fs.readdirSync(path.join(d, '.claude', 'rules', 'holarch')).sort(), poses, 'rien n’est retiré');
  assert.ok(fs.existsSync(path.join(d, '.git', 'hooks', 'pre-commit')), 'le crochet reste');
  const a = s.audit({ projet: 'depot' });
  assert.deepEqual(a.cibles.find((c) => c.projet === 'holarch:project:depot').ecarts.map((e) => e.controle), ['regles-lisibles'], 'un seul écart, sans faux retraits');
});

test('E3 : le contrôle des secrets ne se dit pas fait quand git ne peut pas lire le dépôt', () => {
  const faux = path.join(tmp(), 'gitleaks'); fs.writeFileSync(faux, '#!/bin/sh\nprintf "[]"\n', { mode: 0o755 });
  const pasUnDepot = tmp(); // dossier présent, sans dépôt git (déplacé, .git retiré)
  assert.match(executer('secrets', { depot: pasUnDepot, gitleaks: faux }, 'audit').indisponible || '', /git/, 'un dossier sans dépôt n’est pas « rien trouvé »');
  const casse = tmp(); spawnSync('git', ['init', '-q', casse]); fs.writeFileSync(path.join(casse, '.git', 'HEAD'), 'n’importe quoi\n');
  assert.ok(executer('secrets', { depot: casse, gitleaks: faux }, 'audit').indisponible, 'un dépôt illisible n’est pas « rien trouvé »');
  const neuf = tmp(); spawnSync('git', ['init', '-q', neuf]);
  assert.deepEqual(executer('secrets', { depot: neuf, gitleaks: faux }, 'audit'), { ecarts: [] }, 'un dépôt sans commit : rien à lire, fait');
});
