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
