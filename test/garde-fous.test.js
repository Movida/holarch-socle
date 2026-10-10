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
import { executer, dossierClaude, maisonsWindows } from '../src/controles.js';
import { git, gitLu, dedans } from '../src/commun.js';
import { Socle } from '../src/socle.js';
import importerTranscriptions from '../src/import/claude-code-transcriptions.js';
import inventaireArbre from '../src/inventaire/arbre.js';
import { regleEffective, regleDuCompte, exceptions, fusionnerConfig } from '../src/regles.js';

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

test('X2 : les filtres et pilotes de diff déclarés par un dépôt ne s’exécutent pas, ceux du compte si', () => {
  const d = tmp(); const temoin = path.join(tmp(), 'execute');
  const g = (...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  spawnSync('git', ['init', '-q', d]);
  const script = path.join(d, '.git', 'piege.sh');
  fs.writeFileSync(script, `#!/bin/sh\ntouch '${temoin}'."$1"\ncat\n`, { mode: 0o755 });
  fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt filter=x diff=x\n*.md filter="a b"\n*.cfg diff=y\n');
  fs.writeFileSync(path.join(d, 'f.txt'), 'x\n'); fs.writeFileSync(path.join(d, 'g.md'), 'y\n'); fs.writeFileSync(path.join(d, 'h.cfg'), 'a\n');
  g('add', '.'); g('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i');
  for (const [cle, mot] of [['filter.x.clean', 'clean'], ['filter.x.smudge', 'smudge'], ['filter.x.process', 'process'], ['filter.a b.clean', 'espace'],
    ['diff.x.textconv', 'textconv'], ['diff.x.command', 'command'], ['diff.external', 'external']]) g('config', cle, `${script} ${mot}`);
  g('config', 'filter.x.required', 'true');
  fs.appendFileSync(path.join(d, 'f.txt'), 'z\n'); fs.appendFileSync(path.join(d, 'g.md'), 'z\n'); fs.appendFileSync(path.join(d, 'h.cfg'), 'z\n');
  assert.equal(etatDepot(d).fichiers_modifies, 3);
  assert.equal(gitLu(d, ['diff']).status, 0);
  assert.equal(gitLu(d, ['log', '-p', '-1']).status, 0);
  assert.equal(gitLu(d, ['diff', '--cached']).status, 0);
  assert.equal(gitLu(d, ['archive', '--format=tar', 'HEAD'], { encoding: 'buffer' }).status, 0);
  const executes = fs.readdirSync(path.dirname(temoin));
  assert.deepEqual(executes, [], `programmes du dépôt exécutés : ${executes.join(', ')}`);
  // Un pilote déclaré par le compte (portée globale) reste appliqué.
  const globale = path.join(tmp(), 'gitconfig');
  fs.writeFileSync(globale, '[diff "y"]\n\ttextconv = tr a-z A-Z <\n');
  const r = gitLu(d, ['diff', '--', 'h.cfg'], { env: { ...process.env, GIT_CONFIG_GLOBAL: globale } });
  assert.match(r.stdout, /^\+Z$/m, 'le textconv du compte a été ignoré');
});

// Seconde contre-épreuve (2026-10-08) : ce qui s'exécutait encore, et la régression d'X2 sur les écritures.
const piege = (d, temoin) => { const s = path.join(d, '.git', 'piege.sh'); fs.writeFileSync(s, `#!/bin/sh\ntouch '${temoin}'."$1"\ncat\n`, { mode: 0o755 }); return s; };
const depotAvecCommit = (d, fichiers) => {
  spawnSync('git', ['init', '-q', d]);
  for (const [f, t] of Object.entries(fichiers)) fs.writeFileSync(path.join(d, f), t);
  spawnSync('git', ['-C', d, 'add', '.']); spawnSync('git', ['-C', d, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i']);
};

test('Seconde contre-épreuve (A) : un crochet du dépôt ne s’exécute pas au status de l’inventaire, et l’index n’est pas réécrit', () => {
  for (const viaHooksPath of [false, true]) {
    const d = tmp(); const temoin = path.join(tmp(), 'execute');
    depotAvecCommit(d, { 'f.txt': 'x\n' });
    const s = piege(d, temoin);
    const crochets = viaHooksPath ? path.join(d, '.git', 'autres') : path.join(d, '.git', 'hooks');
    fs.mkdirSync(crochets, { recursive: true }); fs.copyFileSync(s, path.join(crochets, 'post-index-change')); fs.chmodSync(path.join(crochets, 'post-index-change'), 0o755);
    if (viaHooksPath) spawnSync('git', ['-C', d, 'config', 'core.hooksPath', crochets]);
    const index = path.join(d, '.git', 'index'); const avant = fs.readFileSync(index);
    const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(d, 'f.txt'), t, t); // force un rafraîchissement de l'index
    assert.equal(etatDepot(d).fichiers_modifies, 0);
    assert.deepEqual(fs.readdirSync(path.dirname(temoin)), [], viaHooksPath ? 'crochet de core.hooksPath exécuté' : 'crochet de .git/hooks exécuté');
    assert.deepEqual(fs.readFileSync(index), avant, 'index du dépôt lu réécrit');
  }
});

test('Seconde contre-épreuve (B) : le filtre déclaré par la configuration d’un sous-module ne s’exécute pas au status du parent', () => {
  const sous = tmp(); const d = tmp(); const temoin = path.join(tmp(), 'execute');
  depotAvecCommit(sous, { 'f.txt': 'x\n', '.gitattributes': '*.txt filter=x\n' });
  depotAvecCommit(d, { 'a.txt': 'a\n' });
  const r = spawnSync('git', ['-C', d, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sous, 's'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const s = piege(d, temoin);
  spawnSync('git', ['-C', path.join(d, 's'), 'config', 'filter.x.clean', `${s} clean`]);
  const t = new Date(Date.now() + 5000); fs.utimesSync(path.join(d, 's', 'f.txt'), t, t); // même taille : git relit le contenu par le filtre
  etatDepot(d);
  assert.deepEqual(fs.readdirSync(path.dirname(temoin)), [], 'filtre du sous-module exécuté');
});

test('Seconde contre-épreuve (C) : un nom de pilote contenant « = » est neutralisé comme les autres', () => {
  const d = tmp(); const temoin = path.join(tmp(), 'execute');
  depotAvecCommit(d, { 'f.txt': 'x\n', '.gitattributes': '*.txt filter=a=b diff=c=d\n' });
  const s = piege(d, temoin);
  spawnSync('git', ['-C', d, 'config', 'filter.a=b.clean', `${s} clean`]);
  spawnSync('git', ['-C', d, 'config', 'diff.c=d.textconv', `${s} textconv`]);
  fs.appendFileSync(path.join(d, 'f.txt'), 'z\n');
  assert.equal(etatDepot(d).fichiers_modifies, 1);
  assert.equal(gitLu(d, ['diff']).status, 0);
  assert.deepEqual(fs.readdirSync(path.dirname(temoin)), [], 'pilote au nom contenant « = » exécuté');
});

test('Seconde contre-épreuve (D) : dans un dépôt de l’auteur, git applique ses filtres locaux (écritures, copie de service)', () => {
  const d = tmp();
  spawnSync('git', ['init', '-q', d]);
  // Un filtre réversible déclaré en local, à la manière de git-crypt : le dépôt garde la forme transformée.
  spawnSync('git', ['-C', d, 'config', 'filter.r.clean', 'tr a-z n-za-m']); spawnSync('git', ['-C', d, 'config', 'filter.r.smudge', 'tr a-z n-za-m']);
  fs.writeFileSync(path.join(d, '.gitattributes'), '*.txt filter=r\n'); fs.writeFileSync(path.join(d, 'f.txt'), 'secret\n');
  assert.equal(git(d, ['add', '.']).status, 0);
  assert.equal(git(d, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'i']).status, 0);
  assert.equal(git(d, ['show', 'HEAD:f.txt']).stdout, 'frperg\n', 'le commit a gardé le texte en clair');
  assert.equal(git(d, ['status', '--porcelain']).stdout, '', 'le dépôt de l’auteur paraît modifié');
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

test('X3 : l’interface n’insère aucune donnée du journal ou d’une fiche sans l’échapper', () => {
  const app = fs.readFileSync(new URL('../src/web/public/app.js', import.meta.url), 'utf8');
  // Toute propriété insérée telle quelle, quel que soit le nom de la variable (seconde contre-épreuve, G).
  const brutes = [...app.matchAll(/\$\{([A-Za-z_]\w*(?:\??\.\w+)+)\}/g)].map((m) => m[1])
    // Exceptions nommées : nombres (`.length`, comptes, statut HTTP), texte posé hors HTML (textContent, message
    // d'erreur), config du site, ou déjà dans un h(`…`) englobant.
    .filter((v) => !/\.length$/.test(v) && !/^(f\.n|m\.n|r\.status|e\.site|e\.tarifs\.releve|e\.tarifs\.source|f\.attributes\.dossier|e\.provenance\.arbre|e\.provenance\.noeud)$/.test(v));
  assert.deepEqual(brutes, [], 'à échapper avec h()');
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

test('Contre-épreuve (8) : un échec du schéma de l’index annule aussi la transaction', () => {
  const donnees = tmp(); const index = new Index(donnees);
  index.reconstruire({ evenements: [evenement(1)], fiches: [], tarifs: {} });
  // Un index du même nom sur une autre table : le CREATE INDEX de la reconstruction échoue, après les DROP.
  index.db.exec('CREATE TABLE autre (x); CREATE INDEX ev_corr_autre ON autre(x); DROP INDEX ev_corr; CREATE INDEX ev_corr ON autre(x)');
  assert.throws(() => index.reconstruire({ evenements: [evenement(2)], fiches: [], tarifs: {} }), /ev_corr already exists/);
  const autre = new DatabaseSync(path.join(donnees, 'index.sqlite'));
  autre.exec('PRAGMA busy_timeout = 0');
  autre.exec('BEGIN IMMEDIATE'); autre.exec('ROLLBACK'); // verrou libre : sinon « database is locked »
  assert.equal(autre.prepare('SELECT count(*) AS n FROM evenements').get().n, 1, 'les tables d’avant ne sont pas retirées');
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
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
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
  s.garde({ depot: d, journaliser: true }); s.indexer();
  assert.deepEqual(s.index.requete("SELECT data FROM evenements WHERE kind='rule.enforced'").map((e) => JSON.parse(e.data)),
    [{ regle: 'regles-lisibles', controle: 'regles-lisibles', n: 1, moment: 'avant-commit' }], 'le refus est un échec au journal, comme les autres');
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

test('E2 : un en-tête illisible dans l’arbre du profil ne fait pas passer la garde ; dans une décision du projet, il ne bloque rien', async () => {
  const { Socle } = await import('../src/socle.js');
  const { default: inventaireArbre } = await import('../src/inventaire/arbre.js');
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const d = path.join(r, 'depot');
  const g = (...a) => { const x = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(x.status, 0, x.stderr); };
  fs.mkdirSync(d); g('init', '-q'); g('config', 'user.name', 'Alice Exemple'); g('config', 'user.email', 'alice@exemple.test'); g('config', 'commit.gpgsign', 'false');
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Projet Zeta]\n---\n');
  const contexte = path.join(r, 'profil', 'arbre', 'contextes', 'perso.md');
  const enTeteContexte = 'type: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n'
    + 'rules:\n  - id: rien-de-personnel\n    statement: Aucune donnée personnelle dans un fichier suivi.\n    level: blocking\n    check: [donnees-personnelles]\n    status: stable\n    approved: { by: human:alice, at: 2026-10-07 }\n';
  ecrire(contexte, `---\n${enTeteContexte}---\n`);
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  const decision = path.join(d, 'arbre', 'decisions', 'une.md');
  ecrire(decision, '---\ntype: decision\ntitle: Une décision\nstatus: draft\n---\n');
  ecrire(path.join(d, 'note.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'départ');
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer();
  const plusTard = (f, n) => { const t = new Date(Date.now() + n * 1000); fs.utimesSync(f, t, t); };

  // Un en-tête cassé dans une décision du projet : rien n'en dépend, la garde décide normalement.
  ecrire(decision, '---\ntype: [decision\n---\n'); plusTard(decision, 2);
  ecrire(path.join(d, 'note.md'), 'note du projet zeta\n'); g('add', 'note.md');
  assert.deepEqual(s.garde({ depot: d }).refus.map((x) => x.regle), ['rien-de-personnel']);

  // L'en-tête du contexte devient illisible : avant, le contexte disparaissait avec sa règle bloquante, le projet
  // passait pour non déclaré et la garde laissait passer le commit.
  ecrire(contexte, `---\n${enTeteContexte}  - [ouverte\n---\n`); plusTard(contexte, 4);
  const refus = s.garde({ depot: d }).refus;
  assert.deepEqual(refus.map((x) => x.regle), ['regles-lisibles'], 'la garde ne dit pas conforme ce qu’elle ne peut pas lire');
  assert.match(refus[0].ecarts[0].message, /perso\.md : en-tête illisible/);
});

test('Troisième contre-épreuve (1, 2, 5) : ni rapatriement d’un clone partiel, ni programme de signature, ni diff de sous-module', () => {
  const temoin = path.join(tmp(), 'execute');
  // 1 : un clone partiel dont la configuration désigne un programme de transport.
  const src = tmp(); depotAvecCommit(src, { 'f.txt': 'x\n' }); spawnSync('git', ['-C', src, 'config', 'uploadpack.allowFilter', 'true']);
  const part = path.join(tmp(), 'part');
  assert.equal(spawnSync('git', ['clone', '-q', '--no-local', '--filter=tree:0', '--no-checkout', `file://${src}`, part]).status, 0);
  spawnSync('git', ['-C', part, 'config', 'remote.origin.uploadpack', `${piege(part, temoin)} uploadpack`]);
  gitLu(part, ['status', '--porcelain']); gitLu(part, ['archive', '--format=tar', 'HEAD'], { encoding: 'buffer' });
  // 2 : un export-subst qui demande la vérification d'une signature.
  const d = tmp(); depotAvecCommit(d, { 'f.txt': '$Format:%G?$\n', '.gitattributes': 'f.txt export-subst\n' });
  const g = (...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' });
  const corps = g('cat-file', 'commit', 'HEAD').stdout.replace(/\n\n/, '\ngpgsig -----BEGIN PGP SIGNATURE-----\n \n -----END PGP SIGNATURE-----\n\n');
  const signe = spawnSync('git', ['-C', d, 'hash-object', '-t', 'commit', '-w', '--stdin'], { input: corps, encoding: 'utf8' }).stdout.trim();
  g('update-ref', 'HEAD', signe); g('config', 'gpg.program', `${piege(d, temoin)} gpg`);
  gitLu(d, ['archive', '--format=tar', 'HEAD'], { encoding: 'buffer' });
  // 5 : diff.submodule=diff ferait lancer le textconv déclaré par un sous-module.
  const sous = tmp(); depotAvecCommit(sous, { 'f.txt': 'x\n', '.gitattributes': '*.txt diff=x\n' });
  const p = tmp(); depotAvecCommit(p, { 'a.txt': 'a\n' });
  spawnSync('git', ['-C', p, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sous, 's']);
  spawnSync('git', ['-C', path.join(p, 's'), 'config', 'diff.x.textconv', `${piege(p, temoin)} textconv`]);
  spawnSync('git', ['-C', p, 'config', 'diff.submodule', 'diff']);
  fs.appendFileSync(path.join(p, 's', 'f.txt'), 'z\n'); spawnSync('git', ['-C', path.join(p, 's'), '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qam', 'z']);
  spawnSync('git', ['-C', p, 'add', 's']);
  gitLu(p, ['diff', '--cached', '-U0']);
  assert.deepEqual(fs.readdirSync(path.dirname(temoin)), [], 'programmes du dépôt exécutés');
});

test('Seconde contre-épreuve (E, F) : un type inconnu ne compte que les en-têtes illisibles qui pouvaient être lui ; les autres du projet se disent', async () => {
  const { Socle } = await import('../src/socle.js');
  const { default: inventaireArbre } = await import('../src/inventaire/arbre.js');
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const d = path.join(r, 'depot'); const autre = path.join(r, 'autre');
  for (const x of [d, autre]) spawnSync('git', ['init', '-q', x]);
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\ntypes: [methode-holrach]\n---\n');
  ecrire(path.join(autre, 'arbre', 'index.md'), '---\ntype: guideline\nid: autre\ntitle: Autre\nstatus: draft\n---\n');
  // Une décision illisible d'un projet sans rapport (« : » non cité dans la description, comme dans le socle).
  ecrire(path.join(autre, 'arbre', 'decisions', 'une.md'), '---\ntype: decision\ntitle: Une\ndescription: Après l’essai : rien\nstatus: stable\n---\n');
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: {} });
  const charger = () => {
    s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d, autre], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
      ...[d, autre].map((x) => ({ id: `holarch:project:${path.basename(x)}`, kind: 'project', name: path.basename(x), status: 'active', location: x, provenance: { source: 't' } }))]);
    s.indexer();
  };
  charger();
  let e = s.regles({ projet: 'holarch:project:depot' });
  assert.ok(e.signaux.some((x) => /type inconnu : methode-holrach/.test(x)));
  assert.deepEqual(e.illisibles, [], 'la décision d’un projet sans rapport rend la règle effective incomplète');
  assert.equal(s.garde({ depot: d }).refus.length, 0);

  // Un type illisible qui porte cet id, lui, pouvait être le type manquant.
  ecrire(path.join(autre, 'arbre', 'types', 'm.md'), '---\ntype: template\nid: methode-holrach\ntitle: [ouvert\n---\n');
  charger();
  e = s.regles({ projet: 'holarch:project:depot' });
  assert.equal(e.illisibles.length, 1); assert.match(e.illisibles[0], /types\/m\.md/);
  // Troisième contre-épreuve (3) : un commentaire en fin de ligne, ou deux valeurs (conflit de fusion), ne l'écartent pas.
  for (const entete of ['type: template  # note\nid: methode-holrach # v2', 'type: "template" # x\nid: methode-holrach',
    '<<<<<<< HEAD\ntype: decision\n=======\ntype: template\n>>>>>>> autre\nid: methode-holrach']) {
    ecrire(path.join(autre, 'arbre', 'types', 'm.md'), `---\n${entete}\ntitle: [ouvert\n---\n`);
    charger();
    assert.equal(s.regles({ projet: 'holarch:project:depot' }).illisibles.length, 1, entete);
  }

  // F : une décision illisible du projet lui-même ne bloque rien, mais se dit.
  fs.rmSync(path.join(autre, 'arbre', 'types'), { recursive: true });
  ecrire(path.join(d, 'arbre', 'decisions', 'deux.md'), '---\ntype: decision\ntitle: Deux\ndescription: Avant : après\nstatus: draft\n---\n');
  charger();
  e = s.regles({ projet: 'holarch:project:depot' });
  assert.deepEqual(e.illisibles, []);
  assert.ok(e.signaux.some((x) => /depot:\/arbre\/decisions\/deux\.md : en-tête illisible.*\(sans effet sur les règles\)/.test(x)), e.signaux.join(' | '));
});

test('Contre-épreuve (4) : regles appliquer n’écrit pas le compte quand un projet demandé a des règles illisibles', async () => {
  const { Socle } = await import('../src/socle.js');
  const { default: inventaireArbre } = await import('../src/inventaire/arbre.js');
  const { appliquerRegles } = await import('../src/materialisation.js');
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const home = tmp(); const d = path.join(r, 'depot');
  spawnSync('git', ['init', '-q', d]);
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: francais\n  statement: Répondre en français.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: [ouverte\n');
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer();
  assert.throws(() => appliquerRegles(s, ['depot'], [{ nom: 'essai', home }]), /règles illisibles, rien n'est écrit : depot:\/arbre\/index\.md/);
  assert.deepEqual(fs.readdirSync(home), [], 'le compte n’est pas réécrit');
  // Sans le projet illisible, le compte s'écrit.
  const ok = appliquerRegles(s, [], [{ nom: 'essai', home }]);
  assert.deepEqual(ok.comptes[0].fichiers.crees, ['francais.md']);
});

test('regles appliquer n’écrit rien sans profil (non désigné ou introuvable), ni au compte ni aux projets, comme des règles illisibles', async () => {
  const { Socle } = await import('../src/socle.js');
  const { default: inventaireArbre } = await import('../src/inventaire/arbre.js');
  const { appliquerRegles } = await import('../src/materialisation.js');
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const home = tmp();
  const arbre = (nom) => {
    ecrire(path.join(r, nom, 'arbre', 'index.md'), `---\ntype: guideline\nid: ${nom}\ntitle: Arbre ${nom}\nstatus: draft\n---\n`);
    ecrire(path.join(r, nom, 'arbre', 'rules.yaml'), '- id: francais\n  statement: Répondre en français.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
    ecrire(path.join(r, nom, 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
    return path.join(r, nom);
  };
  // Un projet du catalogue, nommé à la commande : refusé de même (sa règle hérite du profil).
  const projet = tmp(); ecrire(path.join(projet, 'README.md'), 'x\n');
  const appliquer = (profil, ...depots) => appliquerA([], profil, ...depots);
  const appliquerA = (refs, profil, ...depots) => {
    const s = new Socle({ site: 'local', profil, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots } } });
    s.catalogue.remplacer([...inventaireArbre({}, { depots, projetDe: () => null }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: projet, provenance: { source: 't' } }]); s.indexer();
    return appliquerRegles(s, refs, [{ nom: 'essai', home }]);
  };
  // Aucun profil désigné (un arbre qui porte un contexte n'en fait pas un) : la règle du compte retirerait tout ce qui
  // est posé. Désigné mais introuvable (dépôt absent de ce site) : la règle est incomplète, comme une règle illisible.
  assert.throws(() => appliquer(null, arbre('p1')), /^Error: règles du compte indéterminées, rien n'est écrit : aucun profil désigné sur ce site/);
  assert.throws(() => appliquer(path.join(r, 'absent'), arbre('p1')), /règles illisibles, rien n'est écrit : profil désigné introuvable : .*absent/);
  assert.deepEqual(fs.readdirSync(home), [], 'le compte n’est pas écrit');
  assert.throws(() => appliquerA(['depot'], null, path.join(r, 'p1')), /règles du compte indéterminées, rien n'est écrit : aucun profil désigné/);
  assert.deepEqual(fs.readdirSync(projet), ['README.md'], 'le projet nommé n’est pas écrit non plus');
  assert.deepEqual(appliquer(path.join(r, 'p1'), path.join(r, 'p1'), arbre('p2')).comptes[0].fichiers.crees, ['francais.md'], 'le profil désigné : écrit, l’autre arbre à contexte n’en fait pas un second');
});

test('Contre-épreuve (6) : des règles illisibles ne résolvent pas l’écart d’une mémoire remplacée', async () => {
  const { Socle } = await import('../src/socle.js');
  const { default: inventaireArbre } = await import('../src/inventaire/arbre.js');
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const d = path.join(r, 'depot');
  spawnSync('git', ['init', '-q', d]);
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  const regles = path.join(d, 'arbre', 'rules.yaml');
  ecrire(regles, '- id: tests-verts\n  statement: Les tests passent avant de rendre.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n  replaces: [vieille-memoire]\n');
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
  const relire = () => { s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: null, provenance: { source: 't' } },
    { id: 'holarch:memory:mem1', kind: 'memory', name: 'vieille-memoire', status: 'active', classification: 'internal', location: '/memoires/vieille-memoire.md', links: { project: ['holarch:project:depot'] }, provenance: { source: 't' } }]); s.indexer(); };
  relire();
  const ouverts = () => s.ecartsOuverts().map((o) => o.controle).sort();
  s.audit({ projet: 'depot', journaliser: true }); s.indexer();
  assert.deepEqual(ouverts(), ['memoire-remplacee']);
  fs.writeFileSync(regles, '- id: [ouverte\n'); relire();
  const a = s.audit({ projet: 'depot', journaliser: true }); s.indexer();
  assert.equal(a.journal.resolus, 0, 'la règle qui remplace la mémoire n’est plus lue : rien n’est résolu');
  assert.deepEqual(ouverts(), ['memoire-remplacee', 'regles-lisibles']);
  assert.ok(a.cibles[0].controles.some((c) => c.id === 'memoire-remplacee' && c.etat === 'indisponible'));
});

test('Contre-épreuve (7) : un profil illisible fait un écart au compte, pas un de plus par projet', async () => {
  const { Socle } = await import('../src/socle.js');
  const { default: inventaireArbre } = await import('../src/inventaire/arbre.js');
  const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const d = path.join(r, 'depot');
  spawnSync('git', ['init', '-q', d]);
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: [ouverte\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: rappel\n  statement: Un rappel fictif.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer();
  const a = s.audit();
  const lisibles = a.cibles.map((c) => [c.projet, c.ecarts.filter((e) => e.controle === 'regles-lisibles').length]);
  assert.deepEqual(lisibles, [[null, 1], ['holarch:project:depot', 0]]);
  assert.ok(a.cibles[1].controles.some((c) => c.id === 'regles-a-jour' && c.etat === 'indisponible'), 'les règles du projet restent incomplètes');
  assert.deepEqual(s.garde({ depot: d }).refus.map((x) => x.regle), ['regles-lisibles'], 'la garde du projet refuse toujours');
});

test('claude introuvable : la récolte et l’accès distant disent la même chose, réglage compris', async () => {
  const { regroupeurClaude } = await import('../src/recolte.js');
  assert.throws(() => regroupeurClaude({ claude: null })('texte'), /acces_distant\.claude pour le préciser/);
  // Seconde contre-épreuve (H) : un réglage posé mais faux se nomme, au lieu du PATH.
  const config = { acces_distant: { claude: '/nulle/part/claude' } };
  assert.throws(() => regroupeurClaude({ claude: null, config })('texte'), /acces_distant\.claude \(\/nulle\/part\/claude\) n'existe pas/);
});

test('Faille du conteneur : un montage de l’hôte qui expose un identifiant ou écrit les données de HOLARCH est un écart', () => {
  const maison = tmp(); const d = path.join(maison, 'projet'); const holarch = path.join(maison, '.claude', 'holarch');
  fs.mkdirSync(path.join(d, '.devcontainer', 'gpu'), { recursive: true });
  const ecrire = (f, t) => fs.writeFileSync(path.join(d, f), t);
  const ctx = { depot: d, maison, env: { HOME: maison }, holarch: [holarch, path.join(maison, 'donnees')] };
  const lire = () => executer('montage-sensible', ctx, 'audit');
  // Le modèle de conteneur d'avant : `~/.claude` de l'hôte monté en écriture, commentaires et virgule finale (JSONC).
  ecrire('.devcontainer/devcontainer.json', `{
  // commentaire
  "mounts": [
    "source=\${localEnv:HOME}/.claude,target=/home/vscode/.claude,type=bind",
    "source=projet-ssh,target=/home/vscode/.ssh,type=volume",
  ],
}`);
  let r = lire();
  assert.deepEqual(r.ecarts.map((e) => [e.fichier, e.ligne, e.cle]), [['.devcontainer/devcontainer.json', 4, 'montage:.devcontainer/devcontainer.json:/home/vscode/.claude']]);
  assert.match(r.ecarts[0].message, /~\/\.claude \(identifiants de l’hôte\).*en écriture/);
  assert.ok(!r.ecarts[0].message.includes(maison), 'le dossier personnel n’est jamais écrit en clair');
  // Le correctif : un volume nommé et CLAUDE_CONFIG_DIR ; rien à dire.
  ecrire('.devcontainer/devcontainer.json', '{ "mounts": ["source=projet-claude,target=/home/vscode/.claude,type=volume"], "containerEnv": { "CLAUDE_CONFIG_DIR": "/home/vscode/.claude" } }');
  assert.deepEqual(lire().ecarts, []);
  // En lecture seule, un identifiant reste lisible : écart. Les données de HOLARCH en lecture : permis ; en écriture : écart.
  ecrire('.devcontainer/devcontainer.json', JSON.stringify({ mounts: [
    { source: '${localEnv:HOME}/.ssh', target: '/s', type: 'bind' },
    `source=${path.join(maison, 'donnees')},target=/d,type=bind,readonly`,
    `source=${path.join(maison, 'donnees')},target=/e,type=bind,readonly=false`,
    'source=~/projets,target=/p,type=bind'] }));
  assert.deepEqual(lire().ecarts.map((e) => e.cle.split(':').pop()), ['/s', '/e']);
  // Un parent d'un identifiant l'expose (dossier personnel entier, `..` du dépôt) ; `-v` et `--mount` de runArgs ; Docker de l'hôte.
  ecrire('.devcontainer/devcontainer.json', JSON.stringify({ workspaceMount: 'source=${localWorkspaceFolder}/..,target=/w,type=bind',
    runArgs: ['-v', '/var/run/docker.sock:/var/run/docker.sock', '--mount=type=bind,src=~/.config,dst=/c,ro', '-v', 'cache:/cache'] }));
  r = lire();
  assert.deepEqual(r.ecarts.map((e) => e.cle.split(':').pop()), ['/w', '/var/run/docker.sock', '/c']);
  assert.match(r.ecarts[0].message, /monte ~, qui contient ~\/\.claude/);
  assert.match(r.ecarts[1].message, /Docker de l’hôte/);
  assert.match(r.ecarts[2].message, /~\/\.config, qui contient ~\/\.config\/gh.*en lecture/);
  // Une seconde configuration (sous-dossier) est lue aussi ; un lien vers un identifiant se voit par sa cible.
  fs.mkdirSync(path.join(maison, '.aws')); fs.symlinkSync(path.join(maison, '.aws'), path.join(maison, 'lien'));
  ecrire('.devcontainer/devcontainer.json', '{}');
  ecrire('.devcontainer/gpu/devcontainer.json', JSON.stringify({ mounts: ['type=bind,source=~/lien,target=/l'] }));
  assert.deepEqual(lire().ecarts.map((e) => [e.fichier, e.message.split(' (')[0]]), [['.devcontainer/gpu/devcontainer.json', 'monte ~/.aws']]);
  // Ne se dit jamais conforme sans avoir lu : fichier illisible, Compose, variable inconnue.
  ecrire('.devcontainer/gpu/devcontainer.json', '{ "mounts": [');
  assert.match(lire().indisponible, /gpu\/devcontainer\.json illisible/);
  ecrire('.devcontainer/gpu/devcontainer.json', '{ "dockerComposeFile": "compose.yml" }');
  assert.match(lire().indisponible, /Docker Compose/);
  ecrire('.devcontainer/gpu/devcontainer.json', '{ "mounts": ["type=bind,source=${containerEnv:X},target=/x"] }');
  assert.match(lire().indisponible, /non résolue/);
  // Admis sous ~/.claude : le dossier de transcriptions du projet du conteneur (nommé d'après son dossier de travail),
  // et les règles du compte en lecture seule ; ni celui d'un autre projet, ni tous les projets, ni les règles en écriture.
  ecrire('.devcontainer/gpu/devcontainer.json', JSON.stringify({ workspaceFolder: '/workspaces/mon_projet', mounts: [
    'type=bind,source=${localEnv:HOME}/.claude/projects/-workspaces-mon-projet,target=/home/node/.claude/projects/-workspaces-mon-projet',
    'type=bind,source=${localEnv:HOME}/.claude/rules,target=/home/node/.claude/rules,readonly',
    'type=bind,source=${localEnv:HOME}/.claude/projects/-workspaces-autre,target=/a',
    'type=bind,source=${localEnv:HOME}/.claude/projects,target=/t',
    'type=bind,source=${localEnv:HOME}/.claude/rules,target=/r'] }));
  r = lire();
  assert.deepEqual(r.ecarts.map((e) => e.cle.split(':').pop()), ['/a', '/t', '/r']);
  assert.match(r.ecarts[0].message, /monte ~\/\.claude\/projects\/-workspaces-autre, dans ~\/\.claude \(identifiants/);
  assert.match(r.ecarts[1].message, /monte ~\/\.claude\/projects, dans ~\/\.claude \(identifiants/);
  assert.match(r.ecarts[2].message, /~\/\.claude\/rules \(règles du compte, lues par les sessions de l’hôte\).*en écriture/);
  // Sans conteneur, rien n'est monté.
  fs.rmSync(path.join(d, '.devcontainer'), { recursive: true });
  assert.deepEqual(lire().ecarts, []);
});

// Contre-épreuve de la faille du conteneur (2026-10-09) : un essai par constat.
function conteneurEssai() {
  const maison = tmp(); const d = path.join(maison, 'projet'); fs.mkdirSync(path.join(d, '.devcontainer'), { recursive: true });
  const ctx = { depot: d, maison, env: { HOME: maison }, holarch: [path.join(maison, '.claude', 'holarch')], conteneurs: [], maisonsWindows: [], distants: [] };
  const config = (c) => fs.writeFileSync(path.join(d, '.devcontainer', 'devcontainer.json'), typeof c === 'string' ? c : JSON.stringify(c));
  return { maison, d, ctx, config, lire: () => executer('montage-sensible', ctx, 'audit'), cibles: (r) => r.ecarts.map((e) => e.cle.split(':').pop()) };
}
const transcriptions = (dossier) => `type=bind,source=\${localEnv:HOME}/.claude/projects/${dossier},target=/home/node/.claude/projects/${dossier}`;

test('Contre-épreuve du conteneur (1, 18, 21) : seul un dossier de travail sous /workspaces/, résolu et normalisé, ouvre son dossier de transcriptions', () => {
  const { config, lire, cibles } = conteneurEssai();
  // Un dossier de travail de l'hôte : sa mémoire, chargée par les sessions de l'hôte, n'est pas admise.
  config({ workspaceFolder: '/home/alice/projet', mounts: [transcriptions('-home-alice-projet')] });
  assert.deepEqual(cibles(lire()), ['/home/node/.claude/projects/-home-alice-projet']);
  config({ workspaceFolder: '/workspaces/../home/alice/x', mounts: [transcriptions('-workspaces----home-alice-x'), transcriptions('-home-alice-x')] });
  assert.equal(lire().ecarts.length, 2);
  config({ workspaceFolder: '${localWorkspaceFolder}', mounts: [transcriptions('-tmp')] });
  assert.equal(lire().ecarts.length, 1);
  // Résolu et normalisé comme le CLI : la variable du nom du dossier, le `/` final.
  config({ workspaceFolder: '/workspaces/${localWorkspaceFolderBasename}', mounts: [transcriptions('-workspaces-projet')] });
  assert.deepEqual(lire().ecarts, []);
  config({ workspaceFolder: '/workspaces/projet/', mounts: [transcriptions('-workspaces-projet')] });
  assert.deepEqual(lire().ecarts, []);
  // Un nom que Claude Code tronquerait (plus de 200 caractères) n'est pas admis.
  const long = `/workspaces/${'x'.repeat(200)}`;
  config({ workspaceFolder: long, mounts: [transcriptions(dossierClaude(long))] });
  assert.equal(lire().ecarts.length, 1);
});

test('Contre-épreuve du conteneur (14) : un contrôle lu en partie garde ses écarts ; non disponible, il ne résout pas ce qu’il n’a pas vu', () => {
  const r = tmp(); const accueil = tmp(); const d = path.join(r, 'depot');
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  ecrireF(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\n---\n');
  ecrireF(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: conteneur-isole\n  statement: Un conteneur ne monte rien de sensible de l’hôte.\n  level: verified\n  check: [montage-sensible]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-09 }\n');
  ecrireF(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  const config = (f, c) => ecrireF(path.join(d, '.devcontainer', f), JSON.stringify(c));
  const bind = (src, dst) => `type=bind,source=\${localEnv:HOME}/${src},target=${dst}`;
  config('devcontainer.json', { mounts: [bind('.ssh', '/s'), bind('.aws', '/a')] });
  const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil')], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const auditer = () => { const a = s.audit({ journaliser: true }); return { ...a.cibles.find((c) => c.projet === 'holarch:project:depot'), journal: a.journal }; };
  let a = auditer();
  assert.deepEqual([a.ecarts.map((e) => e.cle.split(':').pop()), a.journal.apparus], [['/s', '/a'], 2]);
  // Une seconde configuration illisible : l'écart encore vu reste dit, celui qui a disparu n'est pas résolu pour autant.
  config('devcontainer.json', { mounts: [bind('.ssh', '/s')] }); ecrireF(path.join(d, '.devcontainer', 'b', 'devcontainer.json'), '{ "mounts": [');
  a = auditer();
  assert.deepEqual(a.ecarts.map((e) => e.cle.split(':').pop()), ['/s']);
  assert.deepEqual(a.controles.map((c) => [c.id, c.etat]), [['montage-sensible', 'indisponible']]);
  assert.match(a.controles[0].raison, /b\/devcontainer\.json illisible/);
  assert.deepEqual([a.journal.apparus, a.journal.resolus], [0, 0]);
  // Relu en entier : l'écart disparu se résout.
  fs.rmSync(path.join(d, '.devcontainer', 'b'), { recursive: true });
  a = auditer();
  assert.deepEqual([a.controles[0].etat, a.journal.resolus], ['fait', 1]);
});

test('Contre-épreuve du conteneur (2) : un bind se lit comme le CLI Docker (casse, CSV, booléens) ; ce que Docker refuserait n’est pas conforme', () => {
  const { config, lire, cibles } = conteneurEssai();
  config({ mounts: ['type=BIND,source=${localEnv:HOME}/.ssh,target=/a', { type: 'Bind', source: '${localEnv:HOME}/.ssh', target: '/b' },
    '"type=bind","source=${localEnv:HOME}/.ssh",target=/c', 'Type=Bind,Source=${localEnv:HOME}/.aws,Target=/d,ro=f',
    'type=volume,source=projet-cache,target=/e'] });
  let r = lire();
  assert.deepEqual([cibles(r), r.indisponible], [['/a', '/b', '/c', '/d'], undefined]);
  assert.match(r.ecarts[3].message, /en écriture/, '`ro=f` est faux pour Go : monté en écriture');
  // Clé inconnue, booléen invalide, type absent ou inconnu, guillemet mal placé : non disponible, les autres écarts gardés.
  config({ mounts: ['type=bind,source=${localEnv:HOME}/.ssh,target=/a', 'type=bind,sorce=${localEnv:HOME}/.ssh,target=/x',
    'type=bind,source=/tmp,target=/y,ro=oui', { source: '/tmp', target: '/z' }, 'type=lien,source=/tmp,target=/w', 'type=bind,source=a"b,target=/v'] });
  r = lire();
  assert.deepEqual(cibles(r), ['/a']);
  assert.deepEqual(r.indisponible.split(' ; ').map((x) => x.split('(')[1]), ['mounts.1)', 'mounts.2)', 'mounts.3)', 'mounts.4)', 'mounts.5)']);
});

test('Contre-épreuve du conteneur (13, 26, 14, 15) : variables comme le CLI Dev Containers ; `-v` découpé hors des variables, une partie est un volume anonyme', () => {
  const { config, lire, cibles } = conteneurEssai();
  // Une variable absente de l'environnement de l'audit, sans défaut : non disponible (celui qui ouvre le conteneur peut l'avoir).
  config({ mounts: ['type=bind,source=${localEnv:ABSENTE}/.ssh,target=/a'] });
  assert.match(lire().indisponible, /non résolue \(\$\{localEnv:ABSENTE\}\/\.ssh\)/);
  // Le défaut s'arrête au `:` suivant : `${localEnv:ABSENTE:~:x}` vaut `~`.
  config({ mounts: ['type=bind,source=${localEnv:ABSENTE:~:x}/.ssh,target=/b'] });
  assert.deepEqual(cibles(lire()), ['/b']);
  // `-v` : une variable qui contient `:` n'est pas coupée ; une seule partie est un volume anonyme, pas un montage de l'hôte.
  config({ runArgs: ['-v', '${localEnv:HOME}/.ssh:/c', '-v', '${localEnv:ABSENTE:~/.aws}:/d:ro', '-v', '/home/alice/.claude', '-v', 'cache:/e'] });
  let r = lire();
  assert.deepEqual([cibles(r), r.indisponible], [['/c', '/d'], undefined]);
  assert.match(r.ecarts[1].message, /~\/\.aws.*en lecture/);
  // Ce que Docker refuserait (cible et mode seuls, quatre parties) et un chemin Windows : non disponible.
  config({ runArgs: ['-v', '/x:ro', '-v', 'a:b:c:d', '-v', 'C:\\Users\\alice\\.ssh:/s'] });
  r = lire();
  assert.deepEqual([r.ecarts, r.indisponible.split(' ; ').length], [[], 3]);
});

test('Contre-épreuve du conteneur (3) : options de runArgs lues comme le CLI Docker, privilèges du fichier et features locales', () => {
  const { d, config, lire } = conteneurEssai();
  const cles = (r) => r.ecarts.map((e) => e.cle.split(':').slice(2).join(':'));
  config({ runArgs: ['-v${localEnv:HOME}/.ssh:/a', '-itv', '${localEnv:HOME}/.aws:/b', '-v=${localEnv:HOME}/.kube:/c', '--rm', '-e', 'X=1',
    '--volumes-from', 'autre', '--privileged', '--privileged=false', '--cap-add=SYS_ADMIN', '--device', '/dev/bus/usb', '--pid=host',
    '--network=host', '--security-opt', 'seccomp=unconfined', '--security-opt=no-new-privileges', '--use-api-socket'] });
  let r = lire();
  assert.deepEqual(cles(r), ['/a', '/b', '/c', 'volumes-from:autre', 'privileged', 'cap-add:SYS_ADMIN', 'device:/dev/bus/usb', 'pid:host', 'security-opt:seccomp=unconfined', 'use-api-socket']);
  assert.match(r.ecarts.find((e) => e.cle.endsWith(':privileged')).message, /conteneur privilégié.*l’isolement du conteneur ne tient plus/);
  // Les mêmes privilèges écrits en propriétés du fichier, ligne comprise.
  config('{\n  "privileged": true,\n  "capAdd": ["SYS_PTRACE"],\n  "securityOpt": ["apparmor=unconfined", "label=type:x"]\n}');
  r = lire();
  assert.deepEqual(r.ecarts.map((e) => [cles({ ecarts: [e] })[0], e.ligne]), [['privileged', 2], ['cap-add:SYS_PTRACE', 3], ['security-opt:apparmor=unconfined', 4]]);
  // Une feature locale ajoute ses montages et privilèges ; une feature locale absente n'est pas lue ; une feature publiée ne se lit pas ici.
  fs.mkdirSync(path.join(d, '.devcontainer', 'outil'));
  fs.writeFileSync(path.join(d, '.devcontainer', 'outil', 'devcontainer-feature.json'), JSON.stringify({ id: 'outil', privileged: true, mounts: [{ type: 'bind', source: '/var/run/docker.sock', target: '/var/run/docker.sock' }] }));
  config({ features: { './outil': {}, 'ghcr.io/devcontainers/features/git:1': {} } });
  r = lire();
  assert.deepEqual(r.ecarts.map((e) => [e.fichier, cles({ ecarts: [e] })[0]]), [['.devcontainer/outil/devcontainer-feature.json', '/var/run/docker.sock'], ['.devcontainer/outil/devcontainer-feature.json', 'privileged']]);
  assert.match(r.indisponible, /features publiées \(ghcr\.io\/devcontainers\/features\/git:1\) non lues, et aucun conteneur du dépôt à inspecter/);
  config({ features: { './manque': {} } });
  assert.match(lire().indisponible, /manque\/devcontainer-feature\.json absent/);
});

test('Contre-épreuve du conteneur (24) : toute variable de l’hôte qui entre dans le conteneur est un écart, nommée sans sa valeur', () => {
  const { config, lire, ctx } = conteneurEssai();
  ctx.env.JETON = 'valeur-secrete';
  config({ initializeCommand: 'mkdir -p ${localEnv:HOME}/.claude/rules', mounts: ['type=bind,source=${localEnv:HOME}/.claude/rules,target=/r,readonly'],
    remoteEnv: { DEPLOI: '${localEnv:JETON}', PATH: '${containerEnv:PATH}:/x' }, containerEnv: { HOTE: 'chez ${env:USER}' },
    build: { args: { CLE: '${localEnv:JETON:aucun}' } }, postCreateCommand: 'echo ${localEnv:JETON} > /tmp/x',
    runArgs: ['-v', '${localEnv:HOME}/cache:/cache', '-e', 'JETON', '-e', 'FIXE=1', '--env-file', '/home/alice/.env'] });
  const r = lire();
  assert.deepEqual(r.ecarts.map((e) => e.cle.split(':').pop()), ['remoteEnv.DEPLOI', 'containerEnv.HOTE', 'build.args.CLE', 'postCreateCommand', 'runArgs.3', 'runArgs.7']);
  assert.match(r.ecarts[0].message, /passe JETON de l’hôte au conteneur \(remoteEnv\.DEPLOI\)/);
  assert.match(r.ecarts[5].message, /passe fichier \/home\/alice\/\.env/);
  assert.ok(!JSON.stringify(r).includes('valeur-secrete'), 'la valeur n’est jamais écrite');
});

test('Contre-épreuve du conteneur (16) : les identifiants du dossier personnel Windows, vu de WSL, sont sensibles comme ceux de l’hôte', () => {
  const { maison, config, lire, ctx, cibles } = conteneurEssai();
  const mnt = path.join(maison, 'mnt'); const win = path.join(mnt, 'c', 'Users', 'alice');
  fs.mkdirSync(win, { recursive: true }); fs.mkdirSync(path.join(mnt, 'c', 'Users', 'Public'));
  config({ mounts: [`type=bind,source=${win}/.ssh,target=/a`, `type=bind,source=${path.join(mnt, 'c')},target=/b`, `type=bind,source=${path.join(mnt, 'c', 'Users', 'Public')},target=/c`] });
  assert.deepEqual(cibles(lire()), [], 'sans dossier Windows connu, rien ne change');
  assert.deepEqual(maisonsWindows(mnt), [win], 'les dossiers communs de Windows ne sont pas des dossiers personnels');
  ctx.maisonsWindows = maisonsWindows(mnt);
  const r = lire();
  assert.deepEqual(cibles(r), ['/a', '/b']);
  assert.match(r.ecarts[1].message, /qui contient .*alice\/\.claude \(identifiants de l’hôte\)/);
});

test('Contre-épreuve du conteneur (17) : un volume local en o=bind monte le chemin de l’hôte qu’il nomme', () => {
  const { config, lire, cibles } = conteneurEssai();
  config({ mounts: ['type=volume,source=cles,target=/a,volume-opt=type=none,volume-opt=o=bind,volume-opt=device=${localEnv:HOME}/.ssh',
    'type=volume,source=cache,target=/b,volume-opt=type=tmpfs,volume-opt=device=tmpfs'] });
  const r = lire();
  assert.deepEqual(cibles(r), ['/a']);
  assert.match(r.ecarts[0].message, /monte ~\/\.ssh \(identifiants/);
});

test('Contre-épreuve du conteneur (19) : un lien posé au chemin admis n’est pas admis ; un ~/.claude qui est lui-même un lien, si', () => {
  const { maison, config, lire, cibles } = conteneurEssai();
  const projets = path.join(maison, '.claude', 'projects'); fs.mkdirSync(projets, { recursive: true }); fs.mkdirSync(path.join(maison, '.ssh'));
  fs.symlinkSync(path.join(maison, '.ssh'), path.join(projets, '-workspaces-projet'));
  config({ mounts: [transcriptions('-workspaces-projet')] });
  const r = lire();
  assert.deepEqual(cibles(r), ['/home/node/.claude/projects/-workspaces-projet']);
  assert.match(r.ecarts[0].message, /monte ~\/\.claude\/projects\/-workspaces-projet, dans ~\/\.claude/);
  // ~/.claude déplacé ailleurs et remplacé par un lien : le dossier du projet (même pas encore créé) reste admis.
  fs.rmSync(path.join(projets, '-workspaces-projet'));
  fs.renameSync(path.join(maison, '.claude'), path.join(maison, 'ailleurs')); fs.symlinkSync(path.join(maison, 'ailleurs'), path.join(maison, '.claude'));
  assert.deepEqual(lire().ecarts, []);
});

test('Contre-épreuve du conteneur (5) : un conteneur déjà construit se juge sur ce que Docker a monté, features publiées comprises', () => {
  const { maison, config, lire, ctx } = conteneurEssai();
  const conteneur = (name, isolement) => ({ id: `holarch:container:${name}`, kind: 'container', name, attributes: { isolement } });
  const sain = { montages: [{ source: path.join(maison, '.claude', 'projects', '-workspaces-projet'), cible: '/p', lecture: false },
    { source: path.join(maison, '.claude', 'rules'), cible: '/r', lecture: true }, { source: path.join(maison, 'projet'), cible: '/workspaces/projet', lecture: false }],
  privilegie: false, capacites: [], peripheriques: [], espaces: [], protections: [], volumes_de: [] };
  // Le fichier corrigé, mais l'ancien conteneur monte encore ~/.claude en écriture : `devcontainer up` le relancerait tel quel.
  config({ features: { 'ghcr.io/devcontainers/features/git:1': {} }, mounts: [transcriptions('-workspaces-projet')] });
  ctx.conteneurs = [conteneur('jolly', { ...sain, montages: [{ source: path.join(maison, '.claude'), cible: '/home/vscode/.claude', lecture: false }] }),
    conteneur('neuf', { ...sain, privilegie: true, capacites: ['SYS_ADMIN'], espaces: ['PidMode'], protections: ['seccomp=unconfined'], volumes_de: ['jolly'] })];
  let r = lire();
  assert.deepEqual(r.ecarts.map((e) => e.cle), ['conteneur:jolly:/home/vscode/.claude', 'conteneur:neuf:privileged', 'conteneur:neuf:cap-add:SYS_ADMIN',
    'conteneur:neuf:PidMode', 'conteneur:neuf:security-opt:seccomp=unconfined', 'conteneur:neuf:volumes-from:jolly']);
  assert.match(r.ecarts[0].message, /le conteneur jolly, déjà construit, monte ~\/\.claude \(identifiants de l’hôte\).*en écriture : le reconstruire, ou le supprimer \(docker rm jolly\)/);
  assert.equal(r.indisponible, undefined, 'les features publiées se voient sur le conteneur construit');
  // Un conteneur sain ne dit rien ; sans configuration, seules les règles en lecture restent admises.
  ctx.conteneurs = [conteneur('neuf', sain)];
  assert.deepEqual(lire(), { ecarts: [] });
  fs.rmSync(path.join(maison, 'projet', '.devcontainer'), { recursive: true });
  assert.deepEqual(lire().ecarts.map((e) => e.cle), ['conteneur:neuf:/p']);
});

test('Contre-épreuve du conteneur (6) : ce qui, dans le dépôt que le conteneur écrit, s’exécute sur l’hôte', () => {
  const { d, config, lire, ctx } = conteneurEssai();
  const cles = () => lire().ecarts.map((e) => e.cle.split(':')[0] + ':' + e.cle.split(':').pop());
  // La création des dossiers admis est attendue ; toute autre commande de l'hôte, non.
  const admis = 'mkdir -p ${localEnv:HOME}/.claude/projects/-workspaces-projet ${localEnv:HOME}/.claude/rules';
  config({ initializeCommand: admis });
  assert.deepEqual(cles(), []);
  for (const autre of [`${admis} && curl x | sh`, 'mkdir -p ${localEnv:HOME}/.ssh', ['sh', '-c', 'id'], { a: admis, b: 'touch /tmp/x' }, `${admis}; $(id)`]) {
    config({ initializeCommand: autre });
    assert.deepEqual(cles(), ['initialisation:.devcontainer/devcontainer.json'], JSON.stringify(autre));
  }
  config({ initializeCommand: [admis] });
  assert.deepEqual(cles(), [], 'la forme tableau de la même commande');
  // Crochets des réglages Claude Code du dépôt, et accès distant de l'hôte posé sur ce dépôt (ou plus bas).
  config({});
  fs.mkdirSync(path.join(d, '.claude'));
  fs.writeFileSync(path.join(d, '.claude', 'settings.local.json'), JSON.stringify({ hooks: { SessionStart: [] }, permissions: {} }));
  fs.writeFileSync(path.join(d, '.claude', 'settings.json'), JSON.stringify({ permissions: {} }));
  ctx.distants = [{ nom: 'projet', chemin: d }, { nom: 'autre', chemin: path.dirname(d) }];
  const r = lire();
  assert.deepEqual(r.ecarts.map((e) => e.cle), ['crochets:.claude/settings.local.json', 'acces-distant:projet']);
  assert.match(r.ecarts[0].message, /crochets SessionStart dans un dépôt que le conteneur écrit/);
  // L'arbre du projet excepte un écart par sa clé exacte, avec sa raison (le socle, jusqu'à la livraison D) ; sans
  // raison, l'exception ne vaut pas.
  const excepter = (...x) => { ctx.couches = [{ origine: 'contexte', provenance: 'profil:/arbre/contextes/perso.md', config: { montage_sensible: { exceptions: x } } }]; };
  excepter({ ecart: 'acces-distant:projet' }, { ecart: 'crochets', pourquoi: 'x' });
  assert.deepEqual(lire().ecarts.map((e) => e.cle), ['crochets:.claude/settings.local.json', 'acces-distant:projet']);
  assert.deepEqual(lire().exceptions_ignorees, [{ ecart: 'acces-distant:projet', raison: 'sans raison', provenance: 'profil:/arbre/contextes/perso.md' }]);
  excepter({ ecart: 'acces-distant:projet', pourquoi: 'risque accepté jusqu’à D' });
  assert.deepEqual(lire().ecarts.map((e) => e.cle), ['crochets:.claude/settings.local.json']);
  delete ctx.couches;
  // Sans conteneur, rien de tout cela n'est un écart.
  fs.rmSync(path.join(d, '.devcontainer'), { recursive: true });
  assert.deepEqual(lire().ecarts, []);
});

test('Exceptions hors du dépôt (décision exceptions-hors-du-depot) : montage_sensible se lit au profil et au contexte, jamais dans ce que le conteneur écrit', () => {
  const { maison, d, config, lire, ctx } = conteneurEssai();
  const p = path.join(maison, 'profil');
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const exception = (cle = 'acces-distant:projet') => `config:\n  montage_sensible:\n    exceptions: [{ ecart: "${cle}", pourquoi: "jusqu’à D" }]\n`;
  const arbres = ({ contexte = '', type = '', projet = '' }) => {
    ecrireF(path.join(p, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\n---\n');
    ecrireF(path.join(p, 'arbre', 'contextes', 'perso.md'), `---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:projet]\n${contexte}---\n`);
    ecrireF(path.join(p, 'arbre', 'types', 'conteneur.md'), `---\ntype: template\nid: conteneur\ntitle: Conteneur\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n${type}---\n`);
    ecrireF(path.join(d, 'arbre', 'index.md'), `---\ntype: guideline\nid: projet\ntitle: Projet\nstatus: draft\ntypes: [conteneur]\n${projet}---\n`);
    return regleEffective(inventaireArbre({}, { depots: [p, d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }), 'holarch:project:projet', { profil: p });
  };
  config({}); ctx.distants = [{ nom: 'projet', chemin: d }];
  // Une session du conteneur écrit l'exception dans la racine de l'arbre du projet, ou dans un type : rien n'est lu, et
  // la règle effective le dit.
  let r = arbres({ type: exception(), projet: exception() });
  ctx.couches = r.couches;
  assert.deepEqual(lire().ecarts.map((e) => e.cle), ['acces-distant:projet'], 'l’exception écrite dans le dépôt ne fait rien taire');
  assert.deepEqual(lire().exceptions_ignorees, [
    { ecart: 'acces-distant:projet', raison: 'porté par un type, il se lit au profil et au contexte', provenance: 'profil:/arbre/types/conteneur.md' },
    { ecart: 'acces-distant:projet', raison: 'porté par un projet, il se lit au profil et au contexte', provenance: 'projet:/arbre/index.md' }]);
  assert.equal(r.config.montage_sensible, undefined);
  assert.deepEqual(r.signaux.filter((x) => x.startsWith('montage_sensible')).map((x) => x.split(' : ')[0]), ['montage_sensible porté par profil:/arbre/types/conteneur.md (type)', 'montage_sensible porté par projet:/arbre/index.md (projet)']);
  // Portée par le contexte du profil, hors du dépôt : elle vaut.
  r = arbres({ contexte: exception() });
  ctx.couches = r.couches;
  assert.deepEqual(lire().ecarts, []);
  assert.deepEqual(r.config.montage_sensible, { exceptions: [{ ecart: 'acces-distant:projet', pourquoi: 'jusqu’à D' }] });
  assert.ok(!r.signaux.some((x) => x.startsWith('montage_sensible')));
  // Le dépôt du profil, s'il est le dépôt contrôlé, ne s'excepte pas lui-même ; une autre clé se lit dans le dépôt.
  assert.equal(exceptions(r.couches, 'montage_sensible', 'ecart', { depot: p }).length, 0);
  assert.equal(exceptions(r.couches, 'montage_sensible', 'ecart', { depot: maison }).length, 0, 'un dépôt qui contient le profil');
  assert.equal(exceptions(r.couches, 'montage_sensible', 'ecart', { depot: d }).length, 1);
  // Vu par le contrôle lui-même : le dépôt du profil (ou celui qui le contient), contrôlé, garde son écart.
  for (const depot of [p, maison]) {
    ecrireF(path.join(depot, '.devcontainer', 'devcontainer.json'), '{}');
    const lu = executer('montage-sensible', { ...ctx, depot, distants: [{ nom: 'projet', chemin: p }] }, 'audit');
    // Le dossier personnel, monté par défaut comme dossier de travail, expose aussi ses identifiants.
    assert.deepEqual(lu.ecarts.map((e) => e.cle), [...(depot === maison ? [`montage:.devcontainer/devcontainer.json:/workspaces/${path.basename(maison)}`] : []), 'acces-distant:projet'], depot);
    assert.equal(lu.exceptions, undefined, depot);
    assert.deepEqual(lu.exceptions_ignorees, [{ ecart: 'acces-distant:projet', raison: 'écrite dans le dépôt contrôlé', provenance: 'profil:/arbre/contextes/perso.md' }], depot);
  }
  // De même pour celles des données personnelles (décision profil-designe).
  assert.equal(exceptions([{ origine: 'contexte', fichier: path.join(d, 'arbre', 'index.md'), config: { donnees_personnelles: { exceptions: [{ fichier: 'LICENSE', pourquoi: 'titulaire' }] } } }], 'donnees_personnelles', 'fichier', { depot: d }).length, 0);
  // Une clé de réglage au nom d'une propriété d'objet, écrite par le conteneur, ne met pas la règle effective en panne
  // (sans quoi la garde laissait passer le commit sans contrôle).
  r = arbres({ contexte: exception(), projet: 'config:\n  constructor: 1\n  toString: x\n  __proto__: { a: 1 }\n  hasOwnProperty: 2\n' });
  assert.deepEqual(r.config.montage_sensible, { exceptions: [{ ecart: 'acces-distant:projet', pourquoi: 'jusqu’à D' }] });
  assert.equal(exceptions(r.couches, 'constructor', 'ecart', { depot: d }).length, 0);
});

// Un profil (contexte qui déclare `depot` et `autre`), le type `conteneur` qui demande montage-sensible, deux projets de
// ce type ; `relire` refait le catalogue (`sans` : projets absents du catalogue de ce site).
function essaiExceptions() {
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const p = path.join(r, 'profil'); const d = path.join(r, 'depot'); const autre = path.join(r, 'autre');
  const cle = 'montage:.devcontainer/devcontainer.json:/home/node/.ssh';
  const contexte = (...cles) => ecrireF(path.join(p, 'arbre', 'contextes', 'perso.md'), `---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot, holarch:project:autre]\n${cles.length ? `config:\n  montage_sensible:\n    exceptions: [${cles.map((k) => `{ ecart: "${k}", pourquoi: essai }`).join(', ')}]\n` : ''}---\n`);
  ecrireF(path.join(p, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\n---\n');
  ecrireF(path.join(p, 'arbre', 'types', 'conteneur', 'index.md'), '---\ntype: template\nid: conteneur\ntitle: Conteneur\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  ecrireF(path.join(p, 'arbre', 'types', 'conteneur', 'rules.yaml'), '- id: conteneur-isole\n  statement: Rien de l’hôte dans le conteneur.\n  level: verified\n  check: [montage-sensible]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n');
  for (const x of [d, autre]) ecrireF(path.join(x, 'arbre', 'index.md'), `---\ntype: guideline\nid: ${path.basename(x)}\ntitle: ${path.basename(x)}\nstatus: draft\ntypes: [conteneur]\n---\n`);
  const devcontainer = (c) => ecrireF(path.join(d, '.devcontainer', 'devcontainer.json'), JSON.stringify(c));
  const s = new Socle({ site: 'local', profil: p, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [p] } } });
  const relire = ({ sans = [] } = {}) => { s.catalogue.remplacer([...inventaireArbre({}, { depots: [p, d, autre].filter((x) => fs.existsSync(x)), projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    ...[d, autre].filter((x) => !sans.includes(path.basename(x))).map((x) => ({ id: `holarch:project:${path.basename(x)}`, kind: 'project', name: path.basename(x), status: 'active', location: x, provenance: { source: 't' } }))]); s.indexer(); };
  const perimees = (a) => (a.cibles.find((c) => !c.projet)?.ecarts || []).filter((e) => e.cle.startsWith('exception-perimee:'));
  const ouvertes = () => s.ecartsOuverts().filter((o) => o.cle.startsWith('exception-perimee:')).map((o) => [o.projet, o.regle, o.cle, o.fichier]);
  return { s, p, d, cle, ecrireF, contexte, devcontainer, relire, perimees, ouvertes };
}

test('Exceptions hors du dépôt : une exception qui sert se dit, une exception qui ne sert plus est un écart du compte', async () => {
  const affichage = await import('../bin/affichage.js');
  const { s, d, cle, ecrireF, contexte, devcontainer, relire, perimees, ouvertes } = essaiExceptions();
  // L'exception du contexte fait taire l'écart du dépôt, et le dit (clé, raison, provenance) ; dans l'autre projet, elle
  // ne sert pas, mais elle sert quelque part : rien de périmé.
  contexte(cle); devcontainer({ mounts: ['source=${localEnv:HOME}/.ssh,target=/home/node/.ssh,type=bind'] }); relire();
  let a = s.audit({ journaliser: true });
  const rd = a.cibles.find((c) => c.projet === 'holarch:project:depot');
  assert.deepEqual(rd.ecarts.filter((e) => e.controle === 'montage-sensible'), []);
  const regle = s.fiches({ kind: 'rule' }).find((f) => f.name === 'conteneur-isole').id;
  assert.deepEqual(rd.controles.find((c) => c.id === 'montage-sensible').exceptions, [{ ecart: cle, pourquoi: 'essai', provenance: 'profil:/arbre/contextes/perso.md', utilisee: true, jugee: true, regle, regle_id: 'conteneur-isole' }]);
  assert.match(affichage.audit(a), new RegExp(`exception montage-sensible : ${cle.replace(/[.]/g, '\\.')} — essai \\(profil:/arbre/contextes/perso\\.md\\)`));
  // Écrite dans la racine de l'arbre du projet, elle ne vaut pas, et l'audit le dit.
  ecrireF(path.join(d, 'arbre', 'index.md'), `---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\ntypes: [conteneur]\nconfig:\n  montage_sensible:\n    exceptions: [{ ecart: "x", pourquoi: y }]\n---\n`);
  relire();
  assert.match(affichage.audit(s.audit({ journaliser: true })), /exception montage-sensible ignorée : x — porté par un projet, il se lit au profil et au contexte \(depot:\/arbre\/index\.md\)/);
  ecrireF(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\ntypes: [conteneur]\n---\n'); relire();
  assert.deepEqual(perimees(a), []);
  // Le montage retiré, l'exception ne fait plus rien taire nulle part : un écart du compte, au journal.
  devcontainer({});
  a = s.audit({ journaliser: true });
  assert.deepEqual(perimees(a).map((e) => [e.regle_id, e.controle, e.cle, e.fichier]), [['conteneur-isole', 'montage-sensible', `exception-perimee:${cle}`, 'profil:/arbre/contextes/perso.md']]);
  assert.match(perimees(a)[0].message, /ne fait taire aucun écart sur ce site \(essai\) : la retirer/);
  assert.deepEqual(ouvertes(), [[null, regle, `exception-perimee:${cle}`, 'profil:/arbre/contextes/perso.md']]);
  // Un audit d'un seul projet, ou un contrôle non disponible là où elle s'applique, ne juge rien et ne résout rien.
  assert.deepEqual(perimees(s.audit({ projet: 'depot', journaliser: true })), []);
  devcontainer({ dockerComposeFile: 'compose.yml' });
  assert.deepEqual(perimees(s.audit({ journaliser: true })), []);
  assert.equal(ouvertes().length, 1, 'toujours ouverte');
  // L'accès distant et les crochets du dépôt se lisent toujours en entier : une exception sur eux se juge même là où le
  // contrôle a lu le reste en partie (sur le poste, un projet aux features publiées non lues).
  contexte(cle, 'acces-distant:fantome', 'crochets:.claude/fantome.json'); relire();
  assert.deepEqual(perimees(s.audit({ journaliser: true })).map((e) => e.cle), ['exception-perimee:acces-distant:fantome', 'exception-perimee:crochets:.claude/fantome.json']);
  assert.equal(ouvertes().length, 3);
  // Retirées du contexte : les écarts se résolvent.
  devcontainer({}); contexte(); relire();
  a = s.audit({ journaliser: true });
  assert.deepEqual(perimees(a), []);
  assert.deepEqual(ouvertes(), []);
});

test('Contre-épreuve des exceptions (b) : une exception que son contrôle n’a pas lue là où elle s’applique n’est pas dite périmée', () => {
  const { s, p, d, cle, ecrireF, contexte, devcontainer, relire, perimees, ouvertes } = essaiExceptions();
  contexte(cle); devcontainer({ mounts: ['source=${localEnv:HOME}/.ssh,target=/home/node/.ssh,type=bind'] }); relire();
  assert.deepEqual(perimees(s.audit({ journaliser: true })), []);
  // Le dépôt qui l'utilise est absent de ce site : déplacé (le contrôle dit « dépôt absent »), ou jamais inventorié ici.
  // Jugée sur l'autre projet seul, elle y paraîtrait périmée.
  fs.renameSync(d, `${d}.ailleurs`); relire();
  assert.deepEqual(perimees(s.audit({ journaliser: true })), []);
  relire({ sans: ['depot'] });
  assert.deepEqual(perimees(s.audit({ journaliser: true })), []);
  fs.renameSync(`${d}.ailleurs`, d);
  // La chaîne du projet ne passe plus par le contexte (un second nœud du profil déclare son projet : aucun n'est choisi,
  // décision profil-designe) : le contrôle y tourne par le type, sans l'exception.
  const second = path.join(p, 'arbre', 'contextes', 'aaa.md');
  ecrireF(second, '---\ntype: activity\ntitle: Aaa\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  relire();
  const a = s.audit({ journaliser: true });
  assert.ok(a.cibles.find((c) => c.projet === 'holarch:project:depot').controles.some((c) => c.id === 'montage-sensible' && c.etat === 'fait' && !c.exceptions));
  assert.deepEqual(perimees(a), []);
  assert.deepEqual(ouvertes(), [], 'rien au journal');
  // Le contrôle lève avant de la lire (un `.devcontainer` qui n'est pas un dossier) : non disponible, rien ne se juge.
  fs.rmSync(second); fs.rmSync(path.join(d, '.devcontainer'), { recursive: true }); ecrireF(path.join(d, '.devcontainer'), 'x');
  relire();
  const b = s.audit({ journaliser: true });
  assert.equal(b.cibles.find((c) => c.projet === 'holarch:project:depot').controles.find((c) => c.id === 'montage-sensible').etat, 'indisponible');
  assert.deepEqual(perimees(b), []);
  // Témoin : lue partout, sans rien faire taire, elle est périmée.
  fs.rmSync(path.join(d, '.devcontainer')); devcontainer({}); relire();
  assert.deepEqual(perimees(s.audit({ journaliser: true })).map((e) => e.cle), [`exception-perimee:${cle}`]);
});

test('Contre-épreuve des exceptions (mineur 6) : un seul test « dedans », pour le contrôle du conteneur et la lecture des exceptions', () => {
  assert.deepEqual([['/a', '/a'], ['/a/b', '/a'], ['/a/..x', '/a'], ['/ab', '/a'], ['/', '/a'], ['/a/../b', '/a']].map(([x, y]) => dedans(x, y)), [true, true, true, false, false, false]);
  // Une couche du profil dans un dossier `..x` du dépôt contrôlé est dans le dépôt.
  const couche = (fichier) => [{ origine: 'contexte', provenance: 'p:/c.md', fichier, config: { montage_sensible: { exceptions: [{ ecart: 'e', pourquoi: 'p' }] } } }];
  assert.equal(exceptions(couche('/d/..x/arbre/c.md'), 'montage_sensible', 'ecart', { depot: '/d' }).length, 0);
  assert.equal(exceptions(couche('/d2/arbre/c.md'), 'montage_sensible', 'ecart', { depot: '/d' }).length, 1);
});

test('Contre-épreuve des exceptions (mineur 1) : une exception non jugée ne retient que son propre écart', () => {
  const { s, d, cle, ecrireF, contexte, relire, ouvertes } = essaiExceptions();
  const cles = () => ouvertes().map((o) => o[2]);
  contexte('acces-distant:fantome'); relire(); s.audit({ journaliser: true });
  assert.deepEqual(cles(), ['exception-perimee:acces-distant:fantome']);
  // L'autre projet est lu en partie (feature publiée, aucun conteneur construit) : l'exception de montage n'y est pas
  // jugée. Le fantôme retiré du contexte se résout quand même ; l'exception non jugée n'ouvre rien.
  ecrireF(path.join(path.dirname(d), 'autre', '.devcontainer', 'devcontainer.json'), JSON.stringify({ image: 'x', features: { 'ghcr.io/devcontainers/features/git:1': {} } }));
  contexte('acces-distant:fantome', cle); relire(); s.audit({ journaliser: true });
  assert.deepEqual(cles(), ['exception-perimee:acces-distant:fantome']);
  contexte(cle); relire();
  assert.equal(s.audit({ journaliser: true }).journal.resolus, 1);
  assert.deepEqual(cles(), []);
});

test('Contre-épreuve du conteneur (7) : une transcription illisible ou trop grande n’arrête pas l’import ; celle d’un conteneur ne se rattache qu’à son projet', () => {
  const r = tmp(); const home = path.join(r, 'compte'); const projet = path.join(r, 'projet'); const autre = path.join(r, 'autre');
  fs.mkdirSync(projet); fs.mkdirSync(autre); fs.writeFileSync(path.join(autre, 'x.md'), '');
  const projets = [{ id: 'holarch:project:projet', nom: 'projet', location: projet }, { id: 'holarch:project:autre', nom: 'autre', location: autre }];
  const transcription = (dossier, nom, cwd, fichier) => {
    const d = path.join(home, 'projects', dossier); fs.mkdirSync(d, { recursive: true });
    const lignes = [{ type: 'assistant', sessionId: nom, cwd, gitBranch: 'b'.repeat(500), timestamp: '2026-10-01T10:00:00Z', requestId: nom,
      message: { id: nom, model: 'm'.repeat(500), usage: { input_tokens: 1, output_tokens: 2 }, content: [{ type: 'tool_use', id: `t-${nom}`, name: 'Read', input: { file_path: fichier } }] } }];
    fs.writeFileSync(path.join(d, `${nom}.jsonl`), lignes.map((x) => JSON.stringify(x)).join('\n') + '\n');
    return path.join(d, `${nom}.jsonl`);
  };
  // Le conteneur du projet dit avoir travaillé dans l'autre projet de l'hôte : il ne s'y rattache pas.
  transcription('-workspaces-projet', 'c1', '/workspaces/projet', path.join(autre, 'x.md'));
  transcription('-workspaces-projet', 'c2', autre, path.join(autre, 'x.md'));
  transcription(dossierClaude(autre), 'h1', autre, path.join(autre, 'x.md'));
  // Un refus d'outil dans le conteneur : son origine (qui a refusé) et l'environnement de la session se gardent tous deux.
  fs.appendFileSync(path.join(home, 'projects', '-workspaces-projet', 'c1.jsonl'), `${JSON.stringify({ type: 'user', sessionId: 'c1', cwd: '/workspaces/projet', timestamp: '2026-10-01T10:01:00Z',
    message: { content: [{ type: 'tool_result', tool_use_id: 't-c1', is_error: true, content: "The user doesn't want to proceed with this tool use." }] } })}\n`);
  const bloque = transcription('-workspaces-projet', 'c3', '/workspaces/projet', 'x');
  fs.chmodSync(bloque, 0);
  const donnees = tmp(); const journal = new Journal(donnees, 'local');
  const res = importerTranscriptions({ calme_minutes: 0 }, { journal, donnees, comptes: [{ nom: null, home }], projets });
  assert.equal(res.illisibles, 1, 'la transcription illisible est comptée, les autres importées');
  const fins = Object.fromEntries([...journal.lire()].filter((e) => e.kind === 'session.finished').map((e) => [e.correlation, e.data]));
  assert.deepEqual(Object.keys(fins).sort(), ['c1', 'c2', 'h1']);
  assert.deepEqual([fins.c1.projets, fins.c1.projet, fins.c1.environnement], [[{ id: 'holarch:project:projet', n: 1 }], 'projet', 'conteneur']);
  const refus = [...journal.lire()].find((e) => e.kind === 'tool.denied' && e.correlation === 'c1');
  assert.deepEqual([refus.data.origine, refus.data.environnement], ['humain', 'conteneur']);
  assert.deepEqual([fins.c2.projets, fins.c2.projet], [[], 'projet']);
  assert.deepEqual([fins.h1.projets, fins.h1.environnement], [[{ id: 'holarch:project:autre', n: 1 }], undefined]);
  assert.equal(fins.h1.branche.length, 100);
  assert.ok([...journal.lire()].filter((e) => e.kind === 'cost.recorded').every((e) => e.cost.model.length === 80));
  // Rendue lisible, elle est importée au passage suivant ; une transcription au-dessus du plafond est passée et comptée.
  fs.chmodSync(bloque, 0o644);
  assert.equal(importerTranscriptions({ calme_minutes: 0 }, { journal, donnees, comptes: [{ nom: null, home }], projets }).fichiers_lus, 1);
  const d2 = tmp();
  assert.equal(importerTranscriptions({ calme_minutes: 0, taille_max_mo: 1e-4 }, { journal: new Journal(d2, 'local'), donnees: d2, comptes: [{ nom: null, home }], projets }).trop_grands, 4);
});

test('Arbre du socle : chaque en-tête se lit (un « : » non cité dans un titre ou une description le rendait illisible sans bloquer)', () => {
  // Défaut trouvé le 2026-10-09 : l'en-tête de la décision environnement-d-execution, approuvée, ne se lisait pas.
  const racine = path.join(import.meta.dirname, '..');
  const noeuds = inventaireArbre({}, { depots: [racine], projetDe: () => ({ id: 'holarch:project:holarch-socle' }) }).filter((f) => f.kind === 'node');
  assert.ok(noeuds.length > 10);
  assert.deepEqual(noeuds.filter((n) => n.attributes?.erreur_entete || n.attributes?.erreur_regles).map((n) => `${n.node} : ${n.attributes.erreur_entete || n.attributes.erreur_regles}`), []);
});

// Décision profil-designe. Deux arbres portent un contexte : `profil` (son contexte déclare `depot` ; règle `francais`)
// et `autre` (règle `autre-regle`) ; `depot` est un projet du catalogue. `socle(profil, { depots })` : un site qui
// désigne ce profil (chemin, null ou valeur invalide), son catalogue lu de ces dépôts.
function essaiProfil() {
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const p = path.join(r, 'profil'); const autre = path.join(r, 'autre'); const d = path.join(r, 'depot');
  for (const [x, id] of [[p, 'francais'], [autre, 'autre-regle']]) {
    ecrireF(path.join(x, 'arbre', 'index.md'), `---\ntype: guideline\nid: ${path.basename(x)}\ntitle: ${path.basename(x)}\nstatus: draft\n---\n`);
    ecrireF(path.join(x, 'arbre', 'rules.yaml'), `- id: ${id}\n  statement: Règle ${id}.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n`);
    ecrireF(path.join(x, 'arbre', 'contextes', 'perso.md'), `---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n${x === p ? 'projects: [holarch:project:depot]\n' : ''}---\n`);
  }
  ecrireF(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\n---\n');
  const projet = { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } };
  const socle = (profil, { depots = [p, autre, d], accueil = tmp() } = {}) => {
    const s = new Socle({ site: 'local', profil, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [] } } });
    s.catalogue.remplacer([...inventaireArbre({}, { depots, profil: s.profil(), projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }), projet]); s.indexer();
    return s;
  };
  return { r, p, autre, d, projet, socle, ecrireF };
}

test('Profil désigné (décision profil-designe) : la clé profil du site nomme le seul profil ; sans elle, aucun ; chaque lecture des règles la reçoit', async () => {
  const { profilDuSite, chargerConfig } = await import('../src/config.js');
  const { regleDuCompte } = await import('../src/regles.js');
  const { r, p, socle, ecrireF } = essaiProfil();
  // Deux arbres portent un contexte : le profil est celui que le site désigne, l'autre n'en fait pas un second.
  const s = socle(p);
  const compte = s.regles().compte;
  assert.deepEqual([compte.indetermine, compte.regles.map((e) => e.id)], [undefined, ['francais']]);
  assert.deepEqual(s.regles({ projet: 'depot' }).regles.map((e) => [e.id, e.origine]), [['francais', 'profil']]);
  // Sans profil (clé absente, dépôt introuvable, chemin relatif) : le compte est indéterminé, rien n'y est posé.
  for (const [profil, signal] of [[null, /^aucun profil désigné sur ce site/], [path.join(r, 'absent'), /^profil désigné introuvable : .*absent \(aucune racine/],
    ['profil', /^profil désigné introuvable : profil \(chemin absolu attendu\)/]]) {
    const x = socle(profil);
    assert.deepEqual([x.regles().compte.indetermine, x.regles().compte.regles], [true, []], String(profil)); assert.match(x.regles().compte.signaux[0], signal);
  }
  // Le dépôt désigné se lit même hors des dépôts connus du site, à l'inventaire comme à la relecture de la garde : un
  // changement du profil se voit avant l'inventaire suivant.
  const accueil = tmp(); const inv = new Socle({ site: 'local', profil: p, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [] } } });
  await inv.inventaire(); inv.indexer();
  assert.deepEqual(inv.regles().compte.regles.map((e) => e.id), ['francais']);
  const vu = socle(p, { depots: [p] }); const f = path.join(p, 'arbre', 'rules.yaml');
  ecrireF(f, `${fs.readFileSync(f, 'utf8')}- id: ajoutee\n  statement: Ajoutée.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n`);
  const t = new Date(Date.now() + 5000); fs.utimesSync(f, t, t);
  assert.deepEqual(regleDuCompte(vu.arbreFrais(), { profil: vu.profil() }).regles.map((e) => e.id).sort(), ['ajoutee', 'francais']);
  // Une lecture qui oublierait le profil ne le perd pas en silence.
  assert.throws(() => regleDuCompte(s.arbreFrais()), /profil du site non passé/);
  assert.throws(() => regleEffective([], 'holarch:project:depot'), /profil du site non passé/);
  // Une seule lecture de la clé : `~/…` développé ; `~` seul vaut null en YAML, pas de profil.
  const c = tmp(); const fichier = path.join(c, 'config.yaml');
  fs.writeFileSync(fichier, 'profil: ~/holarch-profil-essai/\n');
  assert.equal(profilDuSite(chargerConfig(fichier, 'local')), path.join(os.homedir(), 'holarch-profil-essai'));
  fs.writeFileSync(fichier, 'profil: ~\n');
  assert.equal(profilDuSite(chargerConfig(fichier, 'local')), null);
});

test('Déclarants (décision profil-designe) : seuls les contextes et activités du profil déclarent ; ailleurs, non lu et dit au compte ; profil manquant ou projet déclaré deux fois : règle incomplète', async () => {
  const { projetsDeclares } = await import('../src/regles.js');
  const { r, p, d, socle, ecrireF } = essaiProfil();
  const compte = (s, o) => s.audit(o).cibles.find((c) => !c.projet);
  const dits = (c) => (c?.ecarts || []).filter((e) => e.controle === 'profil-designe').map((e) => [e.cle, e.message]);
  // Défaut (a) : un nœud du dépôt d'un projet, que son conteneur écrit, déclare ce projet (et un autre). Il n'est pas lu :
  // la chaîne reste celle du profil, et le compte le dit, avec le nœud qui le porte. Un `projects:` du profil hors d'un
  // contexte ou d'une activité non plus ; une activité du profil déclare.
  ecrireF(path.join(d, 'arbre', 'contextes', 'intrus.md'), '---\ntype: context\ntitle: Intrus\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n'
    + 'projects: [holarch:project:depot, holarch:project:seul]\nrules:\n  - { id: francais, statement: Redéfinie., status: stable }\n---\n');
  ecrireF(path.join(p, 'arbre', 'decisions', 'une.md'), '---\ntype: decision\ntitle: Une\nstatus: draft\nprojects: [holarch:project:seul]\n---\n');
  ecrireF(path.join(p, 'arbre', 'activites', 'veille.md'), '---\ntype: activity\ntitle: Veille\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:act]\n---\n');
  const s = socle(p);
  const e = s.regles({ projet: 'depot' });
  assert.deepEqual(e.regles.map((x) => [x.id, x.origine, x.provenance.arbre]), [['francais', 'profil', 'profil']]);
  assert.ok(e.signaux.includes('déclaration non lue : depot:/arbre/contextes/intrus.md (contexte hors du profil désigné)'), e.signaux.join(' | '));
  assert.deepEqual(dits(compte(s)), [
    ['declaration:autre:/arbre/contextes/perso.md', 'contexte hors du profil désigné : non lu'],
    ['declaration:depot:/arbre/contextes/intrus.md', 'contexte hors du profil désigné : non lu'],
    ['declaration:profil:/arbre/decisions/une.md', 'projets déclarés hors d’un contexte ou d’une activité du profil : non lu']]);
  const fiches = s.arbreFrais();
  assert.deepEqual([...projetsDeclares(fiches, { profil: p })].sort(), ['holarch:project:act', 'holarch:project:depot']);
  assert.equal(regleEffective(fiches, 'holarch:project:act', { profil: p }).declare, true, 'une activité du profil déclare');
  // Profil non désigné : ses contextes ne déclarent plus rien ; le compte le dit, sans rien juger de ce qui est posé.
  const accueil = tmp(); const sans = socle(null, { accueil });
  assert.deepEqual(sans.regles({ projet: 'depot' }).regles, []);
  const c0 = compte(sans, { journaliser: true });
  assert.deepEqual(dits(c0)[0], ['profil', 'aucun profil désigné sur ce site : ajouter la clé profil à la configuration du site']);
  assert.ok(dits(c0).some(([cle]) => cle === 'declaration:profil:/arbre/contextes/perso.md'));
  assert.ok(c0.controles.some((c) => c.id === 'regles-a-jour' && c.etat === 'indisponible' && c.raison === 'sans profil'));
  // Désigné, il se résout.
  socle(p, { accueil }).audit({ journaliser: true });
  assert.ok(!socle(p, { accueil }).ecartsOuverts().some((o) => o.cle === 'profil'), 'écart résolu une fois le profil désigné');
  // Désigné mais introuvable : la règle effective est incomplète ; la garde refuse, l'audit le dit une fois, au compte.
  const absent = socle(path.join(r, 'absent'));
  assert.match(absent.regles({ projet: 'depot' }).illisibles[0], /^profil désigné introuvable : .*absent/);
  assert.deepEqual(absent.garde({ depot: d }).refus.map((x) => x.regle), ['regles-lisibles']);
  const a = absent.audit().cibles;
  assert.deepEqual(a.map((c) => [c.projet, c.ecarts.filter((x) => x.controle === 'regles-lisibles').map((x) => x.cle)]), [[null, ['profil désigné introuvable']]]);
  // Projet déclaré par deux nœuds du profil : aucun n'est choisi (plus de « le premier compte »).
  ecrireF(path.join(p, 'arbre', 'contextes', 'second.md'), '---\ntype: context\ntitle: Second\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  const deux = socle(p);
  assert.deepEqual(deux.regles({ projet: 'depot' }).illisibles, ['projet déclaré par plusieurs nœuds du profil : profil:/arbre/contextes/perso.md, profil:/arbre/contextes/second.md']);
  assert.deepEqual(deux.garde({ depot: d }).refus.map((x) => x.regle), ['regles-lisibles']);
});

test('Identifiants en double (décision profil-designe) : le profil garde son id ; deux autres racines ou deux types de même id ne sont pas retenus ; un lien interne se résout dans son dépôt', () => {
  const { r, p, d, socle, ecrireF } = essaiProfil();
  const regle = (id) => `- id: ${id}\n  statement: Règle ${id}.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n`;
  // Défaut (c) : un dépôt (que son conteneur écrit) reprend l'id du profil, et sa racine est lue la dernière. Le
  // contexte du profil se rattache toujours à la racine de son dépôt ; les règles de l'intrus gardent leurs fiches.
  const faux = path.join(r, 'faux');
  ecrireF(path.join(faux, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Faux\nstatus: draft\n---\n'); ecrireF(path.join(faux, 'arbre', 'rules.yaml'), regle('du-faux'));
  // Deux racines de même id hors du profil, chacune un projet ; deux types de même id, dont `depot` déclare l'un.
  for (const x of ['j1', 'j2']) {
    ecrireF(path.join(r, x, 'arbre', 'index.md'), '---\ntype: guideline\nid: jumeau\ntitle: Jumeau\nstatus: draft\n---\n'); ecrireF(path.join(r, x, 'arbre', 'rules.yaml'), regle(`de-${x}`));
    ecrireF(path.join(p, 'arbre', 'contextes', `${x}.md`), `---\ntype: context\ntitle: ${x}\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:${x}]\n---\n`);
  }
  for (const x of [p, path.join(r, 'j1')]) ecrireF(path.join(x, 'arbre', 'types', 'double.md'), '---\ntype: template\nid: double\ntitle: Double\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  ecrireF(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\ntypes: [double]\n---\n');
  // Un contexte du profil rattaché par un lien vers l'id en double : non résolu.
  ecrireF(path.join(p, 'arbre', 'contextes', 'lie.md'), '---\ntype: context\ntitle: Lié\nstatus: draft\nlinks: { derives_from: ["jumeau:/arbre/index.md"] }\nprojects: [holarch:project:lie]\n---\n');
  const depots = [p, faux, path.join(r, 'j1'), path.join(r, 'j2'), d];
  const projets = ['j1', 'j2', 'lie'].map((x) => ({ id: `holarch:project:${x}`, kind: 'project', name: x, status: 'active', location: path.join(r, x), provenance: { source: 't' } }));
  const s = socle(p, { depots }); s.catalogue.remplacer([...s.fiches(), ...projets]); s.indexer();
  const compte = s.regles().compte;
  assert.deepEqual(compte.regles.map((e) => [e.id, e.fiche]), [['francais', 'holarch:rule:profil/francais']], 'les règles du profil gardent leur identifiant');
  assert.ok(s.fiches({ kind: 'rule' }).some((f) => f.id === 'holarch:rule:profil-faux/du-faux'), 'celles de l’intrus aussi, distinctes, au catalogue');
  assert.ok(compte.signaux.includes('identifiant d’arbre en double : profil (faux ; profil, profil désigné, retenu)'), compte.signaux.join(' | '));
  for (const x of ['j1', 'j2']) {
    const e = s.regles({ projet: x });
    assert.deepEqual(e.illisibles, ['arbre du projet non retenu, identifiant d’arbre en double : jumeau (j1 ; j2)'], x);
    assert.ok(!e.regles.some((y) => y.id.startsWith('de-')), 'ni l’une ni l’autre');
  }
  assert.deepEqual(s.regles({ projet: 'depot' }).regles.map((e) => e.fiche), ['holarch:rule:profil/francais'], 'la chaîne du contexte reste dans le dépôt du profil');
  assert.deepEqual(s.regles({ projet: 'depot' }).illisibles, ['type en double : double (jumeau:/arbre/types/double.md, profil:/arbre/types/double.md)']);
  assert.deepEqual(s.garde({ depot: d }).refus.map((x) => x.regle), ['regles-lisibles']);
  assert.deepEqual(s.regles({ projet: 'lie' }).illisibles, ['lien vers un identifiant d’arbre en double, non résolu : profil:/arbre/contextes/lie.md → jumeau:/arbre/index.md']);
  // Un type seul de son id, dans un arbre non retenu, ne se résout pas non plus.
  fs.rmSync(path.join(p, 'arbre', 'types'), { recursive: true });
  assert.deepEqual(socle(p, { depots }).regles({ projet: 'depot' }).illisibles, ['type d’un arbre non retenu : double (jumeau:/arbre/types/double.md, identifiant d’arbre en double)']);
});

test('Profil désigné (décision profil-designe) : le dépôt du profil monté en écriture par un conteneur est un écart ; en lecture, non', () => {
  const { maison, d, ctx, config, lire, cibles } = conteneurEssai();
  const p = path.join(maison, 'depots', 'profil'); fs.mkdirSync(path.join(p, 'arbre'), { recursive: true });
  config({ workspaceMount: 'type=bind,source=${localWorkspaceFolder},target=/workspaces/projet', mounts: [
    'type=bind,source=${localEnv:HOME}/depots/profil,target=/p', 'type=bind,source=${localEnv:HOME}/depots/profil,target=/l,readonly',
    'type=bind,source=${localEnv:HOME}/depots/profil/arbre,target=/a', 'type=bind,source=${localEnv:HOME}/depots,target=/d'] });
  // Sans profil désigné, ces montages n'exposent rien que le contrôle connaisse.
  assert.deepEqual(cibles(lire()), []);
  ctx.profil = p;
  let r = lire();
  assert.deepEqual(cibles(r), ['/p', '/a', '/d']);
  assert.match(r.ecarts[0].message, /^monte ~\/depots\/profil \(dépôt du profil\) dans le conteneur, en écriture$/);
  assert.match(r.ecarts[1].message, /^monte ~\/depots\/profil\/arbre, dans ~\/depots\/profil \(dépôt du profil\)/);
  assert.match(r.ecarts[2].message, /^monte ~\/depots, qui contient ~\/depots\/profil \(dépôt du profil\)/);
  // Désigné mais pas en chemin absolu (introuvable), il ne désigne rien à protéger ici : la règle effective le dit.
  ctx.profil = path.relative(process.cwd(), p); assert.deepEqual(cibles(lire()), []); ctx.profil = p;
  // Le conteneur du profil lui-même : sans workspaceMount, le CLI monte son dossier en écriture ; en lecture seule, non.
  ctx.depot = p; fs.mkdirSync(path.join(p, '.devcontainer'));
  const ecrire = (c) => fs.writeFileSync(path.join(p, '.devcontainer', 'devcontainer.json'), JSON.stringify(c));
  ecrire({});
  r = lire();
  assert.deepEqual(r.ecarts.map((e) => [e.fichier, e.ligne, e.cle]), [['.devcontainer/devcontainer.json', null, 'montage:.devcontainer/devcontainer.json:/workspaces/profil']]);
  assert.match(r.ecarts[0].message, /^monte ~\/depots\/profil \(dépôt du profil\) dans le conteneur, en écriture \(dossier de travail, monté par défaut sans workspaceMount\)$/);
  // Une feature locale ne monte pas de dossier de travail.
  fs.mkdirSync(path.join(p, '.devcontainer', 'f')); fs.writeFileSync(path.join(p, '.devcontainer', 'f', 'devcontainer-feature.json'), '{}');
  ecrire({ workspaceMount: 'type=bind,source=${localWorkspaceFolder},target=/workspaces/profil,readonly', features: { './f': {} } });
  assert.deepEqual(lire().ecarts, []);
  ecrire({ workspaceMount: '' });
  assert.deepEqual(lire().ecarts, [], 'un workspaceMount vide : le CLI ne monte rien');
  // Un conteneur déjà construit qui l'écrit, d'un autre dépôt.
  ctx.depot = d; config({ workspaceMount: 'type=bind,source=${localWorkspaceFolder},target=/workspaces/projet' });
  const iso = (montages) => ({ name: 'k', attributes: { isolement: { montages, privilegie: false, capacites: [], peripheriques: [], espaces: [], protections: [], volumes_de: [] } } });
  ctx.conteneurs = [iso([{ source: p, cible: '/x', lecture: false }, { source: p, cible: '/y', lecture: true }])];
  assert.deepEqual(cibles(lire()), ['/x']);
  // Par l'audit : le contexte d'un contrôle porte le profil que le site désigne.
  const e = essaiExceptions();
  e.devcontainer({ mounts: [`source=${e.p},target=/p,type=bind`] }); e.relire();
  const ecarts = e.s.audit({}).cibles.find((c) => c.projet === 'holarch:project:depot').ecarts.filter((x) => x.controle === 'montage-sensible');
  assert.deepEqual(ecarts.map((x) => [x.regle_id, x.cle]), [['conteneur-isole', 'montage:.devcontainer/devcontainer.json:/p']]);
});

test('Exceptions des données personnelles (décision profil-designe) : au profil et au contexte, hors du dépôt contrôlé, et dites quand elles sont écartées ; les termes se lisent partout', async () => {
  const affichage = await import('../bin/affichage.js');
  const { listePrivee } = await import('../src/controles.js');
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const p = path.join(r, 'profil'); const d = path.join(r, 'depot');
  const config = (x) => (x ? `config:\n  donnees_personnelles:\n${x}` : '');
  const exc = (...x) => `    exceptions: [${x.join(', ')}]\n`;
  const LICENSE = '{ fichier: LICENSE, pourquoi: titulaire }'; const OMEGA = '{ terme: Projet Omega, pourquoi: public }';
  const arbres = ({ profil = '', contexte = '', type = '', projet = '' } = {}) => {
    ecrireF(path.join(p, 'arbre', 'index.md'), `---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Zeta Martin]\n${profil}---\n`);
    ecrireF(path.join(p, 'arbre', 'contextes', 'perso.md'), `---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n${config(contexte)}---\n`);
    ecrireF(path.join(p, 'arbre', 'types', 'public', 'index.md'), `---\ntype: template\nid: public\ntitle: Public\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n${config(type)}---\n`);
    ecrireF(path.join(p, 'arbre', 'types', 'public', 'rules.yaml'), '- id: rien-de-personnel\n  statement: Aucune donnée personnelle.\n  level: verified\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n');
    // Le projet allonge la liste privée de ses propres termes : eux se lisent dans le dépôt.
    ecrireF(path.join(d, 'arbre', 'index.md'), `---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\ntypes: [public]\nconfig:\n  donnees_personnelles:\n    termes: [Projet Omega]\n${projet}---\n`);
  };
  fs.mkdirSync(d, { recursive: true });
  const g = (...a) => { const x = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(x.status, 0, x.stderr); };
  g('init', '-q'); g('config', 'user.name', 'Alice Exemple'); g('config', 'user.email', 'alice@exemple.test');
  ecrireF(path.join(d, 'LICENSE'), 'Copyright (c) 2026 Zeta Martin\n'); ecrireF(path.join(d, 'note.md'), 'note du Projet Omega\n');
  const s = new Socle({ site: 'local', profil: p, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [] } } });
  const auditer = () => {
    g('add', '.');
    s.catalogue.remplacer([...inventaireArbre({}, { depots: [p, d], profil: p, projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
      { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer();
    const a = s.audit({ journaliser: true }); const c = a.cibles.find((x) => x.projet === 'holarch:project:depot');
    return { a, fichiers: c.ecarts.filter((e) => e.controle === 'donnees-personnelles').map((e) => e.fichier).sort(),
      ignorees: c.controles.find((x) => x.id === 'donnees-personnelles').exceptions_ignorees, signaux: regleEffective(s.fiches(), 'holarch:project:depot', { profil: p }).signaux };
  };
  // Sans exception : la licence (terme du profil), la note et la racine qui le déclare (terme du projet, lu dans le dépôt).
  arbres();
  assert.deepEqual(auditer().fichiers, ['LICENSE', 'arbre/index.md', 'note.md']);
  // Portées par un type ou par la racine du projet, que le conteneur du projet écrit : ni lues, ni muettes.
  arbres({ type: exc(LICENSE), projet: exc(OMEGA) });
  let x = auditer();
  assert.deepEqual(x.fichiers, ['LICENSE', 'arbre/index.md', 'note.md']);
  // Chacune une fois, sous son champ, couche par couche.
  assert.deepEqual(x.ignorees, [
    { fichier: 'LICENSE', raison: 'porté par un type, il se lit au profil et au contexte', provenance: 'profil:/arbre/types/public/index.md' },
    { terme: 'Projet Omega', raison: 'porté par un projet, il se lit au profil et au contexte', provenance: 'depot:/arbre/index.md' }]);
  assert.deepEqual(x.signaux.filter((y) => y.startsWith('donnees_personnelles')).map((y) => y.split(' : ')[0]),
    ['donnees_personnelles.exceptions porté par profil:/arbre/types/public/index.md (type)', 'donnees_personnelles.exceptions porté par depot:/arbre/index.md (projet)']);
  assert.ok(x.signaux.some((y) => y.endsWith('(décision profil-designe)')));
  assert.match(affichage.audit(x.a), /exception donnees-personnelles ignorée : fichier LICENSE — porté par un type, il se lit au profil et au contexte \(profil:\/arbre\/types\/public\/index\.md\)/);
  assert.match(affichage.audit(x.a), /exception donnees-personnelles ignorée : terme Projet Omega — porté par un projet/);
  // À la racine du profil et au contexte : elles valent, et rien n'est dit.
  arbres({ profil: exc(LICENSE), contexte: exc(OMEGA) });
  x = auditer();
  assert.deepEqual([x.fichiers, x.ignorees, x.signaux.filter((y) => y.startsWith('donnees_personnelles'))], [[], undefined, []]);
  // Le dépôt du profil, s'il est le dépôt contrôlé, ne s'excepte pas lui-même ; ni pour un fichier, ni pour un terme.
  const couches = regleEffective(s.fiches(), 'holarch:project:depot', { profil: p }).couches;
  assert.deepEqual(['fichier', 'terme'].map((champ) => exceptions(couches, 'donnees_personnelles', champ, { depot: p }).length), [0, 0]);
  assert.ok(listePrivee({ depot: p, couches, config: { donnees_personnelles: { termes: ['Projet Omega'] } } }).includes('Projet Omega'));
  ecrireF(path.join(p, 'LICENSE'), 'Copyright (c) 2026 Zeta Martin\n');
  for (const a of [['init', '-q'], ['add', 'LICENSE']]) spawnSync('git', ['-C', p, ...a]);
  const lu = executer('donnees-personnelles', { depot: p, couches, termes: ['Zeta Martin'] }, 'audit');
  assert.deepEqual([lu.ecarts.map((e) => e.fichier), lu.exceptions_ignorees.filter((e) => e.fichier)], [['LICENSE'], [{ fichier: 'LICENSE', raison: 'écrite dans le dépôt contrôlé', provenance: 'profil:/arbre/index.md' }]]);
  assert.ok(!listePrivee({ depot: d, couches, config: { donnees_personnelles: { termes: ['Projet Omega'] } } }).includes('Projet Omega'));
});

test('Contre-épreuve du profil désigné (2) : une valeur posée plus bas ne remplace ni un objet ni une liste ; liste privée et identité tiennent, et c’est dit', () => {
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const p = path.join(r, 'profil'); const d = path.join(r, 'depot');
  const regle = (id, controle) => `- id: ${id}\n  statement: ${id}.\n  level: blocking\n  check: [${controle}]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n`;
  ecrireF(path.join(p, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Zeta Martin]\n  identite: { nom: Alice Exemple, email: alice@exemple.test }\n---\n');
  ecrireF(path.join(p, 'arbre', 'rules.yaml'), regle('rien-de-personnel', 'donnees-personnelles') + regle('identite-de-commit', 'identite-de-commit'));
  ecrireF(path.join(p, 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  fs.mkdirSync(d, { recursive: true });
  const g = (...a) => { const x = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(x.status, 0, x.stderr); };
  g('init', '-q'); g('config', 'user.name', 'Bob Autre'); g('config', 'user.email', 'bob@autre.test');
  ecrireF(path.join(d, 'note.md'), 'note de Zeta Martin\n');
  const s = new Socle({ site: 'local', profil: p, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [] } } });
  const garder = (config) => {
    ecrireF(path.join(d, 'arbre', 'index.md'), `---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\nconfig:\n${config}---\n`); g('add', '.');
    s.catalogue.remplacer([...inventaireArbre({}, { depots: [p, d], profil: p, projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
      { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer();
    const e = regleEffective(s.fiches(), 'holarch:project:depot', { profil: p });
    return { refus: s.garde({ depot: d }).refus.map((x) => x.regle).sort(), config: e.config, signaux: e.signaux.filter((x) => x.includes('ne remplace pas')) };
  };
  // Vider la liste privée, couper l'identité, ou remplacer une liste par un objet : la couche plus haute tient, et la
  // garde refuse le commit (terme privé, autre identité) comme sans ces réglages.
  for (const [config, chemin, forme] of [['  donnees_personnelles: null\n', 'donnees_personnelles', 'une valeur simple ne remplace pas un objet'],
    ['  donnees_personnelles: { termes: "" }\n', 'donnees_personnelles.termes', 'une valeur simple ne remplace pas une liste'],
    ['  donnees_personnelles: { termes: { a: 1 } }\n', 'donnees_personnelles.termes', 'un objet ne remplace pas une liste'],
    ['  identite: null\n', 'identite', 'une valeur simple ne remplace pas un objet']]) {
    const x = garder(config);
    assert.deepEqual(x.refus, ['identite-de-commit', 'rien-de-personnel'], config);
    assert.deepEqual([x.config.donnees_personnelles.termes, x.config.identite.nom], [['Zeta Martin'], 'Alice Exemple'], config);
    assert.deepEqual(x.signaux, [`${chemin} posé par depot:/arbre/index.md (projet) : ${forme} d’une couche plus haute, qui tient (décision fusion-et-profil-audite)`], config);
  }
  // Ce qui reste permis : une liste s'allonge, un objet se fusionne clé à clé, une valeur simple en remplace une autre.
  const x = garder('  donnees_personnelles: { termes: [Projet Omega] }\n  identite: { email: alice@autre.test }\n');
  assert.deepEqual([x.config.donnees_personnelles.termes, x.config.identite, x.signaux], [['Zeta Martin', 'Projet Omega'], { nom: 'Alice Exemple', email: 'alice@autre.test' }, []]);
  // Une clé `__proto__` écrite dans l'arbre reste une clé : elle ne change pas la forme de la configuration fusionnée.
  const proto = fusionnerConfig({ a: { b: 1 } }, JSON.parse('{"a": {"__proto__": {"c": 2}}}'));
  assert.deepEqual([Object.getPrototypeOf(proto.a), proto.a.c, Object.hasOwn(proto.a, '__proto__')], [Object.prototype, undefined, true]);
});

test('Contre-épreuve du profil désigné (1) : un identifiant se compare dans sa forme normalisée ; une règle en double ne s’efface pas en silence', () => {
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const p = path.join(r, 'profil'); const d = path.join(r, 'depot'); const intrus = path.join(r, 'a-intrus');
  const regle = (id, extra = '') => `- id: ${id}\n  statement: ${id}.\n  level: blocking\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n${extra}`;
  ecrireF(path.join(p, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Zeta Martin]\n---\n');
  ecrireF(path.join(p, 'arbre', 'rules.yaml'), regle('rien-de-personnel'));
  ecrireF(path.join(p, 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  // Un dépôt lu avant le profil reprend son identifiant et celui de sa règle, à la casse près.
  ecrireF(path.join(intrus, 'arbre', 'index.md'), '---\ntype: guideline\nid: PROFIL\ntitle: Intrus\nstatus: draft\n---\n');
  ecrireF(path.join(intrus, 'arbre', 'rules.yaml'), '- id: Rien-De-Personnel\n  statement: Rien.\n  level: reminder\n  status: draft\n');
  fs.mkdirSync(d, { recursive: true });
  const g = (...a) => { const x = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(x.status, 0, x.stderr); };
  g('init', '-q'); g('config', 'user.name', 'Alice Exemple'); g('config', 'user.email', 'alice@exemple.test');
  ecrireF(path.join(d, 'note.md'), 'note de Zeta Martin\n');
  const s = new Socle({ site: 'local', profil: p, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [] } } });
  const lire = (racine) => {
    ecrireF(path.join(d, 'arbre', 'index.md'), `---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\n${racine}---\n`); g('add', '.');
    const fiches = inventaireArbre({}, { depots: [intrus, p, d], profil: p, projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
    const c = s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer();
    const e = regleEffective(s.fiches(), 'holarch:project:depot', { profil: p });
    return { c, e, refus: s.garde({ depot: d }).refus.map((x) => x.regle), compte: regleDuCompte(s.fiches(), { profil: p }) };
  };
  let x = lire('');
  // L'intrus est un doublon de l'identifiant du profil : non retenu, dit ; ses règles gardent leur propre identifiant.
  const rdp = (l) => l.regles.filter((y) => y.id === 'rien-de-personnel').map((y) => [y.provenance.arbre, y.applicable]);
  assert.deepEqual([rdp(x.compte), rdp(x.e)], [[['profil', true]], [['profil', true]]]);
  assert.deepEqual(x.c.doublons, []);
  assert.ok(x.compte.signaux.some((y) => /^identifiant d’arbre en double : profil \(a-intrus ; profil, profil désigné, retenu\)$/.test(y)), x.compte.signaux.join('\n'));
  assert.deepEqual(x.refus, ['rien-de-personnel']);
  // Deux règles d'un même nœud dont les identifiants se confondent : la règle effective est incomplète, et c'est dit.
  ecrireF(path.join(d, 'arbre', 'rules.yaml'), '- id: Note\n  statement: Une.\n  status: draft\n- id: note\n  statement: Deux.\n  status: draft\n');
  x = lire('');
  assert.ok(x.e.illisibles.some((y) => /identifiant de règle en double : note/.test(y)), x.e.illisibles.join('\n'));
  assert.deepEqual(x.refus, ['regles-lisibles']);
  // Une règle, une dérogation et un type se désignent eux aussi dans leur forme normalisée : la règle du projet est celle
  // du profil, en brouillon sur l'approuvée.
  ecrireF(path.join(d, 'arbre', 'rules.yaml'), '- id: Rien-De-Personnel\n  statement: Autre.\n  status: draft\n');
  x = lire('types: [Inconnu]\nderogations: [{ rule: Rien-De-Personnel, why: essai }]\n');
  assert.ok(x.e.signaux.some((y) => y.startsWith('brouillon sur une règle approuvée : rien-de-personnel ')), x.e.signaux.join('\n'));
  assert.deepEqual([x.e.regles.find((y) => y.id === 'rien-de-personnel').derogee?.pourquoi, x.e.signaux.filter((y) => /dérogation|type inconnu/.test(y))],
    ['essai', ['type inconnu : inconnu (aucun nœud template ne porte cet id)']]);
  // Le catalogue dit une fiche en double qu'il écarte, quand elle ne vient pas du même endroit.
  const f = (location) => ({ id: 'holarch:node:x', kind: 'node', name: 'x', status: 'active', location, provenance: { source: 't' } });
  assert.deepEqual(s.catalogue.remplacer([f('/a'), f('/a'), f('/b')]).doublons, [{ id: 'holarch:node:x', garde: '/a', ecarte: '/b' }]);
});

test('Contre-épreuve du profil désigné (3) : un champ de forme invalide rend la règle effective incomplète, sans arrêter la garde ni l’audit', () => {
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const p = path.join(r, 'profil'); const d = path.join(r, 'depot'); const e = path.join(r, 'ecart');
  ecrireF(path.join(p, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Zeta Martin]\n---\n');
  ecrireF(path.join(p, 'arbre', 'rules.yaml'), '- id: rien-de-personnel\n  statement: Rien.\n  level: blocking\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n');
  const contexte = (projects) => ecrireF(path.join(p, 'arbre', 'contextes', 'perso.md'), `---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: ${projects}\n---\n`);
  contexte('[holarch:project:depot, holarch:project:ecart]');
  for (const x of [d, e]) {
    fs.mkdirSync(x, { recursive: true });
    for (const a of [['init', '-q'], ['config', 'user.name', 'Alice Exemple'], ['config', 'user.email', 'alice@exemple.test']]) spawnSync('git', ['-C', x, ...a]);
    ecrireF(path.join(x, 'arbre', 'index.md'), `---\ntype: guideline\nid: ${path.basename(x)}\ntitle: x\nstatus: draft\n---\n`);
  }
  ecrireF(path.join(d, 'note.md'), 'note de Zeta Martin\n'); spawnSync('git', ['-C', d, 'add', '.']);
  const s = new Socle({ site: 'local', profil: p, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [] } } });
  const lire = (racine, regles = null) => {
    ecrireF(path.join(e, 'arbre', 'index.md'), `---\ntype: guideline\nid: ecart\ntitle: x\nstatus: draft\n${racine}---\n`);
    if (regles) ecrireF(path.join(e, 'arbre', 'rules.yaml'), regles); else fs.rmSync(path.join(e, 'arbre', 'rules.yaml'), { force: true });
    spawnSync('git', ['-C', e, 'add', '.']);
    s.catalogue.remplacer([...inventaireArbre({}, { depots: [p, d, e], profil: p, projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
      ...[d, e].map((x) => ({ id: `holarch:project:${path.basename(x)}`, kind: 'project', name: path.basename(x), status: 'active', location: x, provenance: { source: 't' } }))]); s.indexer();
    const a = s.audit({});
    const de = (id) => a.cibles.find((x) => x.projet === `holarch:project:${id}`);
    return { compte: a.cibles.find((x) => x.projet === null)?.ecarts.filter((x) => x.controle === 'regles-lisibles').map((x) => x.message),
      garde: s.garde({ depot: e }).refus.map((x) => x.regle), lisibles: de('ecart')?.ecarts.filter((x) => x.controle === 'regles-lisibles').map((x) => x.message) ?? null,
      depot: de('depot')?.ecarts.map((x) => x.controle).filter((c) => c === 'donnees-personnelles') ?? null, regle: regleEffective(s.fiches(), 'holarch:project:ecart', { profil: p }) };
  };
  // Racine d'un projet : chaque forme invalide se dit, la garde de ce projet refuse, l'audit va au bout (l'autre projet
  // garde son écart).
  for (const [racine, message] of [['derogations: 5\n', 'derogations : une liste de {rule, why} attendue'], ['derogations: [5]\n', 'derogations : une liste de {rule, why} attendue'],
    ['types: { a: 1 }\n', 'types : une liste d’identifiants attendue'], ['config: 5\n', 'config : un objet attendu'], ['config: [a]\n', 'config : un objet attendu']]) {
    const x = lire(racine);
    assert.deepEqual([x.garde, x.lisibles, x.depot], [['regles-lisibles'], [`ecart:/arbre/index.md : ${message}`], ['donnees-personnelles']], racine);
  }
  // Une règle de forme invalide : de même ; `replaces` écrit seul se lit comme une liste.
  let x = lire('', '- id: note\n  statement: Note.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n  replaces: { a: 1 }\n');
  assert.deepEqual([x.garde, x.lisibles], [['regles-lisibles'], ['ecart:/arbre/index.md : replaces de la règle note : une liste de noms de mémoire attendue']]);
  x = lire('', '- id: note\n  statement: Note.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n  replaces: memoire-x\n');
  assert.deepEqual([x.garde, x.lisibles, x.regle.regles.find((y) => y.id === 'note').remplace], [[], [], ['memoire-x']]);
  // Un contexte du profil dont les projets ne se lisent pas pouvait déclarer chacun : tous sont incomplets, et l'écart est
  // celui du compte.
  contexte('{ a: 1 }');
  x = lire('');
  assert.deepEqual([x.garde, x.compte, x.regle.declare, x.regle.illisibles], [['regles-lisibles'], ['profil:/arbre/contextes/perso.md : projects : une liste d’identifiants attendue'], false,
    ['profil:/arbre/contextes/perso.md : projects : une liste d’identifiants attendue']]);
});

test('Contre-épreuve du profil désigné (4) : l’audit du compte lit les conteneurs du dépôt du profil, par montage-sensible seul', () => {
  const ecrireF = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
  const r = tmp(); const accueil = tmp(); const p = path.join(r, 'profil'); const d = path.join(r, 'depot');
  ecrireF(path.join(p, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Zeta Martin]\n---\n');
  ecrireF(path.join(p, 'arbre', 'rules.yaml'), ['- id: conteneur-isole\n  statement: Rien de l’hôte dans le conteneur.\n  level: verified\n  check: [montage-sensible]\n',
    '- id: rien-de-personnel\n  statement: Rien.\n  level: blocking\n  check: [donnees-personnelles]\n'].map((x) => `${x}  status: stable\n  approved: { by: human:alice, at: 2026-10-10 }\n`).join(''));
  ecrireF(path.join(p, 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\nconfig:\n  montage_sensible:\n    exceptions: [{ ecart: "acces-distant:fantome", pourquoi: essai }]\n---\n');
  ecrireF(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: depot\nstatus: draft\n---\n');
  // Le profil porte la liste privée : audité comme un projet, il serait en écart sur ses propres termes.
  spawnSync('git', ['init', '-q', p]); spawnSync('git', ['-C', p, 'add', '.']);
  ecrireF(path.join(p, '.devcontainer', 'devcontainer.json'), '{}');
  const s = new Socle({ site: 'local', profil: p, donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [] } } });
  const projet = (x) => ({ id: `holarch:project:${path.basename(x)}`, kind: 'project', name: path.basename(x), status: 'active', location: x, provenance: { source: 't' } });
  const construit = { id: 'holarch:container:kp', kind: 'container', name: 'kp', status: 'active', links: { project: ['holarch:project:profil'] }, provenance: { source: 't' },
    attributes: { isolement: { montages: [{ source: p, cible: '/w', lecture: false }], privilegie: false, capacites: [], peripheriques: [], espaces: [], protections: [], volumes_de: [] } } };
  const relire = (autres = [], { avecProfil = true } = {}) => { s.catalogue.remplacer([...inventaireArbre({}, { depots: [p, d], profil: p, projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    ...(avecProfil ? [projet(p)] : []), projet(d), ...autres]); s.indexer(); };
  const compte = (a) => a.cibles.find((x) => x.projet === null);
  const ouverts = () => s.ecartsOuverts().filter((o) => !o.projet && o.controle === 'montage-sensible').map((o) => o.cle).sort();
  // Le conteneur du profil, décrit et construit : des écarts du compte, ses fichiers désignés dans l'arbre du profil ; rien
  // d'autre n'est contrôlé dans ce dépôt.
  relire([construit]);
  let a = s.audit({ journaliser: true });
  assert.deepEqual(compte(a).ecarts.filter((x) => x.controle !== 'regles-a-jour').map((x) => [x.regle_id, x.controle, x.cle, x.fichier ?? null]), [
    ['conteneur-isole', 'montage-sensible', 'montage:.devcontainer/devcontainer.json:/workspaces/profil', 'profil:/.devcontainer/devcontainer.json'],
    ['conteneur-isole', 'montage-sensible', 'conteneur:kp:/w', null],
    ['conteneur-isole', 'montage-sensible', 'exception-perimee:acces-distant:fantome', 'profil:/arbre/contextes/perso.md']]);
  assert.match(compte(a).ecarts[0].message, /^monte .*profil \(dépôt du profil\) dans le conteneur, en écriture \(dossier de travail/);
  assert.deepEqual(compte(a).controles.filter((x) => x.id === 'montage-sensible'), [{ id: 'montage-sensible', etat: 'fait' }]);
  assert.equal(a.cibles.find((x) => x.projet === 'holarch:project:depot').controles.find((x) => x.id === 'montage-sensible').etat, 'fait');
  // Non disponible dans le dépôt du profil, le contrôle n'y résout rien, même fait dans un projet.
  fs.rmSync(path.join(p, '.devcontainer'), { recursive: true }); ecrireF(path.join(p, '.devcontainer'), 'x'); relire();
  a = s.audit({ journaliser: true });
  assert.equal(compte(a).controles.find((x) => x.id === 'montage-sensible').etat, 'indisponible');
  assert.deepEqual(ouverts(), ['conteneur:kp:/w', 'exception-perimee:acces-distant:fantome', 'montage:.devcontainer/devcontainer.json:/workspaces/profil']);
  // Fait dans le dépôt du profil, il résout ses écarts, pas l'exception que le projet n'a pas pu juger.
  fs.rmSync(path.join(p, '.devcontainer')); ecrireF(path.join(d, '.devcontainer'), 'x'); relire();
  a = s.audit({ journaliser: true });
  assert.deepEqual([compte(a).controles.find((x) => x.id === 'montage-sensible').etat, a.journal.resolus], ['fait', 2]);
  assert.deepEqual(ouverts(), ['exception-perimee:acces-distant:fantome']);
  // Le profil hors du catalogue : un autre dépôt du même nom n'est pas le sien, ses conteneurs ne se disent pas au compte.
  const ailleurs = path.join(r, 'ailleurs', 'profil'); fs.mkdirSync(ailleurs, { recursive: true });
  relire([{ ...projet(ailleurs), id: 'holarch:project:ailleurs' }, { ...construit, links: { project: ['holarch:project:ailleurs'] } }], { avecProfil: false });
  assert.deepEqual(compte(s.audit({})).ecarts.filter((x) => x.cle.startsWith('conteneur:')), []);
  relire([construit]);
  assert.deepEqual(compte(s.audit({})).ecarts.filter((x) => x.cle.startsWith('conteneur:')).map((x) => x.cle), ['conteneur:kp:/w'], 'témoin');
});
