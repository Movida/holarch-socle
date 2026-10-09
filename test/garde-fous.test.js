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
import { executer, dossierClaude } from '../src/controles.js';
import { git, gitLu } from '../src/commun.js';

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
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
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
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: {} });
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
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) }),
    { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]); s.indexer();
  assert.throws(() => appliquerRegles(s, ['depot'], [{ nom: 'essai', home }]), /règles illisibles, rien n'est écrit : depot:\/arbre\/index\.md/);
  assert.deepEqual(fs.readdirSync(home), [], 'le compte n’est pas réécrit');
  // Sans le projet illisible, le compte s'écrit.
  const ok = appliquerRegles(s, [], [{ nom: 'essai', home }]);
  assert.deepEqual(ok.comptes[0].fichiers.crees, ['francais.md']);
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
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
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
  const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
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
  const ctx = { depot: d, maison, env: { HOME: maison }, holarch: [path.join(maison, '.claude', 'holarch')], conteneurs: [] };
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
