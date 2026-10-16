// Tests de l'étape 3 : accès distant par projet (tranche 1). systemctl est remplacé par un enregistreur : aucun service
// réel n'est touché.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerDistant, creerInterface, creerReveil, creerRecolte, declarerConfiance, nomDe } from '../src/distant.js';
import { binaireClaude, ecrireSansLien, lireSansLien } from '../src/commun.js';

import { tmp } from './temporaire.js';

function banc({ mode = 'auto', session } = {}) {
  const racine = tmp(); const unites = tmp(); const cfgClaude = path.join(tmp(), '.claude.json');
  fs.mkdirSync(path.join(racine, 'demo')); fs.mkdirSync(path.join(racine, 'autre'));
  fs.writeFileSync(cfgClaude, JSON.stringify({ autre: 1, projects: { '/x': { hasTrustDialogAccepted: false, garde: true } } }));
  const appels = []; const actifs = new Set(); const pannes = new Set(); const coupees = new Set();
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'restart' && pannes.has(args[1])) { actifs.delete(args[1]); return { status: 1, stdout: '', stderr: 'Job failed' }; }
    if (args[0] === 'enable') { actifs.add(args.at(-1)); coupees.delete(args.at(-1)); }
    if (args[0] === 'disable') { actifs.delete(args.at(-1)); coupees.add(args.at(-1)); }
    const etat = { 'is-active': actifs.has(args[1]) ? 'active' : 'inactive', 'is-enabled': coupees.has(args[1]) ? 'disabled' : 'enabled', 'is-system-running': 'running' }[args[0]];
    return { status: 0, stdout: etat ? `${etat}\n` : '', stderr: '' };
  };
  const config = { inventaire: { 'depots-git': { racines: [racine] }, 'claude-code': { config: cfgClaude } }, acces_distant: { mode_permissions: mode, ...(session ? { session_au_demarrage: session } : {}) } };
  const projets = ['demo', 'autre'].map((n) => ({ id: `holarch:project:${n}`, nom: n, location: path.join(racine, n) }));
  const horloge = { t: Date.parse('2026-01-01T08:00:00Z'), demarrage: 'premier' }; const accueil = tmp();
  const creer = (o = {}) => creerDistant(config, { unites, systemctl, claude: '/opt/outils/claude', projets, accueil, holarch: '/opt/holarch/bin/holarch.js', node: '/opt/node/bin/node', maintenant: () => horloge.t, demarrage: () => horloge.demarrage, ...o });
  const d = creer();
  return { racine, unites, cfgClaude, appels, pannes, horloge, accueil, d, systemctl, creer };
}

test('accès distant : activer écrit un service marqué, déclare la confiance et démarre ; desactiver le retire', () => {
  const { racine, unites, cfgClaude, appels, d } = banc();
  assert.deepEqual(d.liste(), []);
  const r = d.activer('demo');
  assert.deepEqual([r.nom, r.chemin, r.unite, r.confiance_declaree], ['demo', path.join(racine, 'demo'), 'holarch-distant-demo.service', true]);
  const texte = fs.readFileSync(path.join(unites, r.unite), 'utf8');
  assert.match(texte, /^# Écrit par HOLARCH/);
  assert.match(texte, new RegExp(`^WorkingDirectory=${path.join(racine, 'demo')}$`, 'm'));
  // Par défaut, le serveur démarre sans session : ni session vide à chaque redémarrage, ni session archivée reprise.
  const options = "'--name' 'demo' '--remote-control-session-name-prefix' 'demo' '--permission-mode' 'auto'";
  assert.match(texte, new RegExp(`^ExecStart=/bin/sh -c "exec '/opt/outils/claude' remote-control --no-create-session-in-dir ${options}"$`, 'm'));
  assert.doesNotMatch(texte, /--continue/);
  assert.match(texte, /^Environment="PATH=\/opt\/outils:/m);
  // L'affichage du serveur (redessiné chaque seconde) est jeté, ses erreurs restent au journal : sans `StandardError`,
  // systemd les envoie là où va la sortie standard, et deux arrêts en erreur n'avaient laissé aucun message.
  assert.match(texte, /^StandardOutput=null$/m); assert.match(texte, /^StandardError=journal$/m);
  const c = JSON.parse(fs.readFileSync(cfgClaude, 'utf8'));
  assert.equal(c.projects[path.join(racine, 'demo')].hasTrustDialogAccepted, true);
  assert.deepEqual([c.autre, c.projects['/x']], [1, { hasTrustDialogAccepted: false, garde: true }]);
  assert.deepEqual(appels.slice(0, 2), ['daemon-reload', 'enable --now holarch-distant-demo.service']);
  // Avec le premier accès distant, le minuteur de reprise après une veille ; hors de la liste des projets.
  assert.ok(appels.includes('enable --now holarch-reveil.timer'));
  assert.match(fs.readFileSync(path.join(unites, 'holarch-reveil.service'), 'utf8'), /^ExecStart="\/opt\/node\/bin\/node" --no-warnings "\/opt\/holarch\/bin\/holarch.js" distant reveil$/m);
  assert.deepEqual(d.liste(), [{ nom: 'demo', chemin: path.join(racine, 'demo'), projet: 'holarch:project:demo', actif: true, coupee: false }]);
  assert.equal(d.activer('holarch:project:demo').projet, 'holarch:project:demo', 'par son identifiant');
  assert.equal(d.activer(path.join(racine, 'demo')).confiance_declaree, false);
  d.desactiver('demo');
  assert.ok(!fs.existsSync(path.join(unites, r.unite)));
  assert.ok(appels.includes('disable --now holarch-distant-demo.service'));
  assert.deepEqual(d.liste(), []);
  assert.ok(!fs.existsSync(path.join(unites, 'holarch-reveil.timer')) && !fs.existsSync(path.join(unites, 'holarch-reveil.service')), 'retiré avec le dernier');
});

test('accès distant : `session_au_demarrage: reprendre` reprend la dernière session du dossier ; une valeur inconnue n’écrit rien', () => {
  const r = banc({ session: 'reprendre' });
  const texte = fs.readFileSync(path.join(r.unites, r.d.activer('demo').unite), 'utf8');
  const options = "'--name' 'demo' '--remote-control-session-name-prefix' 'demo' '--permission-mode' 'auto'";
  assert.match(texte, new RegExp(`^ExecStart=/bin/sh -c "'/opt/outils/claude' remote-control --continue ${options} \\|\\| exec '/opt/outils/claude' remote-control ${options}"$`, 'm'));
  assert.doesNotMatch(texte, /create-session-in-dir/, 'incompatible avec --continue');
  const x = banc({ session: 'toujours' });
  assert.throws(() => x.d.activer('demo'), /acces_distant\.session_au_demarrage : toujours inconnu \(aucune ou reprendre\)/);
  assert.deepEqual(fs.readdirSync(x.unites), []); assert.deepEqual(x.appels, []);
  assert.equal(JSON.parse(fs.readFileSync(x.cfgClaude, 'utf8')).projects[path.join(x.racine, 'demo')], undefined, 'confiance non déclarée');
});

test('accès distant : après une veille du poste (écart entre deux passages du minuteur), les accès actifs sont redémarrés', () => {
  const { appels, horloge, d } = banc();
  d.activer('demo');
  const redemarrages = () => appels.filter((a) => a.startsWith('restart')).length;
  assert.deepEqual(d.reveil().relances, [], 'premier passage : rien à comparer');
  horloge.t += 60e3; assert.deepEqual(d.reveil().relances, [], 'une minute : pas de veille');
  horloge.t += 4 * 3600e3;
  assert.deepEqual(d.reveil(), { ecart_s: 4 * 3600, relances: ['demo'], echecs: [] });
  assert.deepEqual(appels.filter((a) => a.startsWith('restart')), ['restart holarch-distant-demo.service']);
  horloge.t += 60e3; d.reveil(); assert.equal(redemarrages(), 1, 'une seule fois par veille');
});

test('accès distant : un écart qui enjambe un démarrage (poste arrêté puis rallumé) ne relance rien, les accès viennent de démarrer', () => {
  const { appels, horloge, accueil, d } = banc();
  d.activer('demo'); d.reveil();
  horloge.t += 20 * 3600e3; horloge.demarrage = 'second';
  assert.deepEqual(d.reveil(), { ecart_s: 20 * 3600, relances: [], echecs: [], nouveau_demarrage: true });
  assert.deepEqual(appels.filter((a) => a.startsWith('restart')), [], 'arrêt du poste, pas une veille');
  horloge.t += 4 * 3600e3; assert.deepEqual(d.reveil().relances, ['demo'], 'une veille ensuite, dans le même démarrage, relance');
  // Passage noté avant cette version (sans démarrage) : l'écart seul décide, comme avant.
  fs.writeFileSync(path.join(accueil, 'distant-reveil'), `${new Date(horloge.t).toISOString()}\n`); horloge.t += 3600e3; horloge.demarrage = 'troisième';
  assert.deepEqual(d.reveil().relances, ['demo']);
});

test('accès distant : un redémarrage en échec au réveil n’arrête pas les suivants, il se dit ; la copie de service réécrit l’unité de réveil', () => {
  const { appels, pannes, horloge, unites, d } = banc();
  d.activer('demo'); d.activer('autre'); d.reveil();
  pannes.add('holarch-distant-autre.service'); horloge.t += 3600e3;
  const r = d.reveil();
  assert.deepEqual(r.relances, ['demo'], 'l’accès suivant est relancé malgré l’échec');
  assert.deepEqual(r.echecs.map((e) => e.nom), ['autre']); assert.match(r.echecs[0].message, /Job failed/);
  // Unité de réveil écrite avant la copie de service : `service poser` la fait pointer sur la copie posée.
  const systemctl = (args) => { appels.push(args.join(' ')); return { status: 0, stdout: '', stderr: '' }; };
  const f = path.join(unites, 'holarch-reveil.service');
  const pose = creerReveil({ holarch: '/accueil/service/courant/bin/holarch.js', accueil: '/accueil' }, { unites, systemctl, node: '/opt/node/bin/node' });
  assert.equal(pose.reecrire().etat, 'réécrite'); assert.match(fs.readFileSync(f, 'utf8'), /"\/accueil\/service\/courant\/bin\/holarch.js" distant reveil$/m);
  assert.equal(pose.reecrire().etat, 'inchangée');
  fs.rmSync(f); assert.equal(pose.reecrire().etat, 'absente', 'sans accès distant, rien n’est posé');
});

test('accès distant : projet introuvable refusé, service étranger jamais touché, mode par défaut omis', () => {
  const { unites, d } = banc({ mode: null });
  assert.throws(() => d.activer('absent'), /inconnu du catalogue/);
  fs.writeFileSync(path.join(unites, 'holarch-distant-demo.service'), '[Service]\nExecStart=/bin/true\n');
  assert.throws(() => d.activer('demo'), /pas été écrit par HOLARCH/);
  assert.throws(() => d.desactiver('demo'), /pas été écrit par HOLARCH/);
  assert.deepEqual(d.liste(), []);
  fs.rmSync(path.join(unites, 'holarch-distant-demo.service'));
  d.activer('demo');
  assert.doesNotMatch(fs.readFileSync(path.join(unites, 'holarch-distant-demo.service'), 'utf8'), /--permission-mode/);
  assert.equal(nomDe('/a/mon projet!'), 'mon-projet-');
  const f = path.join(tmp(), 'neuf.json');
  assert.equal(declarerConfiance(f, '/p'), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { projects: { '/p': { hasTrustDialogAccepted: true } } });
});

// Défaut N3 (revue des limites) : Claude Code réécrit `~/.claude.json` en entier, à tout moment ; HOLARCH, qui le réécrit
// aussi (dossier de confiance, entrée MCP de la copie de service), effaçait ce que Claude Code y avait écrit entre sa
// lecture et son renommage.
test('~/.claude.json : relu juste avant le renommage, une écriture de Claude Code entre-temps est gardée ; trois essais au plus', () => {
  const f = path.join(tmp(), 'claude.json');
  fs.writeFileSync(f, `${JSON.stringify({ numStartups: 1 })}\n`); fs.chmodSync(f, 0o600);
  // Claude Code écrit pendant que HOLARCH écrit son temporaire, `fois` fois de suite.
  const ecrireFs = fs.writeFileSync;
  const claudePendant = (fois, faire) => {
    fs.writeFileSync = (x, ...r) => { ecrireFs(x, ...r); if (typeof x === 'number' && fois-- > 0) { const c = JSON.parse(fs.readFileSync(f, 'utf8')); ecrireFs(f, JSON.stringify({ ...c, numStartups: c.numStartups + 1 })); } };
    try { return faire(); } finally { fs.writeFileSync = ecrireFs; }
  };
  assert.equal(claudePendant(1, () => declarerConfiance(f, '/p')), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { numStartups: 2, projects: { '/p': { hasTrustDialogAccepted: true } } }, 'l’écriture de Claude Code est gardée, la nôtre refaite dessus');
  assert.equal(fs.statSync(f).mode & 0o777, 0o600);
  // Changé à chaque essai : rien n'est remplacé, et c'est dit.
  assert.throws(() => claudePendant(3, () => declarerConfiance(f, '/q')), new RegExp(`^Error: ${f} a changé pendant chacun des 3 essais d’écriture : rien n’est écrit$`));
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { numStartups: 5, projects: { '/p': { hasTrustDialogAccepted: true } } });
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['claude.json'], 'aucun temporaire laissé');
});

// ---------------------------------------------------------------- tranche 2 : vue Projets
import { spawnSync } from 'node:child_process';
import { Journal } from '../src/stockage/journal.js';
import { Socle } from '../src/socle.js';
import { parse as parseJsonc } from 'jsonc-parser';
import YAML from 'yaml';
import importerTranscriptions, { cheminsAppel } from '../src/import/claude-code-transcriptions.js';
import { localiserProjet, resoudreProjet } from '../src/projets.js';
import inventaireArbre, { empreinteArbres } from '../src/inventaire/arbre.js';
import inventaireDepots from '../src/inventaire/depots-git.js';
import { ulid } from '../src/ulid.js';
import { recolter, trier, ajouterRegles } from '../src/recolte.js';

const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const vieillir = (f) => { const t = new Date(Date.now() - 3600e3); fs.utimesSync(f, t, t); };
const PROJETS = [{ id: 'holarch:project:a', nom: 'a', location: '/ws/a' }, { id: 'holarch:project:b', nom: 'b', location: '/ws/b' }, { id: 'holarch:project:sous', nom: 'sous', location: '/ws/a/sous' }];

function transcription(home) {
  const f = path.join(home, 'projects', '-ws', 's1.jsonl');
  let n = 0;
  const appel = (cwd, name, input) => JSON.stringify({ type: 'assistant', sessionId: 's1', cwd, timestamp: `2026-10-01T10:0${n}:00Z`, requestId: `r${n}`,
    message: { id: `m${n++}`, model: 'modele-x', content: [{ type: 'tool_use', id: `t${n}`, name, input }], usage: { input_tokens: 1, output_tokens: 5 } } });
  ecrire(f, [
    appel('/ws', 'Read', { file_path: '/ws/a/x.js' }),
    appel('/ws', 'Bash', { command: 'cd /ws/b && git status 2>/dev/null' }),
    appel('/ws/b', 'Bash', { command: 'ls' }),
    appel('/ws/b', 'Bash', { command: 'git -C ../a log --oneline' }),
    appel('/ws/b', 'Edit', { file_path: '/ws/a/sous/y.md', old_string: 'secret', new_string: 'x' }),
    appel('/ws', 'Bash', { command: 'cat /tmp/z' }),
    appel('/ws', 'mcp__holarch__etat', {}),
  ].join('\n') + '\n');
  vieillir(f);
  return f;
}

test('projets : une session se rattache aux projets dont ses appels ont touché le dépôt, sans garder chemins ni commandes', () => {
  assert.deepEqual(cheminsAppel({ command: 'cd b && cat ~/n.txt /etc/x' }, '/ws'), ['/ws/b', path.join(os.homedir(), 'n.txt'), '/etc/x']);
  // Vu d'un conteneur : rattaché par le nom du dépôt si la suite du chemin existe dans le dépôt.
  const existe = (p) => ['/ws/a/src/x.js', '/ws/a/sous'].includes(p);
  const loc = localiserProjet(PROJETS, existe);
  assert.deepEqual(['/home/dev/a/src/x.js', '/home/dev/a/sous', '/home/dev/a/absent', '/home/dev/b/x', '/ws/b/y'].map((p) => loc(p)?.nom ?? null), ['a', 'sous', null, null, 'b']);
  const home = tmp(); const donnees = tmp(); transcription(home);
  const journal = new Journal(donnees, 'local');
  importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees, projets: PROJETS });
  const fin = [...journal.lire()].find((e) => e.kind === 'session.finished');
  assert.deepEqual(fin.data.projets, [{ id: 'holarch:project:a', n: 2 }, { id: 'holarch:project:b', n: 2 }, { id: 'holarch:project:sous', n: 1 }]);
  // Une référence donnée par une personne : identifiant, nom, chemin ; un nom porté par deux projets est refusé.
  assert.deepEqual(['holarch:project:b', 'sous', '/ws/a/x', 'absent'].map((r) => resoudreProjet(PROJETS, r)?.nom ?? null), ['b', 'sous', 'a', null]);
  assert.throws(() => resoudreProjet([...PROJETS, { id: 'holarch:project:a2', nom: 'a', location: '/autre/a' }], 'a'), /ambigu/);
  const tout = JSON.stringify([...journal.lire()]);
  assert.ok(!tout.includes('x.js') && !tout.includes('git status') && !tout.includes('secret') && !tout.includes('/tmp/z'), 'ni chemin, ni commande, ni argument');
});

// Chemin relatif (revue des limites, 2026-10-14 : 833 commandes avec `../` en 30 jours, 37 vers un autre projet) : un
// `../autre-depot/…` ne rattachait pas la session. Résolu depuis le répertoire de la ligne, seulement sans `cd` dans la
// commande (après un `cd`, faux dans 470 cas sur 833), et pour une transcription lue pour la première fois depuis.
test('projets : un chemin qui remonte (../) se résout depuis le répertoire de la ligne, sauf après un cd ; transcriptions nouvelles seulement', () => {
  assert.deepEqual(cheminsAppel({ command: 'cat ../a/x.js | grep -v x/../y && ls ./c' }, '/ws/b'), ['/ws/a/x.js', '/ws/b/y']);
  assert.deepEqual(cheminsAppel({ command: 'cd /ws/a/sous && cat ../../b/x.js' }, '/ws/b'), ['/ws/a/sous'], 'après un cd : laissé');
  const home = tmp(); const donnees = tmp(); const journal = new Journal(donnees, 'local');
  const ligne = (s, n, command) => JSON.stringify({ type: 'assistant', sessionId: s, cwd: '/ws/b', timestamp: `2026-10-01T10:0${n}:00Z`, requestId: `r${n}`,
    message: { id: `m${n}`, model: 'modele-x', content: [{ type: 'tool_use', id: `t${n}`, name: 'Bash', input: { command } }], usage: { output_tokens: 1 } } });
  const neuve = path.join(home, 'projects', '-ws-b', 'neuve.jsonl'); ecrire(neuve, `${ligne('neuve', 0, 'cat ../a/x.js')}\n`); vieillir(neuve);
  // Déjà lue avant cette lecture (son état n'en porte pas), puis grandie : ses projets se lisent comme avant.
  const ancienne = path.join(home, 'projects', '-ws-b', 'ancienne.jsonl'); ecrire(ancienne, `${ligne('ancienne', 0, 'ls')}\n`);
  ecrire(path.join(donnees, 'import', 'claude-code-transcriptions.json'), JSON.stringify({ 'projects/-ws-b/ancienne.jsonl': { v: 6, taille: fs.statSync(ancienne).size, session: true, cumuls: {} } }));
  fs.appendFileSync(ancienne, `${ligne('ancienne', 1, 'cat ../a/x.js')}\n`); vieillir(ancienne);
  importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees, projets: PROJETS });
  const projets = (s) => [...journal.lire()].filter((e) => e.correlation === s && e.kind === 'session.finished').at(-1).data.projets;
  assert.deepEqual([projets('neuve'), projets('ancienne')], [[{ id: 'holarch:project:a', n: 1 }], [{ id: 'holarch:project:b', n: 2 }]]);
});

test('projets : une transcription déjà importée reçoit un complément de projets, et rien d’autre', () => {
  const home = tmp(); const donnees = tmp(); const f = transcription(home);
  const journal = new Journal(donnees, 'local');
  // État de la version 4 : la session, ses coûts et ses appels sont déjà au journal, sous une autre graine.
  ecrire(path.join(donnees, 'import', 'claude-code-transcriptions.json'), JSON.stringify({ 'projects/-ws/s1.jsonl': { v: 4, taille: fs.statSync(f).size, session: true, cumuls: { 'modele-x': { in: 7, cache_write: 0, cache_write_1h: 0, cache_read: 0, out: 35 } } } }));
  const r = importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees, projets: PROJETS });
  const ev = [...journal.lire()];
  assert.deepEqual(ev.map((e) => e.kind), ['session.finished'], `un seul complément (${r.ajoutes} ajouté(s))`);
  assert.equal(ev[0].data.complement, 'projets'); assert.equal(ev[0].data.projets.length, 3); assert.equal(ev[0].data.tours, 7);
  assert.equal(importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees, projets: PROJETS }).fichiers_lus, 0);
});

test('projets : avancement de l’étape, questions, idées, décisions, activité partagée, état du dépôt', () => {
  const donnees = tmp();
  const s = new Socle({ site: 'local', donnees, web: {}, inventaire: {}, import: {}, tarifs: { modeles: { m: { entree: 0, cache_ecrit: 0, cache_lu: 0, sortie: 1e6 } } } });
  const il_y_a = (j) => new Date(Date.now() - j * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  const ev = [];
  const session = (corr, j, data, usd) => {
    const base = { actor: 'agent:claude-code/m', correlation: corr, classification: 'internal' };
    ev.push({ ...base, id: ulid(Date.parse(il_y_a(j)), `${corr}c`), at: il_y_a(j), kind: 'cost.recorded', data: {}, cost: { provider: 'anthropic', model: 'm', usd_list: null, tokens: { out: usd } } });
    ev.push({ ...base, id: ulid(Date.parse(il_y_a(j)), `${corr}f`), at: il_y_a(j), kind: 'session.finished', data: { sous_agent: false, tours: 4, ...data } });
  };
  session('s1', 1, { cwd: '/ws', projet: 'ws', projets: [{ id: 'holarch:project:a', n: 3 }, { id: 'holarch:project:b', n: 1 }] }, 8);
  session('s2', 10, { cwd: '/ws/b/src', projet: 'src', projets: [] }, 2);
  session('s3', 20, { cwd: '/ws', projet: 'ws' }, 4);
  ev.push({ actor: 'agent:claude-code/m', correlation: 's3', classification: 'internal', id: ulid(Date.parse(il_y_a(20)), 's3x'), at: il_y_a(20), kind: 'session.finished', data: { sous_agent: false, tours: 4, cwd: '/ws', projet: 'ws', projets: [{ id: 'holarch:project:a', n: 1 }], complement: 'projets' } });
  session('s4', 3, { cwd: '/ailleurs', projet: 'ailleurs' }, 1);
  s.journal.ajouter(ev);
  const projet = (nom, attributes) => ({ id: `holarch:project:${nom}`, kind: 'project', name: nom, status: 'active', provenance: { source: 't' }, location: `/ws/${nom}`, attributes });
  const noeud = (projet, rel, type, statut, attributes = {}) => ({ id: `holarch:node:${projet}${rel}`, kind: 'node', name: `${type} ${rel}`, status: 'proposed', provenance: { source: 't' }, location: `/ws/${projet}${rel}`, node: rel, links: { project: [`holarch:project:${projet}`] }, attributes: { type, statut, ...attributes } });
  s.catalogue.remplacer([
    projet('a', { branche: 'main', amont: 'origin/main', en_avance: 2, en_retard: 0, fichiers_modifies: 1, dernier_commit: il_y_a(2), dernier_sujet: 'Un commit' }),
    projet('b', { branche: 'main', amont: 'origin/main', en_avance: 0, en_retard: 0, fichiers_modifies: 0 }),
    projet('c', { branche: 'main', amont: null, fichiers_modifies: 0, dernier_commit: il_y_a(200) }),
    noeud('a', '/arbre/index.md', 'guideline', 'draft', { questions_ouvertes: [{ id: 'Q1', noeud: 'x.md', question: 'Quoi ?', niveau: 'gênant' }],
      idees: [['I1', 'étape 2, récolte', 'retenue'], ['I2', 'étape 2', 'prise'], ['I3', 'étape 21', 'retenue'], ['I4', 'après l’étape 2', 'retenue'], ['I5', 'Étape 2 (vue)', 'à trier'], ['I6', 'étape 2', 'écartée pour l’instant']]
        .map(([id, phase, statut]) => ({ id, idee: id, phase, statut })) }),
    noeud('a', '/arbre/conception/etape-1-voir.md', 'spec', 'draft', { etape: 1, avancement: [{ etiquette: 'Fait', date: '2026-10-01', texte: 'un', sous: [] }, { etiquette: 'Clôture', date: '2026-10-02', texte: 'close', sous: [] }] }),
    noeud('a', '/arbre/conception/etape-2-agir.md', 'spec', 'draft', { etape: 2, avancement: [{ etiquette: 'Fait', date: '2026-10-03', texte: 'deux', sous: [] }, { etiquette: 'Fait', date: '2026-10-04', texte: 'trois', sous: [] }, { etiquette: 'Reste, hors clôture', date: null, texte: null, sous: ['r1', 'r2'] }] }),
    noeud('a', '/arbre/decisions/d1.md', 'decision', 'draft'),
    noeud('a', '/arbre/decisions/d2.md', 'decision', 'stable'),
  ]);
  s.indexer();
  const { projets, hors_projet } = s.projets();
  const [a, b, c] = ['a', 'b', 'c'].map((n) => projets.find((p) => p.nom === n));
  assert.deepEqual(projets.map((p) => p.nom), ['a', 'b', 'c'], 'rangés par activité récente');
  assert.deepEqual([a.etape.numero, a.etape.faits, a.etape.dernier_fait.texte, a.etape.reste], [2, 2, 'trois', ['r1', 'r2']]);
  assert.deepEqual([a.questions.map((q) => q.id), a.decisions.map((d) => d.titre)], [['Q1'], ['decision /arbre/decisions/d1.md']]);
  assert.deepEqual([a.idees.map((i) => i.id), b.idees], [['I1', 'I5'], []], 'idées de l’étape en cours, ni prises ni écartées');
  assert.deepEqual([a.technique.en_avance, a.technique.fichiers_modifies, a.dernier_commit.sujet], [2, 1, 'Un commit']);
  // s1 : 8 $ partagés 3/4 a, 1/4 b ; s2 : sans dépôt touché, rattachée au dépôt de son répertoire (b) ; s3 : complément (a).
  assert.deepEqual([a.activite.sessions_7, a.activite.sessions_30, a.activite.usd_7, a.activite.usd_30], [1, 2, 6, 10]);
  assert.deepEqual([b.activite.sessions_7, b.activite.sessions_30, b.activite.usd_30], [1, 2, 4]);
  assert.deepEqual([hors_projet.sessions_30, hors_projet.usd_30], [1, 1]);
  assert.deepEqual([a.calme, b.calme, c.calme, c.activite], [false, false, true, null]);
  assert.equal(s.sessions({ jours: 30 }).length, 4, 'le complément ne fait pas une session de plus');
  assert.deepEqual(s.sessions({ jours: 30, projet: 'holarch:project:b' }).map((x) => x.session).sort(), ['s1', 's2']);
  assert.deepEqual(s.sessions({ jours: 30, projet: 'b' }).map((x) => x.session).sort(), ['s1', 's2'], 'par son nom');
  assert.deepEqual(s.sessions({ jours: 30, projet: 'aucun' }).map((x) => x.session), ['s4']);
  assert.equal(s.etat().sessions.total, 4);
  // Le tableau de bord compte comme la vue Projets : même attribution, même partage du coût.
  const conso = Object.fromEntries(s.consommation({ jours: 30, par: 'projet' }).map((x) => [x.cle, x.usd]));
  assert.deepEqual(conso, { 'holarch:project:a': 10, 'holarch:project:b': 4, null: 1 });
  assert.deepEqual(s.arbre().find((n) => n.chemin === '/arbre/index.md').projet, { id: 'holarch:project:a', nom: 'a' });
});

test('projets : l’inventaire lit l’avancement, les questions, les idées et l’écart à l’amont sans réseau', async () => {
  const env = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@exemple.test', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@exemple.test' };
  Object.assign(process.env, env);
  const g = (d, ...a) => { const r = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  const racine = tmp(); const nu = path.join(racine, 'nu.git'); const depot = path.join(racine, 'demo'); const autre = path.join(racine, 'autre');
  spawnSync('git', ['init', '-q', '--bare', '-b', 'main', nu]);
  spawnSync('git', ['clone', '-q', nu, depot]);
  ecrire(path.join(depot, 'arbre', 'index.md'), '---\ntype: guideline\ntitle: Racine\nstatus: draft\n---\n');
  ecrire(path.join(depot, 'arbre', 'questions.md'), '# Questions ouvertes\n\n| # | Nœud | Question | Niveau |\n|---|---|---|---|\n| Q3 | `x.md` §1 | Une **question** ? | gênant |\n\n## Résolues\n\n| Q1 | fini | oui |\n');
  ecrire(path.join(depot, 'arbre', 'idees.md'), '# Boîte à idées\n\n| # | Idée | Source | Phase visée | Gain attendu | Statut |\n|---|---|---|---|---|---|\n| I2 | Une **idée** | auteur, 2026-10-07 | étape 1, récolte | moins de frappe | retenue |\n')
  ecrire(path.join(depot, 'arbre', 'conception', 'etape-1-demo.md'), '---\ntype: spec\ntitle: Étape 1 — Démo\nstatus: draft\n---\n\n## Avancement\n\n- **Fait (2026-10-01)** : première\n  partie.\n- **Reste** :\n  1. **Un** : à faire\n     suite.\n  2. Deux.\n\n## Hors périmètre\n\n- **Fait (2026-10-09)** : pas ici\n');
  g(depot, 'checkout', '-q', '-b', 'main'); g(depot, 'add', '.'); g(depot, 'commit', '-q', '-m', 'Premier'); g(depot, 'push', '-q', '-u', 'origin', 'main');
  spawnSync('git', ['clone', '-q', nu, autre]); ecrire(path.join(autre, 'f'), 'x'); g(autre, 'add', '.'); g(autre, 'commit', '-q', '-m', 'Ailleurs'); g(autre, 'push', '-q');
  g(depot, 'fetch', '-q'); ecrire(path.join(depot, 'g'), 'y'); g(depot, 'add', '.'); g(depot, 'commit', '-q', '-m', 'Ici');
  const ctx = { site: 'local' };
  const p = inventaireDepots({ racines: [racine], profondeur: 1 }, ctx).find((f) => f.name === 'demo');
  assert.deepEqual([p.attributes.amont, p.attributes.en_avance, p.attributes.en_retard, p.attributes.dernier_sujet], ['origin/main', 1, 1, 'Ici']);
  assert.ok(p.attributes.dernier_fetch);
  const n = inventaireArbre({}, ctx);
  const ici = n.filter((f) => f.location.startsWith(depot + path.sep)); // le clone « autre » porte le même arbre
  const idx = ici.find((f) => f.node === '/arbre/index.md'); const et = ici.find((f) => f.node === '/arbre/conception/etape-1-demo.md');
  assert.deepEqual(idx.attributes.questions_ouvertes, [{ id: 'Q3', noeud: 'x.md §1', question: 'Une question ?', niveau: 'gênant' }]);
  assert.deepEqual(idx.attributes.idees, [{ id: 'I2', idee: 'Une idée', source: 'auteur, 2026-10-07', phase: 'étape 1, récolte', gain: 'moins de frappe', statut: 'retenue' }]);
  assert.equal(et.attributes.etape, 1);
  assert.deepEqual(et.links.project, [p.id], 'un nœud appartient au projet de son dépôt');
  const { slug } = await import('../src/inventaire/outils.js');
  assert.equal(et.id, `holarch:node:${slug(p.id.slice('holarch:project:'.length) + '/arbre/conception/etape-1-demo.md')}`, 'identifiant fondé sur celui du projet');
  assert.deepEqual(et.attributes.avancement, [{ etiquette: 'Fait', date: '2026-10-01', texte: 'première partie.', sous: [] }, { etiquette: 'Reste', date: null, texte: null, sous: ['Un : à faire suite.', 'Deux.'] }]);
});

// ---- Tranche 3 : arbre des règles (décision arbre-des-regles). Données fictives.
import { regleEffective, regleDuCompte, fusionnerConfig, aApprouver, exceptions } from '../src/regles.js';
import { planifier, appliquer, MARQUE } from '../src/regles-claude-code.js';

function arbresFictifs() {
  const r = tmp(); const d = (n) => path.join(r, n);
  const ok = 'status: stable\n    approved: { by: human:alice, at: 2026-10-06 }';
  // Profil : racine, contexte qui déclare deux projets.
  ecrire(path.join(d('profil'), 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\n---\n');
  ecrire(path.join(d('profil'), 'arbre', 'rules.yaml'), `- id: avis-argumente\n  statement: Donner un avis argumenté avant d'appliquer une consigne de conception.\n  why: Une consigne appliquée à la lettre a déjà coûté une reprise.\n  ${ok.replace('\n    ', '\n  ')}\n- id: francais\n  statement: Répondre en français.\n  ${ok.replace('\n    ', '\n  ')}\n- id: secret-du-profil\n  statement: Ne jamais citer le profil.\n  derogable: false\n  ${ok.replace('\n    ', '\n  ')}\n- id: proposee\n  statement: Une règle pas encore approuvée.\n`);
  ecrire(path.join(d('profil'), 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:socle, holarch:project:bundle]\nrules:\n  - id: commit-sur-main\n    statement: Commiter sur main.\n    status: stable\n    approved: { by: human:alice, at: 2026-10-06 }\n---\n');
  // Socle : un type transverse, et sa propre racine (projet).
  ecrire(path.join(d('socle'), 'arbre', 'index.md'), '---\ntype: guideline\nid: socle\ntitle: Socle fictif\nstatus: draft\ntypes: [methode]\nderogations:\n  - { rule: francais, why: dépôt en anglais, by: human:alice, at: 2026-10-06 }\n  - { rule: secret-du-profil, why: essai, by: human:alice, at: 2026-10-06 }\n---\n');
  ecrire(path.join(d('socle'), 'arbre', 'rules.yaml'), `- id: tests-verts\n  statement: Les tests passent avant de rendre la main.\n  ${ok.replace('\n    ', '\n  ')}\n- id: avis-argumente\n  statement: Avis argumenté, version du projet.\n  ${ok.replace('\n    ', '\n  ')}\n- id: secret-du-profil\n  statement: Redéfinie, interdit.\n  ${ok.replace('\n    ', '\n  ')}\n`);
  ecrire(path.join(d('socle'), 'arbre', 'types-transverses', 'methode', 'index.md'), '---\ntype: template\nid: methode\ntitle: Méthode fictive\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  ecrire(path.join(d('socle'), 'arbre', 'types-transverses', 'methode', 'rules.yaml'), `- id: jamais-inventer\n  statement: Un fait inconnu se marque, il ne s'invente pas.\n  ${ok.replace('\n    ', '\n  ')}\n- id: garde\n  statement: Bloquer l'envoi sans vérification.\n  level: blocking\n  ${ok.replace('\n    ', '\n  ')}\n- id: doc-courte\n  statement: Les documents de conception restent courts.\n  level: guided\n  applies_to: { paths: ["arbre/**/*.md"] }\n  ${ok.replace('\n    ', '\n  ')}\n`);
  // Bundle OKF : racine à la racine du dépôt, ses documents ne sont pas lus.
  ecrire(path.join(d('bundle'), 'index.md'), '---\nokf_version: "0.2"\ntypes: [methode, inexistant]\n---\n# Bundle\n');
  ecrire(path.join(d('bundle'), 'rules.yaml'), 'pas: une liste\n');
  ecrire(path.join(d('bundle'), 'notes', 'doc.md'), '---\ntype: Protocole\ntitle: Document du bundle\n---\n');
  const ctx = { depots: ['profil', 'socle', 'bundle'].map(d), projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) };
  return { r, d, fiches: inventaireArbre({}, ctx), profil: { profil: d('profil') } };
}

test('règles : l’inventaire lit les règles des nœuds, la racine d’un bundle OKF, et signale un rules.yaml invalide', () => {
  const { fiches } = arbresFictifs();
  const regles = fiches.filter((f) => f.kind === 'rule');
  const ids = regles.map((f) => f.id).sort();
  assert.ok(ids.includes('holarch:rule:profil/avis-argumente') && ids.includes('holarch:rule:socle/methode/jamais-inventer') && ids.includes('holarch:rule:profil/contextes/perso/commit-sur-main'), ids.join(' '));
  const avis = regles.find((f) => f.id === 'holarch:rule:profil/avis-argumente');
  assert.deepEqual([avis.status, avis.classification, avis.attributes.niveau, avis.attributes.statut], ['active', 'confidential', 'reminder', 'stable']);
  assert.equal(regles.find((f) => f.name === 'proposee').attributes.statut, 'draft', 'sans statut : brouillon');
  const okf = fiches.filter((f) => f.kind === 'node' && f.location.includes(`${path.sep}bundle${path.sep}`));
  assert.deepEqual(okf.map((f) => f.node), ['/index.md'], 'd’un bundle OKF, seule la racine est lue');
  assert.match(okf[0].attributes.erreur_regles, /liste de règles/);
});

test('règles : règle effective d’un projet (profil, contexte, types, projet), redéfinition, dérogation, non dérogeable', () => {
  const { fiches, profil } = arbresFictifs();
  const e = regleEffective(fiches, 'holarch:project:socle', profil);
  const par = Object.fromEntries(e.regles.map((x) => [x.id, x]));
  assert.deepEqual(e.arbre.types, ['methode']);
  assert.equal(par['avis-argumente'].origine, 'projet', 'le plus spécifique l’emporte');
  assert.deepEqual(par['avis-argumente'].recouvre.map((x) => x.origine), ['profil']);
  assert.equal(par['commit-sur-main'].origine, 'contexte');
  assert.equal(par['jamais-inventer'].origine, 'type');
  assert.equal(par['secret-du-profil'].origine, 'profil', 'une règle non dérogeable tient');
  assert.ok(e.signaux.some((x) => /non dérogeable redéfinie : secret-du-profil/.test(x)) && e.signaux.some((x) => /dérogation refusée : secret-du-profil/.test(x)));
  assert.deepEqual([par.francais.applicable, par.francais.derogee.pourquoi], [false, 'dépôt en anglais']);
  assert.deepEqual([par.proposee.applicable, par.proposee.statut], [false, 'draft'], 'un brouillon se montre, il ne s’applique pas');
  assert.ok(e.rappels > 0);
  const b = regleEffective(fiches, 'holarch:project:bundle', profil);
  assert.ok(b.signaux.some((x) => /type inconnu : inexistant/.test(x)) && b.signaux.some((x) => /liste de règles/.test(x)));
  assert.ok(b.regles.some((x) => x.id === 'jamais-inventer'), 'un bundle OKF adopte un type par sa racine');
  const sans = regleEffective(fiches, 'holarch:project:inconnu', profil);
  assert.ok(sans.signaux.some((x) => /aucun contexte ne déclare/.test(x)) && sans.regles.every((x) => x.origine === 'profil'));
  const c = regleDuCompte(fiches, profil);
  assert.deepEqual(c.regles.map((x) => x.id).sort(), ['avis-argumente', 'commit-sur-main', 'francais', 'proposee', 'secret-du-profil'], 'un seul contexte : profil et contexte au compte');
});

test('règles : un brouillon plus bas ne remplace pas une règle approuvée de même id ; il reste proposé', () => {
  const { d, profil } = arbresFictifs();
  // Une redite récoltée au nœud du projet, sous l'id d'une règle approuvée du type (bloquante, contrôlée).
  fs.appendFileSync(path.join(d('socle'), 'arbre', 'rules.yaml'), '- id: garde\n  statement: Une redite récoltée.\n');
  const ctx = { depots: ['profil', 'socle', 'bundle'].map(d), projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) };
  const e = regleEffective(inventaireArbre({}, ctx), 'holarch:project:socle', profil);
  const g = e.regles.find((x) => x.id === 'garde');
  assert.deepEqual([g.origine, g.statut, g.niveau, g.applicable], ['type', 'stable', 'blocking', true], 'l’approuvée tient');
  assert.equal(g.proposee?.enonce, 'Une redite récoltée.', 'le brouillon reste visible, à approuver');
  assert.ok(aApprouver(g) && e.signaux.some((x) => /brouillon sur une règle approuvée : garde/.test(x)));
});

test('règles : l’adaptateur Claude Code écrit un fichier marqué par règle, retire ce qui n’a plus de règle, ne touche pas le reste', () => {
  const { fiches, profil } = arbresFictifs();
  const e = regleEffective(fiches, 'holarch:project:socle', profil);
  const plan = planifier(e.regles, { portee: 'projet', classificationDepot: 'internal' });
  assert.deepEqual(plan.fichiers.map((x) => x.fichier).sort(), ['avis-argumente.md', 'doc-courte.md', 'jamais-inventer.md', 'tests-verts.md']);
  assert.deepEqual(Object.fromEntries(plan.non.map((x) => [x.regle, x.raison])), { garde: 'niveau blocking sans contrôle ni permission' });
  assert.ok(plan.signaux.some((x) => /dérogation à francais sans effet/.test(x)), 'Claude Code additionne les portées : le dire');
  const avis = plan.fichiers.find((x) => x.regle === 'avis-argumente').contenu;
  assert.ok(avis.startsWith(MARQUE) && /prévaut sur celle du même nom posée au niveau du compte/.test(avis));
  assert.match(plan.fichiers.find((x) => x.regle === 'doc-courte').contenu, /^---\npaths:\n {2}- "arbre\/\*\*\/\*\.md"\n---\n/);
  const public_ = planifier(e.regles, { portee: 'projet', classificationDepot: 'public' });
  assert.equal(public_.fichiers.length, 0, 'une règle interne ne s’écrit pas dans un dépôt public');
  assert.match(public_.non.find((x) => x.regle === 'tests-verts').raison, /classification internal plus fermée que le dépôt \(public\)/);
  const depot = tmp(); const dossier = path.join(depot, '.claude', 'rules', 'holarch');
  ecrire(path.join(dossier, 'a-la-main.md'), 'règle écrite à la main\n');
  ecrire(path.join(dossier, 'tests-verts.md'), 'écrite à la main, même nom\n');
  ecrire(path.join(dossier, 'ancienne.md'), `${MARQUE}\nrègle retirée de l'arbre\n`);
  const essai = appliquer(depot, dossier, plan, { ecrire: false });
  assert.deepEqual([essai.crees.length, essai.retires, essai.ignores], [3, ['ancienne.md'], ['tests-verts.md']]);
  assert.ok(fs.existsSync(path.join(dossier, 'ancienne.md')), 'un essai n’écrit rien');
  const r = appliquer(depot, dossier, plan);
  assert.deepEqual([r.crees.sort(), r.retires], [['avis-argumente.md', 'doc-courte.md', 'jamais-inventer.md'], ['ancienne.md']]);
  assert.equal(fs.readFileSync(path.join(dossier, 'tests-verts.md'), 'utf8'), 'écrite à la main, même nom\n', 'un fichier non marqué n’est jamais touché');
  assert.ok(fs.existsSync(path.join(dossier, 'a-la-main.md')));
  assert.deepEqual(appliquer(depot, dossier, plan).inchanges.sort(), ['avis-argumente.md', 'doc-courte.md', 'jamais-inventer.md'], 'idempotent');
  const compte = planifier(regleDuCompte(fiches, profil).regles, { portee: 'compte' });
  assert.deepEqual(compte.fichiers.map((x) => x.fichier).sort(), ['avis-argumente.md', 'commit-sur-main.md', 'francais.md', 'secret-du-profil.md']);
});

test('ligne de commande : --help affiche l’aide et une option inconnue arrête tout avant d’agir', () => {
  const accueil = tmp();
  const holarch = (...a) => spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), ...a], { encoding: 'utf8', env: { ...process.env, HOLARCH_HOME: accueil } });
  const aide = holarch('regles', 'appliquer', '--help');
  assert.equal(aide.status, 0);
  assert.match(aide.stdout, /holarch regles appliquer/);
  const r = holarch('regles', 'appliquer', '--essai');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /option inconnue --essai/);
  assert.deepEqual(fs.readdirSync(accueil), [], 'rien n’est écrit');
});

// ---- Tranche 4 : audit de conformité (décision controles-de-regles). Données fictives.
import { listePrivee, chercheur, executer } from '../src/controles.js';
import { crochetDe, poserCrochet } from '../src/garde-git.js';
import { appliquerPermissions, lecturesRefusees } from '../src/regles-claude-code.js';

function depotGit(d = tmp()) {
  const g = (...a) => { const r = spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
  g('init', '-q'); g('config', 'user.name', 'Alice Exemple'); g('config', 'user.email', 'alice@exemple.test'); g('config', 'commit.gpgsign', 'false');
  return { d, g };
}
const jourIl = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

test('contrôles : liste privée déduite et amendée, mots entiers, un écart dit où sans répéter le terme', () => {
  const { d, g } = depotGit();
  const t = listePrivee({ depot: d, config: { donnees_personnelles: { termes: ['Projet Zeta', { terme: 'zz' }] } },
    couches: [{ origine: 'projet', config: { donnees_personnelles: { exceptions: [{ terme: 'alice@exemple.test', pourquoi: 'adresse de test' }, { terme: 'Alice Exemple' }] } } }],
    comptes: [{ home: '/srv/comptes/.claude-pro' }], projetsPrives: ['carnet-prive', 'demo'], nomProjet: 'demo' });
  assert.ok(['Alice Exemple', 'Projet Zeta', 'carnet-prive', '/srv/comptes/.claude-pro', os.homedir()].every((x) => t.includes(x)), t.join(' | '));
  assert.ok(!t.includes('alice@exemple.test') && !t.includes('demo') && !t.includes('zz'), 'exception, nom du projet, terme trop court');
  const c = chercheur(['Projet Zeta', 'carnet-prive']);
  assert.ok(c('voir le projet zeta.') && c('(carnet-prive)') && !c('carnet-priveX') && !c('xcarnet-prive'));
  ecrire(path.join(d, 'a.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'a');
  ecrire(path.join(d, 'a.md'), 'propre\nnote du Projet Zeta\nencore projet zeta\n'); ecrire(path.join(d, 'carnet-prive.txt'), 'x\n'); g('add', '.');
  const ctx = { depot: d, termes: ['Projet Zeta', 'carnet-prive'] };
  const avant = executer('donnees-personnelles', ctx, 'avant-commit');
  assert.deepEqual(avant.ecarts.map((e) => [e.fichier, e.ligne, e.n]).sort(), [['a.md', 2, 2], ['carnet-prive.txt', null, 1]]);
  assert.ok(!/zeta/i.test(JSON.stringify(avant)), 'un écart ne cite jamais le terme trouvé');
  g('commit', '-qm', 'b');
  assert.deepEqual(executer('donnees-personnelles', ctx, 'audit').ecarts.map((e) => e.fichier).sort(), ['a.md', 'carnet-prive.txt']);
  const couche = (...x) => [{ origine: 'type', config: { donnees_personnelles: { exceptions: x } } }];
  assert.deepEqual(executer('donnees-personnelles', { ...ctx, couches: couche({ fichier: 'a.md', pourquoi: 'titulaire du droit d’auteur' }) }, 'audit').ecarts.map((e) => e.fichier), ['carnet-prive.txt'], 'un fichier soustrait, avec sa raison');
  // Une seule lecture des exceptions (décision exceptions-hors-du-depot) : sans raison, une exception ne vaut pas, ni pour
  // un fichier, ni pour un terme (Alice Exemple reste dans la liste privée ci-dessus).
  assert.deepEqual(executer('donnees-personnelles', { ...ctx, couches: couche({ fichier: 'a.md' }, { fichier: 'carnet-prive.txt', pourquoi: ' ' }) }, 'audit').ecarts.map((e) => e.fichier).sort(), ['a.md', 'carnet-prive.txt'], 'sans raison, rien n’est soustrait');
  assert.deepEqual(exceptions([{ origine: 'contexte', provenance: 'profil:/arbre/contextes/perso.md', fichier: '/p/arbre/contextes/perso.md', config: { montage_sensible: { exceptions: [{ ecart: 'a:b', pourquoi: 'jusqu’à D' }, { ecart: 'c' }, 'd'] } } }], 'montage_sensible', 'ecart'),
    [{ valeur: 'a:b', champ: 'ecart', pourquoi: 'jusqu’à D', origine: 'contexte', provenance: 'profil:/arbre/contextes/perso.md', fichier: '/p/arbre/contextes/perso.md' }], 'chaque exception avec sa provenance');
  assert.deepEqual(fusionnerConfig({ donnees_personnelles: { termes: ['a'] }, journal: 'x' }, { donnees_personnelles: { exceptions: [{ fichier: 'L' }] }, journal: 'y' }),
    { donnees_personnelles: { termes: ['a'], exceptions: [{ fichier: 'L' }] }, journal: 'y' }, 'réglages : objets fusionnés, listes allongées, le plus spécifique l’emporte');
  assert.match(executer('donnees-personnelles', { depot: d, termes: [] }, 'audit').indisponible, /vide/);
  assert.match(executer('inconnu', ctx, 'audit').indisponible, /contrôle inconnu/);
  assert.match(executer('donnees-personnelles', { depot: path.join(d, 'absent'), termes: ['x'] }, 'audit').indisponible, /absent/);
});

test('contrôles : un projet déclaré public, par sa classification ou par ses types, sort de la liste privée', () => {
  const r = tmp(); const accueil = tmp();
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:ouvert, holarch:project:classe, holarch:project:ferme]\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'types', 'public', 'index.md'), '---\ntype: template\nid: public\ntitle: Public fictif\nstatus: draft\nconfig:\n  creation: { visibilite: public }\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  const racine = (nom, entete) => { fs.mkdirSync(path.join(r, nom)); depotGit(path.join(r, nom)); ecrire(path.join(r, nom, 'arbre', 'index.md'), `---\ntype: guideline\nid: ${nom}\ntitle: ${nom}\nstatus: draft\n${entete}---\n`); return path.join(r, nom); };
  const depots = [racine('ouvert', 'types: [public]\n'), racine('classe', 'classification: public\n'), racine('ferme', '')];
  const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil'), ...depots], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  const projets = depots.map((x) => ({ id: `holarch:project:${path.basename(x)}`, kind: 'project', name: path.basename(x), status: 'active', location: x, provenance: { source: 't' } }));
  s.catalogue.remplacer([...fiches, ...projets]); s.indexer();
  const termes = s.contexteControle(projets[2], regleEffective([...s.fiches({ kind: 'node' }), ...s.fiches({ kind: 'rule' })], projets[2].id, { profil: s.profil() })).termes;
  const autre = s.contexteControle(projets[0], regleEffective([...s.fiches({ kind: 'node' }), ...s.fiches({ kind: 'rule' })], projets[0].id, { profil: s.profil() })).termes;
  assert.ok(!termes.includes('ouvert') && !termes.includes('classe'), termes.join(' | '));
  assert.ok(autre.includes('ferme'), 'un projet sans rien qui le dise public reste privé');
});

test('contrôles : secrets par gitleaks (avant commit, audit du contenu suivi), absent ou en panne : non disponible', () => {
  const { d, g } = depotGit();
  ecrire(path.join(d, 'conf.txt'), 'a\nb\nc\n'); g('add', '.'); g('commit', '-qm', 'x');
  // Un gitleaks fictif : il signale conf.txt, ligne 3, sous le chemin qu'on lui donne.
  const faux = path.join(tmp(), 'gitleaks');
  ecrire(faux, '#!/bin/sh\nif [ "$1" = dir ]; then f="$2/conf.txt"; else f=conf.txt; fi\nprintf \'[{"RuleID":"cle-fictive","File":"%s","StartLine":3}]\' "$f"\nexit 1\n'); fs.chmodSync(faux, 0o755);
  assert.deepEqual(executer('secrets', { depot: d, gitleaks: faux }, 'avant-commit').ecarts.map((e) => [e.fichier, e.ligne, e.message]), [['conf.txt', 3, 'secret possible (cle-fictive)']]);
  assert.deepEqual(executer('secrets', { depot: d, gitleaks: faux }, 'audit').ecarts.map((e) => e.fichier), ['conf.txt'], 'chemin relatif au dépôt');
  assert.match(executer('secrets', { depot: d, gitleaks: null }, 'audit').indisponible, /gitleaks absent/);
  const panne = path.join(tmp(), 'gitleaks'); ecrire(panne, '#!/bin/sh\necho panne >&2\nexit 2\n'); fs.chmodSync(panne, 0o755);
  assert.match(executer('secrets', { depot: d, gitleaks: panne }, 'audit').indisponible, /gitleaks en échec : panne/);
});

test('contrôles : journal tenu, un jour de commits sur l’arbre sans entrée datée', () => {
  const { d, g } = depotGit();
  const [j1, j2, j3] = [jourIl(4), jourIl(3), jourIl(2)];
  const commit = (jour, f, t = jour) => {
    ecrire(path.join(d, f), t); g('add', '.');
    const r = spawnSync('git', ['-C', d, 'commit', '-qm', `${jour} ${f}`], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: `${jour}T12:00:00`, GIT_COMMITTER_DATE: `${jour}T12:00:00` } });
    assert.equal(r.status, 0, r.stderr);
  };
  commit(j1, 'arbre/a.md'); commit(j1, 'arbre/log.md', `# Journal\n\n## ${j1}\n\n* fait\n`);
  commit(j2, 'arbre/b.md'); commit(j3, 'src/x.js'); commit(j3, 'arbre/log.md', `# Journal\n\n## ${j1}\n`);
  const r = executer('journal-tenu', { depot: d, arbre: path.join(d, 'arbre'), config: { journal: 'arbre/log.md' } }, 'audit');
  assert.deepEqual(r.ecarts.map((e) => [e.cle, e.n]), [[`jour:${j2}`, 1]], 'le journal lui-même et ce qui sort de l’arbre ne comptent pas');
  assert.match(executer('journal-tenu', { depot: d, config: {} }, 'audit').indisponible, /réglage journal absent/);
  assert.equal(executer('journal-tenu', { depot: d, config: {} }, 'avant-commit').hors_moment, true);
});

test('garde : crochet de git marqué (posé, inchangé, retiré ; un crochet étranger jamais touché) et lectures refusées du compte', () => {
  const { d } = depotGit();
  const crochet = path.join(d, '.git', 'hooks', 'pre-commit');
  const texte = crochetDe({ node: '/inexistant/node', holarch: '/inexistant/holarch.js', accueil: '/inexistant' });
  assert.equal(poserCrochet(d, texte, { ecrire: false }).etat, 'pose'); assert.ok(!fs.existsSync(crochet), 'rien n’est écrit à blanc');
  assert.equal(poserCrochet(d, texte).etat, 'pose'); assert.equal(poserCrochet(d, texte).etat, 'inchange');
  const r = spawnSync(crochet, { encoding: 'utf8' });
  assert.deepEqual([r.status, /injoignable/.test(r.stderr)], [0, true], 'HOLARCH injoignable : le commit passe, et c’est dit');
  assert.equal(poserCrochet(d, null).etat, 'retire');
  ecrire(crochet, '#!/bin/sh\nexit 0\n');
  assert.deepEqual([poserCrochet(d, texte).etat, poserCrochet(d, null).etat, fs.readFileSync(crochet, 'utf8')], ['ignore', 'ignore', '#!/bin/sh\nexit 0\n']);
  assert.equal(poserCrochet(tmp(), texte).etat, 'hors-git');
  // Un core.hooksPath qui vise un chemin inaccessible (montage d'un conteneur) : dit, sans interrompre la commande.
  const { d: d2, g: g2 } = depotGit(); const bloque = path.join(tmp(), 'ro'); fs.mkdirSync(bloque, { mode: 0o500 });
  g2('config', 'core.hooksPath', path.join(bloque, 'hooks'));
  const e = poserCrochet(d2, texte); if (process.getuid?.() !== 0) assert.deepEqual([e.etat, typeof e.raison], ['erreur', 'string']);

  const home = tmp(); const lu = () => JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  ecrire(path.join(home, 'settings.json'), JSON.stringify({ model: 'x', permissions: { deny: ['Bash(rm -rf / *)', 'Read(//**/.env)'] } }));
  const p1 = appliquerPermissions(home, ['Read(//**/.env)', 'Read(~/.ssh/**)']);
  assert.deepEqual([p1.ajoutees, p1.inchangees], [['Read(~/.ssh/**)'], ['Read(//**/.env)']]);
  assert.deepEqual([lu().model, lu().permissions.deny], ['x', ['Bash(rm -rf / *)', 'Read(//**/.env)', 'Read(~/.ssh/**)']]);
  assert.deepEqual(appliquerPermissions(home, []).retirees, ['Read(~/.ssh/**)'], 'seule l’entrée posée par HOLARCH se retire');
  assert.deepEqual(lu().permissions.deny, ['Bash(rm -rf / *)', 'Read(//**/.env)']);
  assert.deepEqual(lecturesRefusees({ niveau: 'blocking', match: { action: 'read', paths: ['//**/.env'] } }), ['Read(//**/.env)']);
  assert.deepEqual(lecturesRefusees({ niveau: 'reminder', match: { action: 'read', paths: ['//**/.env'] } }), []);
});

test('garde : une exception ajoutée à l’arbre vaut au commit suivant, sans attendre l’inventaire ni écrire le catalogue', () => {
  const r = tmp(); const accueil = tmp();
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nconfig:\n  donnees_personnelles:\n    termes: [Projet Zeta]\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  const racine = (config = '') => ecrire(path.join(d, 'arbre', 'index.md'), `---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\nclassification: public\n${config}---\n`);
  racine();
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: rien-de-personnel\n  statement: Aucune donnée personnelle dans un fichier suivi.\n  level: blocking\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(d, 'note.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'départ');
  const projetDe = (x) => ({ id: `holarch:project:${path.basename(x)}` });
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {}, inventaire: { arbre: { actif: true, depots: [path.join(r, 'profil')] } } });
  // Comme l'inventaire : le catalogue porte l'empreinte des arbres lus, un arbre changé ensuite se relit (point 9).
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }],
    { empreinteArbre: empreinteArbres([path.join(r, 'profil'), d]) });
  s.indexer();
  ecrire(path.join(d, 'note.md'), 'note du projet zeta\n'); g('add', '.');
  assert.deepEqual(s.garde({ depot: d }).refus.map((x) => x.regle), ['rien-de-personnel']);
  // Écrite dans le dépôt contrôlé, l'exception ne vaut pas (décision profil-designe) : le refus tient.
  racine('config:\n  donnees_personnelles:\n    exceptions: [{ fichier: note.md, pourquoi: essai }]\n');
  assert.deepEqual(s.garde({ depot: d }).refus.map((x) => x.regle), ['rien-de-personnel'], 'l’exception du dépôt ne fait rien taire');
  // L'auteur l'ajoute au contexte, comme le refus le lui indique, puis relance le commit (défaut A4).
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\nconfig:\n  donnees_personnelles:\n    exceptions: [{ fichier: note.md, pourquoi: essai }]\n---\n');
  const catalogue = fs.readFileSync(path.join(accueil, 'catalogue', 'local.json'), 'utf8');
  assert.deepEqual(s.garde({ depot: d }).refus, [], 'l’exception vaut tout de suite');
  assert.equal(fs.readFileSync(path.join(accueil, 'catalogue', 'local.json'), 'utf8'), catalogue, 'rien n’est écrit depuis le crochet');
});

test('audit : un commit fautif est refusé par le crochet ; forcé, il apparaît au journal, puis s’y résout', () => {
  const r = tmp(); const accueil = tmp();
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\nconfig:\n  donnees_personnelles:\n    termes: [Projet Zeta]\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\nclassification: public\n---\n');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: rien-de-personnel\n  statement: Aucune donnée personnelle dans un fichier suivi.\n  level: blocking\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(d, 'note.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'départ');
  const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil'), d], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
  ecrire(path.join(accueil, 'config.yaml'), `site: local\nprofil: ${JSON.stringify(path.join(r, 'profil'))}\ninventaire: { claude-code: { actif: false }, depots-git: { actif: false }, arbre: { actif: false }, docker: { actif: false }, claude-desktop: { actif: false } }\n`);
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();

  const a0 = s.audit({ journaliser: true });
  assert.deepEqual(a0.cibles.find((c) => c.projet === 'holarch:project:depot').ecarts.map((e) => [e.controle, e.message]), [['crochet-pose', 'crochet de git absent']]);
  assert.equal(poserCrochet(d, crochetDe({ holarch: path.resolve('bin/holarch.js'), accueil })).etat, 'pose');

  ecrire(path.join(d, 'note.md'), 'note du projet zeta\n'); g('add', '.');
  const refus = spawnSync('git', ['-C', d, 'commit', '-qm', 'fautif'], { encoding: 'utf8' });
  assert.equal(refus.status, 1, refus.stderr);
  assert.match(refus.stderr, /commit refusé par la règle rien-de-personnel/); assert.match(refus.stderr, /note\.md:1/);
  assert.ok(!/zeta/i.test(refus.stderr), 'le refus ne répète pas le terme');
  // Le refus est un échec au journal : la règle et le contrôle, comptés, jamais le terme (décision echecs-au-journal).
  const garde = [...s.journal.lire()].filter((e) => e.kind === 'rule.enforced');
  assert.deepEqual(garde.map((e) => [e.subject, e.data.controle, e.data.n, e.data.moment, e.actor]), [['holarch:project:depot', 'donnees-personnelles', 1, 'avant-commit', 'system:garde']]);
  s.indexer();
  assert.deepEqual(s.echecs().par_motif, [{ cle: 'garde', n: 1 }]);
  assert.equal(s.projets().projets.find((p) => p.id === 'holarch:project:depot').echecs_7.garde, 1);
  g('commit', '-qm', 'forcé', '--no-verify');

  const a1 = s.audit({ journaliser: true });
  assert.deepEqual([a1.journal.apparus, a1.journal.resolus], [1, 1], 'l’écart du commit forcé apparaît, celui du crochet se résout');
  assert.deepEqual(s.regles({ projet: 'holarch:project:depot' }).ecarts.map((e) => [e.controle, e.fichier, e.ligne]), [['donnees-personnelles', 'note.md', 1]]);
  assert.equal(s.projets().projets.find((p) => p.id === 'holarch:project:depot').ecarts, 1);

  ecrire(path.join(d, 'note.md'), 'propre\n'); g('add', '.'); g('commit', '-qm', 'corrigé');
  assert.deepEqual([s.audit({ journaliser: true }).journal.resolus, s.ecartsOuverts().length], [1, 0]);
  const evs = [...s.journal.lire()].filter((e) => ['rule.violated', 'rule.resolved'].includes(e.kind));
  assert.deepEqual(evs.map((e) => e.kind), ['rule.violated', 'rule.violated', 'rule.resolved', 'rule.resolved']);
  assert.ok(evs.every((e) => e.actor === 'system:audit') && !/zeta/i.test(JSON.stringify([...s.journal.lire()])), 'au journal, jamais le terme');
});

test('interface en service : unité marquée qui relit la même configuration, activée puis retirée ; une unité étrangère jamais touchée', () => {
  const unites = tmp(); const appels = [];
  const systemctl = (args) => { appels.push(args.join(' ')); return { status: 0, stdout: args[0] === 'is-active' ? 'active\n' : '', stderr: '' }; };
  const i = creerInterface({ holarch: '/opt/holarch/bin/holarch.js', accueil: '/srv/donnees holarch' }, { unites, systemctl, node: '/opt/node/bin/node' });
  assert.deepEqual(i.etat(), { unite: 'holarch-interface.service', presente: false, geree: false, actif: false });
  i.activer();
  const texte = fs.readFileSync(path.join(unites, 'holarch-interface.service'), 'utf8');
  assert.match(texte, /^# Écrit par HOLARCH/); assert.match(texte, /Environment="HOLARCH_HOME=\/srv\/donnees holarch"/);
  assert.match(texte, /Environment="PATH=\/opt\/node\/bin:[^"]*\/\.local\/bin:/, 'les outils du poste, comme dans un terminal');
  assert.match(texte, /ExecStart="\/opt\/node\/bin\/node" --no-warnings "\/opt\/holarch\/bin\/holarch.js" voir/);
  assert.match(texte, /^StandardOutput=null$/m); assert.match(texte, /^StandardError=journal$/m);
  assert.deepEqual(appels, ['daemon-reload', 'enable --now holarch-interface.service']);
  assert.equal(i.etat().actif, true);
  i.desactiver(); assert.ok(!fs.existsSync(path.join(unites, 'holarch-interface.service')));
  fs.writeFileSync(path.join(unites, 'holarch-interface.service'), '[Service]\n');
  assert.throws(() => i.activer(), /pas été écrit par HOLARCH/); assert.throws(() => i.desactiver(), /pas été écrit par HOLARCH/);
});

test('routines : une unité coupée à la main reste coupée quand la copie est posée, texte réécrit ; la première pose l’active (décision routines-posees)', () => {
  const unites = tmp(); const appels = []; const coupees = new Set();
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'disable') coupees.add(args.at(-1)); if (args[0] === 'enable') coupees.delete(args.at(-1));
    return { status: 0, stdout: args[0] === 'is-enabled' ? (coupees.has(args[1]) ? 'disabled\n' : 'enabled\n') : args[0] === 'is-active' ? 'active\n' : '', stderr: '' };
  };
  const o = { unites, systemctl, node: '/opt/node/bin/node' };
  const recolte = (holarch) => creerRecolte({ holarch, accueil: '/a' }, o); const interface_ = (holarch) => creerInterface({ holarch, accueil: '/a' }, o);
  assert.equal(recolte('/v1/holarch.js').poser().etat, 'posé'); interface_('/v1/holarch.js').activer();
  assert.ok(appels.includes('enable --now holarch-recolte.timer'), 'la première pose active');
  systemctl(['disable', '--now', 'holarch-recolte.timer']); systemctl(['disable', '--now', 'holarch-interface.service']); appels.length = 0;
  assert.equal(recolte('/v2/holarch.js').poser().etat, 'coupé à la main : laissé');
  assert.equal(interface_('/v2/holarch.js').relancer().etat, 'coupée à la main : laissée');
  assert.deepEqual(appels.filter((a) => /^(enable|restart|start)/.test(a)), [], 'rien n’est rallumé');
  assert.ok(fs.readFileSync(path.join(unites, 'holarch-recolte.service'), 'utf8').includes('"/v2/holarch.js" recolte'), 'le texte suit la copie posée');
  assert.ok(fs.readFileSync(path.join(unites, 'holarch-interface.service'), 'utf8').includes('"/v2/holarch.js" voir'));
  const routines = creerService({ accueil: tmp() }, { unites, systemctl }).etat().routines;
  assert.deepEqual(routines.map((r) => [r.unite, r.etat]), [['holarch-interface.service', 'coupée'], ['holarch-import.timer', 'absente'], ['holarch-recolte.timer', 'coupée'], ['holarch-reveil.timer', 'absente'], ['holarch-veille.service', 'absente']]);
});

// ---- Tranche 5 : veille de sécurité et de versions (décision veille-securite-versions). Données fictives.
import { versionPubliee } from '../src/controles.js';

test('contrôles : dépendances vulnérables au-dessus du seuil, gardées une journée, réinterrogées si le verrou change', () => {
  const { d, g } = depotGit();
  ecrire(path.join(d, 'package-lock.json'), '{"v":1}\n'); ecrire(path.join(d, 'web', 'uv.lock'), 'v1\n'); g('add', '.'); g('commit', '-qm', 'x');
  const appels = path.join(tmp(), 'appels');
  const sortie = JSON.stringify({ results: [{ source: { path: path.join(d, 'package-lock.json') }, packages: [
    { package: { name: 'paquet-a', version: '1.0.0' }, groups: [{ ids: ['GHSA-aaaa'], max_severity: '8.7' }, { ids: ['GHSA-bbbb'], max_severity: '9.8' }], vulnerabilities: [] },
    { package: { name: 'paquet-b', version: '2.0.0' }, groups: [{ ids: ['GHSA-cccc'], max_severity: '5.3' }], vulnerabilities: [] },
    { package: { name: 'paquet-c', version: '3.0.0' }, groups: [{ ids: ['GHSA-dddd'], max_severity: '' }], vulnerabilities: [{ id: 'GHSA-dddd', database_specific: { severity: 'HIGH' } }] }] }] });
  const faux = path.join(tmp(), 'osv-scanner'); ecrire(path.join(path.dirname(faux), 'sortie.json'), sortie);
  ecrire(faux, `#!/bin/sh\necho "$@" >> '${appels}'\ncat '${path.join(path.dirname(faux), 'sortie.json')}'\nexit 1\n`); fs.chmodSync(faux, 0o755);
  const ctx = { depot: d, osv: faux, cache: tmp(), config: {} };
  const r = executer('dependances-vulnerables', ctx, 'audit');
  assert.deepEqual(r.ecarts.map((e) => [e.fichier, e.cle, e.n]), [['package-lock.json', 'package-lock.json:paquet-a@1.0.0', 2], ['package-lock.json', 'package-lock.json:paquet-c@3.0.0', 1]], 'seuil 7 ; à défaut de score, la gravité déclarée');
  assert.match(r.ecarts[0].message, /pire 9\.8, GHSA-bbbb/);
  assert.match(fs.readFileSync(appels, 'utf8'), /-L package-lock\.json -L web\/uv\.lock --format json/);
  executer('dependances-vulnerables', ctx, 'audit');
  assert.equal(fs.readFileSync(appels, 'utf8').trim().split('\n').length, 1, 'une seconde fois dans la journée : rien n’est réinterrogé');
  ecrire(path.join(d, 'package-lock.json'), '{"v":2}\n');
  executer('dependances-vulnerables', ctx, 'audit');
  assert.equal(fs.readFileSync(appels, 'utf8').trim().split('\n').length, 2, 'un verrou changé : réinterrogé');
  assert.deepEqual(executer('dependances-vulnerables', { ...ctx, cache: null, config: { dependances: { seuil_cvss: 5 } } }, 'audit').ecarts.length, 3);
  const panne = path.join(tmp(), 'osv-scanner'); ecrire(panne, '#!/bin/sh\necho "base injoignable" >&2\nexit 127\n'); fs.chmodSync(panne, 0o755);
  assert.match(executer('dependances-vulnerables', { ...ctx, osv: panne, cache: null }, 'audit').indisponible, /osv-scanner en échec : base injoignable/);
  const vide = path.join(tmp(), 'osv-scanner'); ecrire(vide, '#!/bin/sh\nexit 128\n'); fs.chmodSync(vide, 0o755);
  assert.deepEqual(executer('dependances-vulnerables', { ...ctx, osv: vide, cache: null }, 'audit').ecarts, []);
  assert.match(executer('dependances-vulnerables', { ...ctx, osv: null }, 'audit').indisponible, /osv-scanner absent/);
  const sans = depotGit(); ecrire(path.join(sans.d, 'a.md'), 'x'); sans.g('add', '.'); sans.g('commit', '-qm', 'x');
  assert.deepEqual(executer('dependances-vulnerables', { ...ctx, depot: sans.d }, 'audit').ecarts, [], 'sans verrou, rien à scanner');
});

test('contrôles : outils à jour (installé contre publié), introuvable signalé, sources de version', () => {
  const config = { outils_surveilles: [
    { nom: 'outil-a', commande: ['sh', '-c', 'echo outil-a version 1.2.3'], github: 'exemple/outil-a' },
    { nom: 'outil-b', commande: ['sh', '-c', 'echo v2.0.0'], github: 'exemple/outil-b' },
    { nom: 'outil-c', commande: ['/inexistant/outil-c', '--version'], node: 'lts' }] };
  const r = executer('outils-a-jour', { config, publiees: { 'outil-a': 'v1.3.0', 'outil-b': '2.0.0', 'outil-c': 'v24.1.0' } }, 'audit');
  const sansPath = spawnSync(process.execPath, ['--input-type=module', '-e', `import { executer } from '${path.resolve('src/controles.js')}'; console.log(JSON.stringify(executer('outils-a-jour', { config: { outils_surveilles: [{ nom: 'sh', commande: ['sh', '-c', 'echo 1.0.0'], github: 'x/y' }] }, publiees: { sh: '1.0.0' } }, 'audit')))`], { encoding: 'utf8', env: { ...process.env, PATH: '/usr/bin:/bin' } });
  assert.deepEqual(JSON.parse(sansPath.stdout).ecarts, [], 'un PATH réduit trouve encore un outil du système');
  assert.deepEqual(r.ecarts.map((e) => [e.cle, e.message]), [['outil-a', 'outil-a 1.2.3 installé, 1.3.0 publié'], ['outil-c', 'outil-c introuvable sur ce site']]);
  assert.match(executer('outils-a-jour', { config: {} }, 'audit').indisponible, /outils_surveilles absent/);
  const piege = path.join(tmp(), 'piege');
  assert.equal(executer('outils-a-jour', { config: { outils_surveilles: [{ nom: 'x', commande: [`sh; touch ${piege}`], github: 'x/y' }] }, publiees: { x: '1.0.0' } }, 'audit').ecarts[0].message, 'x introuvable sur ce site');
  assert.ok(!fs.existsSync(piege), 'un nom d’outil ne passe jamais par un shell');
  assert.match(executer('outils-a-jour', { config, publiees: { 'outil-a': 'pas une version' } }, 'audit').indisponible, /illisible pour outil-a/);
  const lu = []; const lire = (u) => { lu.push(u); return u.includes('github') ? { tag_name: 'v8.30.1' } : u.includes('npmjs') ? { name: '@exemple/outil', version: '0.89.0' } : [{ version: 'v25.0.0', lts: false }, { version: 'v24.11.0', lts: 'Krypton' }]; };
  assert.deepEqual([versionPubliee({ github: 'exemple/outil' }, lire), versionPubliee({ node: 'lts' }, lire), versionPubliee({ npm: '@exemple/outil' }, lire)], ['v8.30.1', 'v24.11.0', '0.89.0']);
  assert.deepEqual(lu, ['https://api.github.com/repos/exemple/outil/releases/latest', 'https://nodejs.org/dist/index.json', 'https://registry.npmjs.org/@exemple/outil/latest']);
  assert.equal(versionPubliee({ npm: 'outil' }, (u) => ({ version: u }), { url_npm: 'http://miroir' }), 'http://miroir/outil/latest', 'registre réglé par le site');
  assert.throws(() => versionPubliee({ nom: 'sans-source' }, lire), /source de version inconnue pour sans-source/);
});

test('audit : un contrôle de portée site s’exécute au compte, jamais dans chaque projet', () => {
  const r = tmp(); const accueil = tmp();
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: outils-a-jour\n  statement: Les outils du poste restent à jour.\n  level: verified\n  check: [outils-a-jour]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  fs.mkdirSync(path.join(r, 'depot')); depotGit(path.join(r, 'depot'));
  const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil')], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: path.join(r, 'depot'), provenance: { source: 't' } }]);
  s.indexer();
  const a = s.audit();
  const compte = a.cibles.find((c) => c.projet === null); const projet = a.cibles.find((c) => c.projet === 'holarch:project:depot');
  assert.deepEqual(compte.controles.map((c) => [c.id, c.etat]), [['outils-a-jour', 'indisponible']], 'sans liste d’outils : non disponible, jamais conforme');
  assert.deepEqual(projet.controles, [], 'le projet ne le refait pas');
});

// Faille sans gravité (revue des limites, 2026-10-14) : sans score ni gravité déclarée, une faille valait -1 et sortait du
// filtre sans que rien ne le dise. L'audit en dit le compte, sans écart : un écart changerait la décision
// veille-securite-versions, qui la laisse hors du seuil.
test('audit : une faille sans score ni gravité déclarée se compte, sans écart', async () => {
  const affichage = await import('../bin/affichage.js');
  const r = tmp(); const accueil = tmp();
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\n---\n');
  ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: dependances-saines\n  statement: Pas de faille connue dans les dépendances.\n  level: verified\n  check: [dependances-vulnerables]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
  fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'package-lock.json'), '{"v":1}\n'); g('add', '.'); g('commit', '-qm', 'x');
  const sortie = JSON.stringify({ results: [{ source: { path: path.join(d, 'package-lock.json') }, packages: [
    { package: { name: 'sans-gravite', version: '1.0.0' }, groups: [{ ids: ['GHSA-xxxx'], max_severity: '' }], vulnerabilities: [{ id: 'GHSA-xxxx' }] },
    { package: { name: 'grave', version: '2.0.0' }, groups: [{ ids: ['GHSA-yyyy'], max_severity: '9.8' }], vulnerabilities: [] }] }] });
  const faux = path.join(tmp(), 'osv-scanner'); ecrire(`${faux}.json`, sortie);
  ecrire(faux, `#!/bin/sh\ncat '${faux}.json'\nexit 1\n`); fs.chmodSync(faux, 0o755);
  const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil')], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {}, controles: { osv_scanner: faux } });
  s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const a = s.audit({ journaliser: true }); const projet = a.cibles.find((c) => c.projet === 'holarch:project:depot');
  assert.deepEqual(projet.ecarts.map((e) => e.cle), ['package-lock.json:grave@2.0.0'], 'la faille sans gravité ne fait pas d’écart');
  assert.deepEqual(projet.controles, [{ id: 'dependances-vulnerables', etat: 'fait', sans_gravite: 1 }]);
  assert.match(affichage.audit(a), /contrôles : dependances-vulnerables \(1 faille\(s\) sans score ni gravité déclarée, hors seuil\)/);
});

// ---- Habitudes : un commit resté local au-delà du délai est un écart.
test('contrôles : commits non poussés au-delà du délai, branche sans amont non disponible', () => {
  const { d, g } = depotGit(); const nu = tmp();
  spawnSync('git', ['init', '-q', '--bare', nu]);
  const commit = (f, heures = 0) => { ecrire(path.join(d, f), f); g('add', '.'); const date = new Date(Date.now() - heures * 36e5).toISOString();
    const r = spawnSync('git', ['-C', d, 'commit', '-qm', f], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }); assert.equal(r.status, 0, r.stderr); };
  commit('a.md');
  assert.deepEqual(executer('commits-pousses', { depot: d }, 'audit'), { indisponible: 'branche sans amont' });
  g('remote', 'add', 'origin', nu); g('push', '-q', '-u', 'origin', 'HEAD');
  assert.deepEqual(executer('commits-pousses', { depot: d }, 'audit').ecarts, [], 'à jour');
  commit('b.md', 5); commit('c.md');
  const e = executer('commits-pousses', { depot: d }, 'audit').ecarts;
  assert.deepEqual(e.map((x) => [x.cle, x.n]), [['amont', 2]]); assert.match(e[0].message, /^2 commit\(s\) non poussé\(s\) vers origin\/\S+ depuis plus de 4 h$/);
  assert.deepEqual(executer('commits-pousses', { depot: d, reglages: { non_pousses_heures: 6 } }, 'audit').ecarts, [], 'délai réglable');
  g('push', '-q');
  assert.deepEqual(executer('commits-pousses', { depot: d }, 'audit').ecarts, [], 'poussé : résolu');
});

// ---- Tranche 6 : consolidation (réglages et briques communes).
import { porteMarque, trouverOutil, shell } from '../src/commun.js';

test('consolidation : les réglages de l’audit agissent, et les briques communes tiennent leurs promesses', () => {
  const { d, g } = depotGit();
  const commit = (jour, f) => { ecrire(path.join(d, f), jour); g('add', '.'); const r = spawnSync('git', ['-C', d, 'commit', '-qm', f], { encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: `${jour}T12:00:00`, GIT_COMMITTER_DATE: `${jour}T12:00:00` } }); assert.equal(r.status, 0, r.stderr); };
  commit(jourIl(5), 'arbre/a.md'); commit(jourIl(1), 'arbre/b.md'); ecrire(path.join(d, 'arbre', 'log.md'), '# Journal\n'); g('add', '.'); g('commit', '-qm', 'log');
  const ctx = { depot: d, arbre: path.join(d, 'arbre'), config: { journal: 'arbre/log.md' } };
  assert.equal(executer('journal-tenu', ctx, 'audit').ecarts.length, 2);
  assert.equal(executer('journal-tenu', { ...ctx, reglages: { journal_jours: 3 } }, 'audit').ecarts.length, 1, 'fenêtre réglable');
  ecrire(path.join(d, 'gros.txt'), 'x'.repeat(2048) + '\nProjet Zeta\n'); g('add', '.'); g('commit', '-qm', 'gros');
  assert.equal(executer('donnees-personnelles', { depot: d, termes: ['Projet Zeta'] }, 'audit').ecarts.length, 1);
  assert.equal(executer('donnees-personnelles', { depot: d, termes: ['Projet Zeta'], reglages: { taille_max_mo: 0.001 } }, 'audit').ecarts.length, 0, 'taille maximale réglable');
  // Briques communes.
  assert.ok(porteMarque('---\npaths: [x]\n---\n# MARQUE ici\n', '# MARQUE') && !porteMarque('texte\n# MARQUE plus loin'.padStart(2000, '\n'), '# MARQUE'));
  // Un fichier de règle limité à beaucoup de chemins garde sa marque reconnue (en-tête long).
  const regle = { id: 'large', fiche: 'f', enonce: 'Une règle.', niveau: 'guided', statut: 'stable', applicable: true, origine: 'projet', applique_a: { paths: Array.from({ length: 15 }, (_, i) => `d${i}/**`) }, provenance: { arbre: 'a', noeud: '/' }, recouvre: [] };
  const depot = tmp(); const dossier = path.join(depot, 'regles'); const plan = planifier([regle], { portee: 'projet', classificationDepot: 'internal' });
  appliquer(depot, dossier, plan);
  assert.deepEqual(appliquer(depot, dossier, planifier([{ ...regle, enonce: 'Une règle modifiée.' }], { portee: 'projet', classificationDepot: 'internal' })).modifies, ['large.md']);
  assert.equal(trouverOutil('sh'), trouverOutil('sh') && path.isAbsolute(trouverOutil('sh')) ? trouverOutil('sh') : null, 'chemin absolu seulement');
  assert.equal(trouverOutil('a b'), null); assert.equal(trouverOutil('../sh'), null); assert.ok(trouverOutil('sh'));
  assert.equal(shell("l'outil"), `'l'\\''outil'`);
});

// ---- Tranche 7 : économie du contexte (décision passation-sereine). Données fictives.
import { tailleContexte, alerte, resume, sessionsCoupees } from '../src/contexte.js';
import { reglagesVoulus, appliquerReglages } from '../src/regles-claude-code.js';

test('contexte : taille lue à la fin de la transcription, avis au-delà du seuil seulement', () => {
  const t = path.join(tmp(), 'session.jsonl');
  const reponse = (cr) => JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, cache_read_input_tokens: cr, cache_creation_input_tokens: 1000, output_tokens: 50 } } });
  ecrire(t, ['{"tronqu', reponse(90000), JSON.stringify({ type: 'user', message: { content: 'suite' } }), reponse(199000), JSON.stringify({ type: 'user', message: { content: 'encore' } })].join('\n') + '\n');
  // Sa sortie comprise (revue des limites, 2026-10-14) : elle entre au contexte du tour suivant, que l'avis précède.
  assert.equal(tailleContexte(t), 200052);
  assert.equal(alerte({ transcription: t, seuil: 250000 }), null, 'sous le seuil : rien');
  const a = alerte({ transcription: t, seuil: 150000 });
  assert.match(a.agent, /200 k tokens.*passation.*\/clear/); assert.match(a.auteur, /passation puis \/clear/);
  // La leçon de clôture n'est demandée que si sa règle s'applique ; une règle illisible ne retient pas l'avis.
  assert.doesNotMatch(a.agent, /lecon-de-cloture/);
  const avec = (l) => alerte({ transcription: t, seuil: 150000, regles: () => l }).agent;
  assert.match(avec([{ id: 'lecon-de-cloture', applicable: true }]), /applique la règle `lecon-de-cloture`, puis propose/);
  assert.doesNotMatch(avec([{ id: 'lecon-de-cloture', applicable: false }]), /lecon-de-cloture/, 'proposée ou dérogée : rien');
  assert.match(alerte({ transcription: t, seuil: 150000, regles: () => { throw new Error('x'); } }).agent, /passation/);
  assert.equal(tailleContexte(path.join(tmp(), 'absente.jsonl')), null);
  const r = spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), 'contexte', 'alerte', '--seuil', '150000'], { encoding: 'utf8', input: JSON.stringify({ transcript_path: t }), env: { ...process.env, HOLARCH_HOME: tmp() } });
  assert.equal(r.status, 0); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const vide = spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), 'contexte', 'alerte', '--seuil', '150000'], { encoding: 'utf8', input: 'pas du json', env: { ...process.env, HOLARCH_HOME: tmp() } });
  assert.deepEqual([vide.status, vide.stdout], [0, ''], 'une entrée illisible ne bloque jamais un message');
});

test('réglages Claude Code : posés depuis le profil, valeur posée à la main laissée, retrait de ce que HOLARCH a posé', () => {
  const home = tmp(); const lu = () => JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  ecrire(path.join(home, 'settings.json'), JSON.stringify({ model: 'x', effortLevel: 'high', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a-moi' }] }] } }));
  const config = { claude_code: { reglages: { autoCompactWindow: 300000, effortLevel: 'medium' }, passation: { seuil_tokens: 150000, reprise: true } } };
  const v = reglagesVoulus(config, { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv/donnees' });
  assert.match(v.crochets[0].command, /^\{ HOLARCH_HOME='\/srv\/donnees' '\/opt\/node' --no-warnings '\/opt\/holarch\.js' contexte alerte --seuil 150000 2>\/dev\/null \|\| \{ c=\$\?; .* > '\/srv\/donnees\/passation-erreur\.json'; \}; \} 2>\/dev\/null \|\| true$/);
  assert.equal(v.crochets[1].matcher, 'startup|clear|compact');
  const r1 = appliquerReglages(home, v);
  assert.deepEqual([r1.cles.posees, r1.cles.ignorees, r1.crochets.poses.length], [['autoCompactWindow'], ['effortLevel'], 2], 'une valeur posée à la main est laissée');
  assert.deepEqual([lu().autoCompactWindow, lu().effortLevel, lu().model, lu().hooks.Stop[0].hooks[0].command], [300000, 'high', 'x', 'a-moi']);
  assert.equal(appliquerReglages(home, v).crochets.inchanges.length, 2, 'idempotent');
  // Le seuil change : l'ancien crochet part, le nouveau arrive ; plus de réglage : la clé posée par HOLARCH se retire.
  const v2 = reglagesVoulus({ claude_code: { passation: { seuil_tokens: 200000 } } }, { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv/donnees' });
  const r2 = appliquerReglages(home, v2);
  assert.deepEqual([r2.cles.retirees, r2.crochets.retires.length, r2.crochets.poses.length], [['autoCompactWindow'], 2, 1]);
  assert.deepEqual([lu().autoCompactWindow, Object.keys(lu().hooks).sort()], [undefined, ['Stop', 'UserPromptSubmit']]);
  ecrire(path.join(home, 'settings.json'), '{ cassé');
  assert.throws(() => appliquerReglages(home, v2), /illisible/, 'un settings.json illisible n’est jamais réécrit');
  assert.equal(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'), '{ cassé');
});

test('contexte : résumé de reprise du projet du dossier de travail, court ; rien hors projet', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: en-place\n  statement: Déjà approuvée.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n- id: a-approuver\n  statement: Récoltée.\n  status: draft\n- id: refusee\n  statement: Refusée.\n  status: deprecated\n');
  ecrire(path.join(d, 'arbre', 'conception', 'etape-2-demo.md'), `---\ntype: specification\ntitle: Étape 2 — démonstration\nstatus: draft\n---\n\n## Avancement\n\n- **Fait (2026-10-01)** : ${'premier lot livré. '.repeat(30)}\n- **Reste** :\n  1. Second lot.\n`);
  g('add', '.'); g('commit', '-qm', 'x');
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id: 'holarch:project:depot' }) }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const t = resume(s, path.join(d, 'arbre'));
  assert.match(t, /reprise du projet depot/); assert.match(t, /Étape 2 : Étape 2 — démonstration/); assert.match(t, /Reste : Second lot\./);
  assert.ok(t.length <= 1500);
  assert.match(t, /\nRègles à approuver : 1 \(a-approuver\), page « Règles »\.\n/, 'les brouillons seulement');
  assert.doesNotMatch(t, /Dépôt :/, 'dépôt propre : rien à dire');
  assert.match(t, /Intégration continue : aucune/);
  // L'état du dépôt se lit en direct, pas dans l'inventaire (qui peut dater de l'heure précédente).
  ecrire(path.join(d, 'brouillon.txt'), 'x');
  assert.match(resume(s, d), /Dépôt : 1 fichier\(s\) non commité\(s\), 0 commit\(s\) non poussé\(s\)\./);
  ecrire(path.join(d, '.gitlab-ci.yml'), 'test: {}\n');
  assert.match(resume(s, d), /Intégration continue : GitLab CI \(lire son résultat après un envoi\)\./);
  assert.equal(resume(s, tmp()), null);
});

// V8 (revue des limites, 2026-10-14 : 3 restes montrés sur 18, sans le dire) : le reste coupé dit combien il en montre sur
// combien ; le dernier fait est le plus récent par sa date, pas le dernier écrit (un fait ajouté en tête de l'avancement).
test('contexte : la reprise dit le reste coupé (3 sur N) et prend le dernier fait par sa date', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(path.join(d, 'arbre', 'conception', 'etape-2-demo.md'), '---\ntype: specification\ntitle: Étape 2 — démonstration\nstatus: draft\n---\n\n## Avancement\n\n'
    + '- **Fait (2026-10-05)** : le plus récent, écrit en tête.\n- **Fait (2026-10-01)** : le premier.\n- **Fait** : sans date.\n- **Fait (2026-10-03)** : écrit en dernier.\n'
    + '- **Reste** :\n  1. Un.\n  2. Deux.\n  3. Trois.\n  4. Quatre.\n  5. Cinq.\n');
  g('add', '.'); g('commit', '-qm', 'x');
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id: 'holarch:project:depot' }) }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const t = resume(s, d);
  assert.match(t, /\nDernier fait \(2026-10-05\) : le plus récent, écrit en tête\.\n/);
  assert.match(t, /\nReste \(3 sur 5\) : Un ; Deux ; Trois\.\n/);
  // La vue Projets et le MCP lisent le même dernier fait.
  assert.equal(s.projets().projets[0].etape.dernier_fait.date, '2026-10-05');
  // Un reste qui tient en entier ne se compte pas.
  ecrire(path.join(d, 'arbre', 'conception', 'etape-2-demo.md'), '---\ntype: specification\ntitle: Étape 2 — démonstration\nstatus: draft\n---\n\n## Avancement\n\n- **Fait** : sans date.\n- **Reste** :\n  1. Un.\n');
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id: 'holarch:project:depot' }) }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  assert.match(resume(s, d), /\nDernier fait : sans date\.\nReste : Un\.\n/);
});

test('contexte : une session arrêtée en route (appel d’outil sans résultat) est annoncée à la reprise', () => {
  const dossier = tmp(); const maintenant = Date.parse('2026-10-08T16:40:00Z');
  const msg = (type, content, extra = {}) => JSON.stringify({ type, timestamp: '2026-10-08T10:20:00.000Z', message: { role: type, content }, ...extra });
  const appel = (name, input) => msg('assistant', [{ type: 'tool_use', id: `t-${name}`, name, input }]);
  const session = (nom, lignes, age = 3600) => { const f = path.join(dossier, `${nom}.jsonl`); ecrire(f, lignes.join('\n') + '\n'); const t = (maintenant - age * 1000) / 1000; fs.utimesSync(f, t, t); return f; };
  session('question', [msg('user', 'Règle l’autonomie.'), appel('AskUserQuestion', { questions: [{ question: 'Comment régler l’autonomie des sessions ?' }] }), msg('assistant', [{ type: 'text', text: 'sous-agent' }], { isSidechain: true })]);
  session('outil', ['{"début coupé', appel('Bash', { command: 'npm test', description: 'Lancer les tests' })]);
  session('propre', [appel('Bash', { command: 'ls' }), msg('user', [{ type: 'tool_result', tool_use_id: 't-Bash', content: 'ok' }]), msg('assistant', [{ type: 'text', text: 'Fini.' }])]);
  session('voulue', [appel('Bash', { command: 'sleep 99' }), msg('user', [{ type: 'text', text: '[Request interrupted by user for tool use]' }])]);
  session('ancienne', [appel('Bash', { command: 'ls' })], 25 * 3600);
  const courante = session('courante', [appel('Bash', { command: 'git status' })]);
  const c = sessionsCoupees(courante, { maintenant });
  assert.deepEqual(c.map((x) => path.basename(x.fichier)).sort(), ['outil.jsonl', 'question.jsonl'], 'ni la propre, ni l’interruption voulue, ni l’ancienne, ni la courante');
  assert.equal(c.find((x) => x.question).question, 'Comment régler l’autonomie des sessions ?');
  assert.deepEqual(sessionsCoupees(null), []); assert.deepEqual(sessionsCoupees(path.join(tmp(), 'absente.jsonl')), []);

  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n'); g('add', '.'); g('commit', '-qm', 'x');
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id: 'holarch:project:depot' }) }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const t = resume(s, d, { transcription: courante, maintenant });
  const ligne = t.split('\n')[1];
  assert.match(ligne, /^Session\(s\) arrêtée\(s\) en route \(24 h\) : .*\. À signaler à l’auteur\.$/, 'juste après l’en-tête');
  assert.match(ligne, /: \d{4}-\d{2}-\d{2} \d{2}:\d{2}, /, 'l’heure locale dite comme ailleurs (AAAA-MM-JJ HH:MM)');
  assert.match(ligne, /question restée sans réponse : « Comment régler l’autonomie des sessions \? »/); assert.match(ligne, /pendant Bash \(Lancer les tests\)/);
  assert.doesNotMatch(resume(s, d), /arrêtée/, 'sans transcription : rien');
});
// R5 (famille Gardes muettes, choix de l'auteur du 2026-10-13) : une coupure passait pour annoncée dès qu'une autre session
// du dossier s'était ouverte après elle, sans preuve qu'elle l'avait reçue (crochet en échec, session ouverte hors du
// projet). La reprise qui la dit écrit une marque durable ; seule cette marque l'écarte ensuite.
test('R5 : une session coupée n’est annoncée qu’une fois, par la marque écrite à l’annonce, pas par une session ouverte après elle', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n'); g('add', '.'); g('commit', '-qm', 'x');
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id: 'holarch:project:depot' }) }), { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const dossier = tmp(); const maintenant = Date.parse('2026-10-08T18:40:00Z');
  const msg = (type, content, timestamp) => JSON.stringify({ type, timestamp, message: { role: type, content } });
  const session = (nom, lignes) => { const f = path.join(dossier, `${nom}.jsonl`); ecrire(f, lignes.join('\n') + '\n'); return f; };
  const question = (q, t) => msg('assistant', [{ type: 'tool_use', id: 't', name: 'AskUserQuestion', input: { questions: [{ question: q }] } }], t);
  const matin = session('matin', [msg('user', 'Règle l’autonomie.', '2026-10-08T10:19:00Z'), question('Autonomie ?', '2026-10-08T10:20:00Z')]);
  // Ouverte après la coupure du matin, sans l'avoir reçue (aucune reprise ne l'a dite) : elle ne l'écarte pas.
  session('apres', [msg('user', 'Reprise.', '2026-10-08T11:00:00Z'), msg('assistant', [{ type: 'text', text: 'Fait.' }], '2026-10-08T13:00:00Z')]);
  const courante = session('courante', [msg('user', 'Pose-moi tes questions.', '2026-10-08T18:30:00Z')]);
  const dites = (t = courante) => (resume(s, d, { transcription: t, maintenant }).match(/« ([^»]+) »/g) || []);
  // Marques d'avant : celle de plus de 48 h s'oublie à l'écriture suivante, la récente reste.
  const marques = path.join(accueil, 'reprise-coupures.json');
  fs.writeFileSync(marques, JSON.stringify({ '/ailleurs/ancienne.jsonl': '2026-10-06T10:00:00Z', '/ailleurs/recente.jsonl': '2026-10-08T09:00:00Z' }));
  assert.deepEqual(dites(), ['« Autonomie ? »']);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(marques, 'utf8'))), ['/ailleurs/recente.jsonl', matin]);
  assert.deepEqual(dites(), [], 'annoncée une fois : la marque l’écarte');
  assert.deepEqual(sessionsCoupees(courante, { maintenant }).map((c) => c.question), ['Autonomie ?'], 'sans marque, elle reste à dire');
  // La même session reprise puis coupée de nouveau : une coupure nouvelle, annoncée.
  fs.appendFileSync(matin, [msg('user', 'Suite.', '2026-10-08T15:00:00Z'), question('Midi ?', '2026-10-08T15:01:00Z')].join('\n') + '\n');
  assert.deepEqual(dites(), ['« Midi ? »']);
  // Trois coupures dites au plus : la quatrième, non dite, n'est pas marquée et vient à la reprise suivante.
  for (const h of [14, 15, 16, 17]) session(`q${h}`, [question(`${h} h ?`, `2026-10-08T${h}:30:00Z`)]);
  assert.deepEqual([dites(), dites()], [['« 17 h ? »', '« 16 h ? »', '« 15 h ? »'], ['« 14 h ? »']]);
  // Une marque qui ne s'écrit pas n'empêche pas la reprise : la coupure se redira.
  fs.rmSync(marques); fs.mkdirSync(marques);
  assert.deepEqual(dites(), ['« 17 h ? »', '« 16 h ? »', '« 15 h ? »']);
  // Coupées à trois, elles le disent, comme le reste : les autres viennent à la reprise suivante.
  assert.match(resume(s, d, { transcription: courante, maintenant }), /^Session\(s\) arrêtée\(s\) en route \(24 h\) \(3 sur 5, les autres à la reprise suivante\) : /m);
  // Sans accueil, aucun endroit où tenir la marque : la coupure se redit à chaque reprise.
  const sansAccueil = new Socle({ site: 'local', donnees: accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  assert.match(resume(sansAccueil, d, { transcription: courante, maintenant }), /« 17 h \? »/);
});

test('règles : une règle ajoutée après l’inventaire se voit tout de suite ; un arbre inchangé ne relance rien', async () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot')); const regles = path.join(d, 'arbre', 'rules.yaml');
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(regles, '- id: en-place\n  statement: Déjà approuvée.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  g('add', '.'); g('commit', '-qm', 'x');
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: { 'depots-git': { racines: [r], profondeur: 1 }, arbre: {} }, import: {} });
  await s.inventaire(); s.indexer();
  const proposees = () => s.regles({ projet: 'depot' }).regles.filter((e) => e.statut === 'draft').length;
  assert.equal(proposees(), 0);
  assert.equal(await s.arbreAJour(), false, 'arbre inchangé : aucun inventaire');
  // Constaté le 2026-10-08 : une règle ajoutée restait « 0 proposée » jusqu'à l'inventaire suivant (idée I28).
  fs.appendFileSync(regles, '- id: nouvelle\n  statement: Ajoutée après l’inventaire.\n');
  // Les règles se lisent dans l'arbre frais (ligne 238) : elle se voit avant l'inventaire, que la ligne de commande refait.
  assert.equal(proposees(), 1, 'lue fraîche, sans attendre l’inventaire');
  assert.equal(await s.arbreAJour(), true); s.indexer();
  assert.equal(proposees(), 1);
  // Un fichier retiré change aussi l'arbre (son chemin sort de l'empreinte).
  assert.equal(await s.arbreAJour(), false);
  fs.rmSync(regles);
  assert.equal(await s.arbreAJour(), true);
});

import { ADAPTATEURS } from '../src/inventaire/index.js';
// Revue des limites, relecture du lot 2 (point 9) : « changé » comparait la date des fichiers à celle du catalogue. L'horloge
// du poste a reculé (2,6 s toutes les 30 s) : un arbre changé juste après un inventaire passait pour à jour, et la garde
// au commit pouvait ignorer une règle bloquante neuve. L'inventaire range l'empreinte de l'arbre (chemins, dates, tailles)
// dans l'instantané ; « changé » est « empreinte différente ». Sans toucher à l'horloge : le catalogue daté 3 s plus tard.
test('règles : une règle ajoutée après un inventaire daté plus tard que ses fichiers (horloge qui recule) se voit', async () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot')); const regles = path.join(d, 'arbre', 'rules.yaml');
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(regles, '- id: en-place\n  statement: Déjà approuvée.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  g('add', '.'); g('commit', '-qm', 'x');
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: { 'depots-git': { racines: [r], profondeur: 1 }, arbre: {} }, import: {} });
  await s.inventaire(); s.indexer();
  const instantane = path.join(accueil, 'catalogue', 'local.json');
  const c = JSON.parse(fs.readFileSync(instantane, 'utf8')); c.at = new Date(Date.now() + 3000).toISOString(); fs.writeFileSync(instantane, JSON.stringify(c));
  assert.equal(await s.arbreAJour(), false, 'arbre inchangé : aucun inventaire');
  fs.appendFileSync(regles, '- id: nouvelle\n  statement: Ajoutée après l’inventaire.\n  level: blocking\n');
  assert.ok(fs.statSync(regles).mtimeMs < s.catalogue.date(), 'le fichier paraît plus ancien que le catalogue');
  assert.ok(s.arbreFrais().some((f) => f.kind === 'rule' && f.name === 'nouvelle'), 'la garde lit la règle neuve');
  assert.deepEqual(s.regles({ projet: 'depot' }).regles.map((e) => e.id).sort(), ['en-place', 'nouvelle']);
  assert.equal(await s.arbreAJour(), true, 'la ligne de commande refait l’inventaire');
  // L'arbre en erreur à l'inventaire suivant : ses fiches d'avant sont gardées, avec l'empreinte qui leur correspond.
  fs.appendFileSync(regles, '- id: autre\n  statement: Ajoutée avant un inventaire en erreur.\n');
  const lire = ADAPTATEURS.arbre; ADAPTATEURS.arbre = () => { throw new Error('panne'); };
  try { assert.match((await s.inventaire()).erreurs.join(), /arbre : panne/); } finally { ADAPTATEURS.arbre = lire; }
  assert.ok(s.arbreFrais().some((f) => f.kind === 'rule' && f.name === 'autre'), 'les fiches gardées ne passent pas pour à jour');
  // Même date, autre taille (une copie qui garde la date : `cp -p`, `rsync -t`) : changé aussi.
  const fixe = 1700000000; fs.utimesSync(regles, fixe, fixe); await s.inventaire();
  fs.appendFileSync(regles, '- id: meme-date\n  statement: Écrite sans changer la date.\n'); fs.utimesSync(regles, fixe, fixe);
  assert.ok(s.arbreFrais().some((f) => f.kind === 'rule' && f.name === 'meme-date'), 'la taille compte');
  // Un arbre retiré (sa racine) n'a plus d'empreinte : changé aussi, ses règles ne valent plus.
  fs.rmSync(path.join(d, 'arbre', 'index.md'));
  assert.ok(!s.arbreFrais().some((f) => f.kind === 'rule'), 'l’arbre retiré ne porte plus de règle');
  assert.equal(await s.arbreAJour(), true);
});

import { poserIdentite } from '../src/identite-git.js';
import { materialiserProjet } from '../src/materialisation.js';

test('identité de commit : posée en réglage local, réglage à la main laissé, commit sous une autre identité refusé, écart résolu', () => {
  // Ni l'identité globale de la machine ni une identité laissée dans l'environnement ne doivent compter : un fichier
  // global à lui, sans variables GIT_AUTHOR_* ni GIT_COMMITTER_*.
  const cles = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', ...['AUTHOR', 'COMMITTER'].flatMap((x) => [`GIT_${x}_NAME`, `GIT_${x}_EMAIL`])];
  const avant = Object.fromEntries(cles.map((k) => [k, process.env[k]])); for (const k of cles) delete process.env[k];
  const globale = path.join(tmp(), 'gitconfig'); process.env.GIT_CONFIG_GLOBAL = globale; process.env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    const voulue = { nom: 'Alice Exemple', email: 'alice@noreply.test' };
    const r = tmp(); const accueil = tmp();
    ecrire(globale, '[user]\n\tname = Alice Exemple\n\temail = alice@noreply.test\n');
    ecrire(path.join(r, 'profil', 'arbre', 'index.md'), `---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nclassification: confidential\nconfig:\n  identite: { nom: ${voulue.nom}, email: ${voulue.email} }\n---\n`);
    ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: identite-de-commit\n  statement: Chaque commit porte l’identité de son contexte.\n  level: blocking\n  check: [identite-de-commit]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
    ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\nprojects: [holarch:project:depot]\n---\n');
    fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));  // réglage local posé à la main
    ecrire(path.join(d, 'note.md'), 'un\n'); g('add', '.'); g('commit', '-qm', 'départ');
    const fiches = inventaireArbre({}, { depots: [path.join(r, 'profil')], projetDe: (x) => ({ id: `holarch:project:${path.basename(x)}` }) });
    ecrire(path.join(accueil, 'config.yaml'), `profil: ${JSON.stringify(path.join(r, 'profil'))}\n`);  // relu par le crochet
    const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
    s.catalogue.remplacer([...fiches, { id: 'holarch:project:depot', kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
    s.indexer();

    const re = s.regles({ projet: 'holarch:project:depot' });
    assert.deepEqual([re.declare, re.config.identite], [true, voulue]);
    const m = materialiserProjet(re, d, { accueil, ecrire: false });
    assert.deepEqual([m.identite.etat, m.crochet.demande?.id], ['ignore', 'identite-de-commit'], 'le réglage local posé à la main est laissé');
    const ecartsDe = (a) => a.cibles.find((c) => c.projet === 'holarch:project:depot').ecarts.map((e) => [e.controle, e.message]);
    const a0 = s.audit({ journaliser: true });
    assert.deepEqual(ecartsDe(a0), [['identite-de-commit', "identité git du dépôt : ne correspond pas à l'identité déclarée (adresse)"], ['crochet-pose', 'crochet de git absent']]);
    assert.ok(!JSON.stringify([...s.journal.lire()]).includes('exemple.test'), 'au journal, jamais l’adresse');

    materialiserProjet(re, d, { accueil, holarch: path.resolve('bin/holarch.js') });
    ecrire(path.join(d, 'note.md'), 'deux\n'); g('add', '.');
    const refus = spawnSync('git', ['-C', d, 'commit', '-qm', 'sous la main'], { encoding: 'utf8' });
    assert.equal(refus.status, 1, refus.stderr); assert.match(refus.stderr, /refusé par la règle identite-de-commit/);
    assert.ok(!/exemple\.test|noreply\.test/.test(refus.stderr), 'le refus ne répète pas les adresses');

    g('config', '--local', '--unset', 'user.name'); g('config', '--local', '--unset', 'user.email');
    g('commit', '-qm', 'sous l’identité déclarée');
    const autre = spawnSync('git', ['-C', d, 'commit', '-q', '--allow-empty', '-m', 'emprunt', '--author', 'Bob <bob@exemple.test>'], { encoding: 'utf8' });
    assert.equal(autre.status, 1, 'un auteur d’emprunt est refusé');
    const a1 = s.audit({ journaliser: true });
    assert.deepEqual([ecartsDe(a1), a1.journal.resolus], [[], 2], 'écart d’identité et crochet absent résolus');

    // Une identité globale différente : HOLARCH pose la déclarée, la met à jour, puis retire ce qu'il a posé.
    ecrire(globale, '[user]\n\tname = Autre\n\temail = autre@exemple.test\n');
    const local = () => [g('config', '--local', '--get', 'user.email').trim()];
    assert.equal(poserIdentite(d, voulue, { ecrire: false }).etat, 'pose');
    assert.deepEqual([poserIdentite(d, voulue).etat, local(), poserIdentite(d, voulue).etat], ['pose', [voulue.email], 'inchange']);
    assert.equal(poserIdentite(d, { ...voulue, email: 'alice2@noreply.test' }).etat, 'modifie');
    assert.deepEqual([poserIdentite(d, null).etat, spawnSync('git', ['-C', d, 'config', '--local', '--get', 'user.email']).status], ['retire', 1]);
    assert.equal(poserIdentite(d, null).etat, 'absent');
    assert.equal(poserIdentite(tmp(), voulue).etat, 'hors-git');
    assert.match(executer('identite-de-commit', { depot: d, config: { identite: voulue }, declare: false }, 'audit').indisponible, /aucun contexte/);
    assert.match(executer('identite-de-commit', { depot: d, config: {}, declare: true }, 'audit').indisponible, /absent/);
  } finally {
    for (const [k, v] of Object.entries(avant)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

import { creerProjet, declarer } from '../src/creation.js';
import { configAvantProjet } from '../src/regles.js';
import { genererConteneur, MARQUE as MARQUE_CONTENEUR } from '../src/conteneur.js';

// Un nom à encoder (majuscule, `_`, `.`) : le dossier de transcriptions du conteneur se nomme comme Claude Code le ferait.
const NOM = 'Neuf_2.x';
test('création de projet : étapes faites puis, rejouées, déjà là ; gestes réservés dits ; à blanc rien n’est écrit', async () => {
  const cles = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', ...['AUTHOR', 'COMMITTER'].flatMap((x) => [`GIT_${x}_NAME`, `GIT_${x}_EMAIL`])];
  const avant = Object.fromEntries(cles.map((k) => [k, process.env[k]])); for (const k of cles) delete process.env[k];
  process.env.GIT_CONFIG_GLOBAL = path.join(tmp(), 'gitconfig'); process.env.GIT_CONFIG_NOSYSTEM = '1';
  try {
    // « GitHub » : des dépôts nus sous un dossier `github.com`, pour que l'adresse se lise comme celle d'un dépôt GitHub.
    const r = tmp(); const accueil = tmp(); const github = path.join(tmp(), 'github.com');
    // Profil (identité, dossier des projets, base des conteneurs, une règle bloquante), un contexte, et un socle qui porte
    // un type public.
    ecrire(path.join(r, 'profil', 'arbre', 'index.md'), `---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nconfig:\n  identite: { nom: Alice Exemple, email: alice@noreply.test }\n  creation: { dossier: ${r} }\n  donnees_personnelles: { exceptions: [{ fichier: LICENSE, pourquoi: titulaire }] }\n  conteneur: { devcontainer: { image: base, remoteUser: vscode, postCreateCommand: "bash .devcontainer/deploy-key.sh origin || true" } }\n---\n`);
    ecrire(path.join(r, 'profil', 'arbre', 'rules.yaml'), '- id: identite-de-commit\n  statement: Chaque commit porte l’identité de son contexte.\n  level: blocking\n  check: [identite-de-commit]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
    ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n# Les projets du contexte.\nprojects:\n  - holarch:project:ancien   # ancien\n---\n\n# Perso\n');
    ecrire(path.join(r, 'socle', 'arbre', 'index.md'), '---\ntype: guideline\nid: socle\ntitle: Socle fictif\nstatus: draft\n---\n');
    ecrire(path.join(r, 'socle', 'arbre', 'types-transverses', 'public', 'index.md'), '---\ntype: template\nid: public\ntitle: Public\nstatus: draft\nconfig:\n  creation: { visibilite: public, licence: MIT, journal: arbre/log.md }\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
    ecrire(path.join(r, 'socle', 'arbre', 'types-transverses', 'public', 'rules.yaml'), '- id: rien-de-prive\n  statement: Rien de privé dans ce dépôt.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n- id: rien-de-personnel\n  statement: Aucun nom de personne.\n  level: blocking\n  check: [donnees-personnelles]\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
    for (const d of ['profil', 'socle']) { const { g } = depotGit(path.join(r, d)); g('add', '.'); g('commit', '-qm', 'départ'); }
    const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {},
      inventaire: { 'depots-git': { actif: true, racines: [r], profondeur: 2, ignorer: [] }, arbre: { actif: true, depots: [] } } });
    await s.inventaire(); s.indexer();

    assert.throws(() => configAvantProjet([...s.fiches({ kind: 'node' })], { contexte: 'pro', profil: s.profil() }), /contexte inconnu : pro \(perso\)/);
    assert.throws(() => configAvantProjet([...s.fiches({ kind: 'node' })], { types: ['prive'], profil: s.profil() }), /type inconnu : prive/);
    assert.deepEqual(configAvantProjet([...s.fiches({ kind: 'node' })], { types: ['public'], profil: s.profil() }).config.creation, { dossier: r, visibilite: 'public', licence: 'MIT', journal: 'arbre/log.md' });
    await assert.rejects(creerProjet(s, { nom: '../evasion' }), /nom de projet invalide/);

    const appels = []; let cles = []; const actifs = []; let ghEnPanne = null;
    const gh = (args) => {
      appels.push(args.join(' '));
      if (ghEnPanne && args[0] === 'auth') return { status: ghEnPanne === 'deconnecte' ? 1 : 0, stdout: '' };
      if (ghEnPanne && args[0] === 'api' && args[2]?.endsWith('/keys')) return { status: 1, stdout: '', stderr: 'gh: Not Found (HTTP 404)\n' };
      if (args[0] === 'api' && args[1] === 'user') return { status: 0, stdout: 'alice\n' };
      if (args[0] === 'repo' && args[1] === 'view') return { status: fs.existsSync(path.join(github, args[2])) ? 0 : 1, stdout: '' };
      if (args[0] === 'repo' && args[1] === 'create') { spawnSync('git', ['init', '-q', '--bare', path.join(github, args[2])]); return { status: 0, stdout: '' }; }
      if (args[0] === 'api') return { status: 0, stdout: cles.map((k) => `${k}\n`).join('') };
      return { status: 0, stdout: '' };
    };
    // « Docker » : les conteneurs du projet, en marche ou non (étiquette de dossier vue de Windows, comme sur le poste),
    // l'étiquette de métadonnées que pose le CLI (rendue par `json`, absente : ""), la clé de déploiement de chacun (avec
    // le commentaire que pose deploy-key.sh), ou Docker injoignable. Un conteneur d'un autre dossier tourne toujours.
    let conteneurs = []; let injoignable = false;
    const docker = (args) => {
      appels.push(`docker ${args.join(' ')}`);
      if (injoignable) return { status: 1, stdout: '', stderr: 'Cannot connect to the Docker daemon' };
      if (args[0] === 'ps') {
        return { status: 0, stdout: [{ id: 'fff999', dossier: '/ailleurs/autre', cle: 'ssh-ed25519 AAAAfictiveA' }, ...conteneurs].map((c) => [c.id, c.etat ?? 'running',
          c.dossier ?? `\\\\wsl.localhost\\Ubuntu${path.join(r, NOM).replaceAll('/', '\\')}`, JSON.stringify(c.meta ? JSON.stringify(c.meta) : '')].join('\t')).join('\n') };
      }
      const c = conteneurs.find((x) => x.id === args[1]);
      if (args[0] === 'exec' && c?.cle) return { status: 0, stdout: `${c.cle} devcontainer deploy key — alice/${NOM}\n` };
      return { status: 1, stdout: '', stderr: `cat: ${args.at(-1)}: No such file or directory` };
    };
    const distant = { liste: () => actifs, activer: (id) => { actifs.push({ projet: id, actif: true }); return { unite: 'holarch-distant-neuf.service' }; } };
    const outils = { gh, docker, distant, urlDepot: (o, n) => path.join(github, o, n) };
    const etats = (x) => Object.fromEntries(x.etapes.map((e) => [e.etape, e.etat]));

    // À blanc : rien ne s'écrit, ni le dossier ni le catalogue.
    const blanc = await creerProjet(s, { nom: NOM, types: ['public'], description: 'Un projet d’essai.', aBlanc: true }, outils);
    assert.deepEqual([etats(blanc).depot, etats(blanc).fichiers, etats(blanc).audit, fs.existsSync(path.join(r, NOM))], ['a-faire', 'a-faire', 'a-faire', false]);

    const p1 = await creerProjet(s, { nom: NOM, types: ['public'], description: 'Un projet d’essai.' }, outils);
    const d = path.join(r, NOM); const g = (...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }).stdout.trim();
    assert.deepEqual(etats(p1), { depot: 'faite', identite: 'faite', fichiers: 'faite', declaration: 'faite', regles: 'faite', conteneur: 'faite', github: 'faite', cle: 'geste', distant: 'faite', audit: 'faite' }, JSON.stringify(p1.etapes, null, 1));
    assert.match(p1.projet, /^holarch:project:[0-9a-f]{12}$/);
    assert.deepEqual(g('log', '--format=%an <%ae> %s').split('\n'), ['Alice Exemple <alice@noreply.test> Générer la configuration du conteneur', 'Alice Exemple <alice@noreply.test> Appliquer les règles HOLARCH', 'Alice Exemple <alice@noreply.test> Créer le projet']);
    assert.deepEqual(g('ls-files').split('\n').sort(), ['.claude/rules/holarch/rien-de-prive.md', '.devcontainer/deploy-key.sh', '.devcontainer/devcontainer.json', '.gitignore', 'CLAUDE.md', 'LICENSE', 'README.md', 'arbre/index.md', 'arbre/log.md']);
    assert.match(fs.readFileSync(path.join(d, 'LICENSE'), 'utf8'), new RegExp(`Copyright \\(c\\) ${new Date().getFullYear()} Alice Exemple`));
    assert.match(fs.readFileSync(path.join(d, '.devcontainer', 'devcontainer.json'), 'utf8'), /"name": "Neuf_2\.x"[\s\S]*source=Neuf_2\.x-claude[\s\S]*projects\/-workspaces-Neuf-2-x,[\s\S]*source=Neuf_2\.x-ssh[\s\S]*"CLAUDE_CODE_PROJECT_DIR_NAME": "-workspaces-Neuf-2-x"/);
    assert.deepEqual(executer('montage-sensible', { depot: d, holarch: [] }, 'audit').ecarts, [], 'le conteneur créé ne monte rien de sensible de l’hôte');
    const conteneur = parseJsonc(fs.readFileSync(path.join(d, '.devcontainer', 'devcontainer.json'), 'utf8'));
    assert.match(conteneur.onCreateCommand.holarch, /^sudo chown vscode:vscode /, 'le volume est rendu avant que l’éditeur se connecte');
    assert.ok(!conteneur.postCreateCommand.includes('chown'));
    assert.ok(fs.statSync(path.join(d, '.devcontainer', 'deploy-key.sh')).mode & 0o100, 'deploy-key.sh exécutable');
    assert.match(fs.readFileSync(path.join(d, 'arbre', 'index.md'), 'utf8'), /types: \[public\]\nconfig:\n  journal: arbre\/log.md\ntitle/);
    assert.ok(fs.existsSync(path.join(d, '.git', 'hooks', 'pre-commit')), 'crochet posé (règle bloquante)');
    assert.ok(appels.includes('repo create alice/Neuf_2.x --public --description Un projet d’essai.'), appels.join('\n'));
    assert.equal(g('rev-parse', '--abbrev-ref', '@{upstream}'), 'origin/main');
    // La déclaration : une ligne ajoutée, le reste du fichier (commentaire compris) intact, commit dans le profil seul.
    const ctx = fs.readFileSync(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), 'utf8');
    assert.match(ctx, new RegExp(`# Les projets du contexte\\.\\nprojects:\\n  - holarch:project:ancien   # ancien\\n  - ${p1.projet}   # Neuf_2\\.x\\n---`));
    assert.equal(spawnSync('git', ['-C', path.join(r, 'profil'), 'log', '-1', '--format=%s'], { encoding: 'utf8' }).stdout.trim(), 'Déclarer le projet Neuf_2.x');
    const cle = p1.etapes.find((e) => e.etape === 'cle').geste;
    assert.deepEqual([cle.commande, cle.lien], ['.devcontainer/deploy-key.sh', 'https://github.com/alice/Neuf_2.x/settings/keys/new']);

    // Rejouée, une fois la clé enregistrée : tout est déjà là, rien ne change. Conteneur arrêté, la clé du dépôt suffit,
    // dite non vérifiée.
    const CLE = 'ssh-ed25519 AAAAfictiveA'; cles = [CLE]; const tete = g('rev-parse', 'HEAD');
    const p2 = await creerProjet(s, { nom: NOM, types: ['public'] }, outils);
    assert.deepEqual(Object.values(etats(p2)).filter((e) => e !== 'deja' && e !== 'faite'), [], JSON.stringify(p2.etapes, null, 1));
    assert.deepEqual([etats(p2).fichiers, etats(p2).declaration, etats(p2).regles, etats(p2).conteneur, etats(p2).github, etats(p2).cle, etats(p2).distant], ['deja', 'deja', 'deja', 'deja', 'deja', 'deja', 'deja']);
    assert.equal(g('rev-parse', 'HEAD'), tete);
    assert.equal(p2.etapes.find((e) => e.etape === 'cle').detail, `1 clé(s) sur alice/${NOM} ; celle du conteneur non vérifiée (aucun conteneur construit)`);
    assert.ok(appels.includes(`docker ps --all --filter label=devcontainer.local_folder --format {{.ID}}\t{{.State}}\t{{.Label "devcontainer.local_folder"}}\t{{json (.Label "devcontainer.metadata")}}`), appels.join('\n'));

    // Conteneurs du projet : chacun en marche, sa clé lue dans le dossier de son utilisateur (étiquette de métadonnées du
    // CLI, le dernier remoteUser, à défaut containerUser ; sans étiquette, le remoteUser de la configuration), se compare
    // à celles du dépôt (type et corps, sans le commentaire). Une enregistrée : déjà là ; aucune : geste, qui dit chaque
    // conteneur et compte les clés du dépôt.
    const etapeCle = async () => (await creerProjet(s, { nom: NOM, types: ['public'] }, outils)).etapes.find((e) => e.etape === 'cle');
    conteneurs = [{ id: 'abc123', etat: 'exited', cle: CLE }, { id: 'abc124', etat: 'created', cle: CLE }];
    assert.deepEqual(await etapeCle(), { etape: 'cle', etat: 'deja', detail: `1 clé(s) sur alice/${NOM} ; celle du conteneur non vérifiée (conteneur arrêté)` });
    conteneurs = [{ id: 'abc123', cle: CLE }];
    assert.deepEqual(await etapeCle(), { etape: 'cle', etat: 'deja', detail: `la clé du conteneur abc123 est enregistrée sur alice/${NOM}` });
    assert.ok(appels.includes('docker exec abc123 cat /home/vscode/.ssh/id_ed25519.pub'), appels.join('\n'));
    conteneurs = [{ id: 'abc123', cle: 'ssh-ed25519 AAAAfictiveB', meta: [{ id: 'feature', remoteUser: 'root' }, { remoteUser: 'node' }, {}] },
      { id: 'abc124', meta: [{ containerUser: 'dev' }] }, { id: 'abc125', etat: 'exited', cle: CLE }, { id: 'abc126', cle: CLE }];
    let e = await etapeCle();
    assert.deepEqual([e.etat, e.detail], ['deja', `la clé du conteneur abc126 est enregistrée sur alice/${NOM}`]);
    assert.ok(['docker exec abc123 cat /home/node/.ssh/id_ed25519.pub', 'docker exec abc124 cat /home/dev/.ssh/id_ed25519.pub'].every((x) => appels.includes(x)), appels.join('\n'));
    conteneurs.pop(); e = await etapeCle();
    assert.deepEqual([e.etat, e.detail, e.geste.commande, e.geste.lien], ['geste', `aucun conteneur du projet en marche n’a sa clé enregistrée sur alice/${NOM} : abc123, clé non enregistrée ; `
      + `abc124, pas de clé lisible (/home/dev/.ssh/id_ed25519.pub : cat: /home/dev/.ssh/id_ed25519.pub: No such file or directory) ; le dépôt porte 1 autre(s) clé(s) : à retirer si périmée(s)`,
    '.devcontainer/deploy-key.sh', `https://github.com/alice/${NOM}/settings/keys/new`]);
    injoignable = true; e = await etapeCle();
    assert.deepEqual([e.etat, e.detail], ['deja', `1 clé(s) sur alice/${NOM} ; celle du conteneur non vérifiée (Docker injoignable)`]);
    cles = []; e = await etapeCle();
    assert.deepEqual([e.etat, e.detail], ['geste', `aucune clé de déploiement sur alice/${NOM}`]);
    // Clés du dépôt non lues : rien ne se compte, comme à l'étape github (gh non connecté : geste ; autre erreur : échec).
    cles = [CLE]; injoignable = false; conteneurs = [{ id: 'abc123', cle: CLE }]; ghEnPanne = 'refus'; e = await etapeCle();
    assert.deepEqual([e.etat, e.detail], ['echec', `clés de alice/${NOM} non lues : gh api : gh: Not Found (HTTP 404)`]);
    ghEnPanne = 'deconnecte'; e = await etapeCle();
    assert.deepEqual([e.etat, e.detail, e.geste.commande], ['geste', `clés de alice/${NOM} non lues : \`gh\` absent ou non connecté`, 'gh auth login']);
    ghEnPanne = null; conteneurs = [];

    // Un dossier non vide hors git n'est jamais touché ; un fichier manquant est rajouté, sans rien réécrire.
    ecrire(path.join(r, 'occupe', 'note.txt'), 'à moi\n');
    assert.deepEqual(etats(await creerProjet(s, { nom: 'occupe' }, outils)), { depot: 'echec' });
    fs.rmSync(path.join(d, '.gitignore')); g('commit', '-qam', 'retirer');
    const p3 = await creerProjet(s, { nom: NOM, types: ['public'] }, outils);
    assert.deepEqual([etats(p3).fichiers, p3.etapes.find((e) => e.etape === 'fichiers').detail, g('log', '-1', '--format=%s')], ['faite', '.gitignore', 'Compléter les fichiers de base du projet']);

    // Une déclaration en ligne s'allonge ; sans liste, elle se crée.
    assert.equal(declarer('---\ntype: context\nprojects: [a, b] # deux\n---\n', 'c', 'x'), '---\ntype: context\nprojects: [a, b, c] # deux\n---\n');
    assert.equal(declarer('---\ntype: context\n---\n', 'c', 'x'), '---\ntype: context\nprojects:\n  - c   # x\n---\n');
  } finally {
    for (const [k, v] of Object.entries(avant)) if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});

// Banc de création (passe globale : défauts A4, A5, tests T1 à T3). Git isolé de la configuration du poste ; un profil
// à un contexte, un socle qui porte un type à une règle ; étapes GitHub, conteneur et accès distant coupées.
async function gitIsole(f, global = '') {
  const cles = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM', ...['AUTHOR', 'COMMITTER'].flatMap((x) => [`GIT_${x}_NAME`, `GIT_${x}_EMAIL`])];
  const avant = Object.fromEntries(cles.map((k) => [k, process.env[k]])); for (const k of cles) delete process.env[k];
  const cfg = path.join(tmp(), 'gitconfig'); fs.writeFileSync(cfg, global);
  process.env.GIT_CONFIG_GLOBAL = cfg; process.env.GIT_CONFIG_NOSYSTEM = '1';
  try { await f(); } finally { for (const [k, v] of Object.entries(avant)) if (v === undefined) delete process.env[k]; else process.env[k] = v; }
}
async function bancCreation({ identite = true, creation = {}, conteneur = null } = {}) {
  const r = tmp(); const accueil = tmp();
  const profil = (id) => `---\ntype: guideline\nid: profil\ntitle: Profil fictif\nstatus: draft\nconfig:\n${id ? '  identite: { nom: Alice Exemple, email: alice@noreply.test }\n' : ''}  creation: ${JSON.stringify({ dossier: r, etapes: { github: false, conteneur: false, distant: false }, ...creation })}\n${conteneur ? `  conteneur: ${JSON.stringify(conteneur)}\n` : ''}---\n`;
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), profil(identite));
  ecrire(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), '---\ntype: context\ntitle: Perso\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  ecrire(path.join(r, 'socle', 'arbre', 'index.md'), '---\ntype: guideline\nid: socle\ntitle: Socle fictif\nstatus: draft\n---\n');
  ecrire(path.join(r, 'socle', 'arbre', 'types-transverses', 'methode', 'index.md'), '---\ntype: template\nid: methode\ntitle: Méthode\nstatus: draft\nlinks: { derives_from: [/arbre/index.md] }\n---\n');
  ecrire(path.join(r, 'socle', 'arbre', 'types-transverses', 'methode', 'rules.yaml'), '- id: tests-verts\n  statement: Les tests passent avant de rendre la main.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  for (const d of ['profil', 'socle']) { const { g } = depotGit(path.join(r, d)); g('add', '.'); g('commit', '-qm', 'départ'); }
  const s = new Socle({ site: 'local', profil: path.join(r, 'profil'), donnees: accueil, accueil, web: {}, tarifs: {}, import: {},
    inventaire: { 'depots-git': { actif: true, racines: [r], profondeur: 2, ignorer: [] }, arbre: { actif: true, depots: [] } } });
  await s.inventaire(); s.indexer();
  return { r, s, profil, etats: (x) => Object.fromEntries(x.etapes.map((e) => [e.etape, e.etat])), git: (d, ...a) => spawnSync('git', ['-C', d, ...a], { encoding: 'utf8' }).stdout.trim() };
}

test('création de projet : rejouée après un commit refusé, elle le refait ; un geste fait dans le profil vaut sans attendre l’inventaire', () => gitIsole(async () => {
  const { r, s, profil, etats, git } = await bancCreation({ identite: false });
  const d = path.join(r, 'neuf'); const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'] });
  const p1 = await creer();
  assert.deepEqual([etats(p1).identite, etats(p1).fichiers], ['geste', 'echec'], JSON.stringify(p1.etapes, null, 1));
  const p2 = await creer();
  assert.equal(etats(p2).fichiers, 'echec', 'des fichiers présents mais jamais commités ne sont pas « déjà là » (A5)');
  // Le geste demandé : déclarer l'identité dans le profil, puis relancer, sans inventaire entre les deux (A4).
  ecrire(path.join(r, 'profil', 'arbre', 'index.md'), profil(true));
  const p3 = await creer();
  assert.deepEqual([etats(p3).identite, etats(p3).fichiers, etats(p3).regles], ['faite', 'faite', 'faite'], JSON.stringify(p3.etapes, null, 1));
  assert.deepEqual(git(d, 'log', '--format=%s').split('\n'), ['Appliquer les règles HOLARCH', 'Créer le projet']);
  assert.ok(git(d, 'ls-files').split('\n').includes('.claude/rules/holarch/tests-verts.md'), 'la règle du type, déclaré à la création');
  // Les règles écrites et indexées, leur commit défait : rejouée, elle le refait (A5).
  spawnSync('git', ['-C', d, 'reset', '-q', '--soft', 'HEAD~1']);
  const p4 = await creer();
  assert.deepEqual([etats(p4).regles, git(d, 'log', '-1', '--format=%s')], ['faite', 'Appliquer les règles HOLARCH']);
}, '[user]\n\tuseConfigOnly = true\n'));

test('création de projet : à blanc sur un projet déjà créé, rien n’est écrit ni commité (T1)', () => gitIsole(async () => {
  const { r, s, etats, git } = await bancCreation();
  const d = path.join(r, 'neuf'); const creer = (aBlanc) => creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc });
  assert.deepEqual(Object.values(etats(await creer(false))).filter((e) => !['faite', 'desactivee'].includes(e)), []);
  const tetes = () => [git(d, 'rev-parse', 'HEAD'), git(path.join(r, 'profil'), 'rev-parse', 'HEAD'), git(d, 'status', '--porcelain'), fs.readFileSync(path.join(s.config.donnees, 'catalogue', 'local.json'), 'utf8')];
  const avant = tetes();
  const b = await creer(true);
  assert.deepEqual(Object.values(etats(b)).filter((e) => !['deja', 'desactivee', 'a-faire'].includes(e)), [], JSON.stringify(b.etapes, null, 1));
  assert.deepEqual([etats(b).fichiers, etats(b).declaration, etats(b).regles, etats(b).audit], ['deja', 'deja', 'deja', 'a-faire']);
  assert.deepEqual(tetes(), avant, 'ni commit, ni fichier, ni catalogue');
}));

test('création de projet : une déclaration refusée par le profil le laisse comme il était (T2)', () => gitIsole(async () => {
  const { r, s, etats, git } = await bancCreation();
  const profil = path.join(r, 'profil'); const ctx = path.join(profil, 'arbre', 'contextes', 'perso.md');
  ecrire(path.join(profil, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\necho refusé >&2\nexit 1\n'); fs.chmodSync(path.join(profil, '.git', 'hooks', 'pre-commit'), 0o755);
  const texte = fs.readFileSync(ctx, 'utf8');
  const p = await creerProjet(s, { nom: 'neuf', types: ['methode'] });
  assert.deepEqual([etats(p).fichiers, etats(p).declaration], ['faite', 'echec'], JSON.stringify(p.etapes, null, 1));
  assert.match(p.etapes.find((e) => e.etape === 'declaration').detail, /commit dans le profil refusé : refusé/);
  assert.deepEqual([fs.readFileSync(ctx, 'utf8'), git(profil, 'status', '--porcelain'), git(profil, 'log', '--format=%s')], [texte, '', 'départ'], 'contexte remis en état, rien d’indexé');
  // Le crochet retiré, rejouée : la déclaration se fait.
  fs.rmSync(path.join(profil, '.git', 'hooks', 'pre-commit'));
  assert.equal(etats(await creerProjet(s, { nom: 'neuf', types: ['methode'] })).declaration, 'faite');
}));

test('création de projet : des règles illisibles mettent l’étape en échec sans interrompre la commande', () => gitIsole(async () => {
  const { r, s, etats } = await bancCreation();
  const d = path.join(r, 'neuf'); const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'] });
  assert.equal(etats(await creer()).regles, 'faite');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: [ouverte\n');
  const p = await creer();
  assert.equal(etats(p).regles, 'echec', JSON.stringify(p.etapes, null, 1));
  assert.match(p.etapes.find((e) => e.etape === 'regles').detail, /règles illisibles, rien n'est écrit : .*rules\.yaml illisible/);
}));

test('création de projet : une licence sans modèle arrête tout avant de créer quoi que ce soit (T3)', () => gitIsole(async () => {
  for (const licence of ['INCONNUE', '../MIT']) {
    const { r, s, etats } = await bancCreation({ creation: { licence } });
    const p = await creerProjet(s, { nom: 'neuf' });
    assert.deepEqual(etats(p), { fichiers: 'echec' }, JSON.stringify(p.etapes, null, 1));
    assert.match(p.etapes[0].detail, /licence sans modèle/); assert.ok(!fs.existsSync(path.join(r, 'neuf')), 'aucun dossier, aucun git init');
  }
}));

test('conteneur généré : clés du socle après celles des couches, gpu, connexion de l’hôte, et ce qu’aucune couche ne remplace', () => {
  const g = (c, nom = 'Neuf_2.x') => genererConteneur({ nom, config: { conteneur: c } });
  const base = { devcontainer: { image: 'base', remoteUser: 'vscode' } };
  const v = g(base);
  assert.ok(v.texte.startsWith(`${MARQUE_CONTENEUR}\n`), 'marqué en première ligne');
  assert.deepEqual(parseJsonc(v.texte), v.conteneur, 'le texte dit l’objet, commentaires compris');
  // L'en-tête nomme sa source, un commentaire fixe dit chaque part du socle au-dessus de sa clé (choix de l'auteur) :
  // `parseJsonc` les ignore, le texte les porte (m-7).
  const lignes = v.texte.split('\n');
  const commentaire = (k) => { let i = lignes.findIndex((l) => l.startsWith(`  "${k}":`)); while (lignes[i - 1]?.startsWith('  // ')) i--; return lignes[i]; };
  assert.deepEqual(['initializeCommand', 'mounts', 'containerEnv', 'remoteEnv', 'onCreateCommand'].map((k) => commentaire(k).slice(0, 13)), Array(5).fill('  // Socle : '));
  assert.match(commentaire('mounts'), /^ {2}\/\/ Socle : Claude Code dans un volume propre au conteneur/);
  assert.match(lignes[1], /^\/\/ Source : la clé conteneur de la configuration effective du projet/);
  assert.deepEqual(Object.keys(v.conteneur), ['name', 'image', 'remoteUser', 'initializeCommand', 'mounts', 'containerEnv', 'remoteEnv', 'onCreateCommand']);
  assert.deepEqual(v.conteneur.mounts, ['source=Neuf_2.x-claude,target=/home/vscode/.claude,type=volume',
    'source=${localEnv:HOME}/.claude/projects/-workspaces-Neuf-2-x,target=/home/vscode/.claude/projects/-workspaces-Neuf-2-x,type=bind',
    'source=${localEnv:HOME}/.claude/rules,target=/home/vscode/.claude/rules,type=bind,readonly',
    'source=${localEnv:HOME}/.local/share/holarch/outils,target=/opt/holarch/outils,type=bind,readonly', 'source=Neuf_2.x-ssh,target=/home/vscode/.ssh,type=volume']);
  // Le gitleaks de l'hôte, en lecture, pour le crochet de commit (décision garde-sans-passage-muet) : son dossier est créé
  // vide s'il manque, le conteneur démarre toujours.
  assert.equal(v.conteneur.initializeCommand, 'mkdir -p ${localEnv:HOME}/.claude/projects/-workspaces-Neuf-2-x ${localEnv:HOME}/.claude/rules ${localEnv:HOME}/.local/share/holarch/outils');
  // Les volumes gardent la casse du nom : deux projets qui ne diffèrent que par elle ne partagent ni connexion ni clé.
  const volumes = (nom) => g(base, nom).conteneur.mounts.filter((m) => m.endsWith(',type=volume')).map((m) => m.match(/^source=([^,]+)/)[1]);
  assert.deepEqual([volumes('Foo'), volumes('foo')], [['Foo-claude', 'Foo-ssh'], ['foo-claude', 'foo-ssh']]);
  assert.deepEqual([v.conteneur.containerEnv, v.conteneur.remoteEnv, v.conteneur.onCreateCommand], [{ CLAUDE_CONFIG_DIR: '/home/vscode/.claude', CLAUDE_CODE_PROJECT_DIR_NAME: '-workspaces-Neuf-2-x' },
    { ANTHROPIC_API_KEY: '' }, { holarch: 'sudo chown vscode:vscode /home/vscode/.claude /home/vscode/.claude/projects /home/vscode/.ssh' }]);
  // Les couches s'ajoutent à ce que pose le socle, sans le remplacer.
  const c = g({ devcontainer: { ...base.devcontainer, mounts: ['source=cache,target=/cache,type=volume'], containerEnv: { A: '1' }, onCreateCommand: { outil: 'x' } } }).conteneur;
  assert.deepEqual([c.mounts.length, c.mounts[0], c.containerEnv.A, Object.keys(c.onCreateCommand)], [6, 'source=cache,target=/cache,type=volume', '1', ['outil', 'holarch']]);
  assert.deepEqual([g({ ...base, gpu: 'requis' }).conteneur.hostRequirements, g({ ...base, gpu: 'optionnel' }).conteneur.hostRequirements, g({ ...base, gpu: 'non' }).conteneur.hostRequirements], [{ gpu: true }, { gpu: 'optional' }, undefined]);
  assert.deepEqual(g({ gpu: 'requis', devcontainer: { ...base.devcontainer, hostRequirements: { cpus: 4 } } }).conteneur.hostRequirements, { cpus: 4, gpu: true }, 'le gpu s’ajoute au hostRequirements d’une couche (m-6)');
  const h = g({ ...base, connexion_claude: 'hote' }).conteneur;
  assert.deepEqual([h.mounts, h.initializeCommand, h.onCreateCommand], [['source=${localEnv:HOME}/.claude,target=/home/vscode/.claude,type=bind',
    'source=${localEnv:HOME}/.local/share/holarch/outils,target=/opt/holarch/outils,type=bind,readonly', 'source=Neuf_2.x-ssh,target=/home/vscode/.ssh,type=volume'],
    'mkdir -p ${localEnv:HOME}/.local/share/holarch/outils', { holarch: 'sudo chown vscode:vscode /home/vscode/.ssh' }], 'le ~/.claude de l’hôte n’est jamais repris');
  const racine = g({ devcontainer: { image: 'base', remoteUser: 'root' } }).conteneur;
  assert.deepEqual([racine.containerEnv.CLAUDE_CONFIG_DIR, racine.onCreateCommand], ['/root/.claude', undefined]);
  for (const [x, motif] of [[{ devcontainer: { image: 'base' } }, /remoteUser absent : le profil le pose/], [{ ...base, gpu: 'oui' }, /conteneur\.gpu inconnu : oui/],
    // Un utilisateur qui entrerait dans `sudo chown` et `/home/…` (m-1), un `remoteEnv` qui n'est pas un objet (m-2).
    [{ devcontainer: { image: 'base', remoteUser: 'x;id' } }, /remoteUser invalide : x;id : /], [{ devcontainer: { ...base.devcontainer, remoteEnv: 'x' } }, /remoteEnv : un objet attendu$/],
    [{ ...base, connexion_claude: 'hôte' }, /connexion_claude inconnu/], [{ devcontainer: { ...base.devcontainer, name: 'x' } }, /posé par le socle, qu’aucune couche ne remplace : name$/],
    [{ devcontainer: { ...base.devcontainer, initializeCommand: 'curl x' } }, /: initializeCommand$/],
    [{ devcontainer: { ...base.devcontainer, containerEnv: { CLAUDE_CONFIG_DIR: '/x' } } }, /: containerEnv\.CLAUDE_CONFIG_DIR$/],
    [{ devcontainer: { ...base.devcontainer, remoteEnv: { ANTHROPIC_API_KEY: 'k' } } }, /: remoteEnv\.ANTHROPIC_API_KEY$/],
    // Dans l'autre section aussi : `remoteEnv` l'emporte pour les sessions, `containerEnv` se commite en clair.
    [{ devcontainer: { ...base.devcontainer, remoteEnv: { CLAUDE_CONFIG_DIR: '/x', CLAUDE_CODE_PROJECT_DIR_NAME: 'y' } } }, /: remoteEnv\.CLAUDE_CONFIG_DIR, remoteEnv\.CLAUDE_CODE_PROJECT_DIR_NAME$/],
    [{ devcontainer: { ...base.devcontainer, containerEnv: { ANTHROPIC_API_KEY: 'k' } } }, /: containerEnv\.ANTHROPIC_API_KEY$/],
    [{ devcontainer: { ...base.devcontainer, onCreateCommand: { holarch: 'x' } } }, /: onCreateCommand\.holarch$/],
    [{ devcontainer: { ...base.devcontainer, mounts: [{ type: 'bind', source: '/x', target: '/home/vscode/.ssh' }] } }, /: mounts \(cible \/home\/vscode\/\.ssh\)$/],
    [{ devcontainer: { ...base.devcontainer, mounts: ['type=volume, src=x, dst=/home/vscode/.claude'] } }, /: mounts \(cible \/home\/vscode\/\.claude\)$/],
    [{ devcontainer: { ...base.devcontainer, mounts: ['type=bind,source=x,destination=/home/vscode/.claude'] } }, /: mounts \(cible \/home\/vscode\/\.claude\)$/],
    [{ devcontainer: { ...base.devcontainer, onCreateCommand: 'x' } }, /onCreateCommand : un objet attendu/],
    [{ devcontainer: { ...base.devcontainer, containerEnv: ['A=1'] } }, /containerEnv : un objet attendu$/], [{ devcontainer: { ...base.devcontainer, mounts: 'x' } }, /mounts : une liste attendue/],
    [{ devcontainer: [] }, /^conteneur\.devcontainer : un objet attendu/], [[], /^conteneur : un objet attendu/]]) assert.match(g(x).erreur ?? '', motif, JSON.stringify(x));
  assert.match(g(base, '../x').erreur, /nom de projet/);
  // Le fichier généré ne monte rien de sensible ; avec la connexion de l'hôte, le contrôle le dit (dérogation écrite).
  const maison = tmp(); const d = path.join(maison, 'Neuf_2.x');
  const monte = (x) => { ecrire(path.join(d, '.devcontainer', 'devcontainer.json'), g(x).texte); return executer('montage-sensible', { depot: d, holarch: [], maison, env: { HOME: maison }, maisonsWindows: [], distants: [] }, 'audit').ecarts.map((e) => e.cle); };
  assert.deepEqual(monte(base), []);
  assert.deepEqual(monte({ ...base, connexion_claude: 'hote' }), ['montage:.devcontainer/devcontainer.json:/home/vscode/.claude']);
  // Les outils de la garde, admis en lecture seule : en écriture, un conteneur remplacerait le gitleaks des autres.
  assert.deepEqual(monte({ devcontainer: { ...base.devcontainer, mounts: ['source=${localEnv:HOME}/.local/share/holarch/outils,target=/x,type=bind'] } }), ['montage:.devcontainer/devcontainer.json:/x']);
});

test('création de projet : conteneur généré, réécrit s’il diffère, jamais un fichier écrit à la main ; l’audit dit un fichier généré modifié', () => gitIsole(async () => {
  const base = { devcontainer: { image: 'base', remoteUser: 'vscode', postCreateCommand: 'bash .devcontainer/deploy-key.sh origin || true' } };
  const { r, s, etats, git } = await bancCreation({ creation: { etapes: { github: false, conteneur: true, distant: false } }, conteneur: base });
  const d = path.join(r, 'neuf'); const f = path.join(d, '.devcontainer', 'devcontainer.json'); const script = path.join(d, '.devcontainer', 'deploy-key.sh');
  const creer = (aBlanc = false) => creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc });
  const etape = (p) => p.etapes.find((e) => e.etape === 'conteneur');
  const ecartsConteneur = (id) => s.audit({ projet: id }).cibles.find((c) => c.projet === id).ecarts.filter((e) => e.controle === 'conteneur-genere').map((e) => [e.fichier, e.message.split(' : ')[0]]);

  // À blanc, un dépôt au catalogue mais pas encore déclaré : sa configuration attend la déclaration.
  ecrire(path.join(r, 'autre', 'README.md'), 'autre\n'); const { g: ga } = depotGit(path.join(r, 'autre')); ga('add', '.'); ga('commit', '-qm', 'départ');
  await s.inventaire(); s.indexer();
  const a0 = await creerProjet(s, { nom: 'autre', aBlanc: true });
  assert.deepEqual([etats(a0).declaration, etats(a0).conteneur, etape(a0).detail, fs.existsSync(path.join(r, 'autre', '.devcontainer'))], ['a-faire', 'a-faire', 'après la déclaration', false], JSON.stringify(a0.etapes, null, 1));

  const p1 = await creer();
  assert.deepEqual([etats(p1).conteneur, etape(p1).detail, git(d, 'log', '-1', '--format=%s')], ['faite', '.devcontainer/devcontainer.json, .devcontainer/deploy-key.sh', 'Générer la configuration du conteneur'], JSON.stringify(p1.etapes, null, 1));
  const genere = genererConteneur({ nom: 'neuf', config: { conteneur: base } }).texte;
  assert.equal(fs.readFileSync(f, 'utf8'), genere);
  assert.ok(fs.statSync(script).mode & 0o100, 'deploy-key.sh exécutable, que la commande générée appelle');
  assert.deepEqual(ecartsConteneur(p1.projet), []);
  // Le script de la clé, modifié à la main, n'est jamais réécrit, même appelé par la commande générée (m-3).
  fs.writeFileSync(script, '#!/bin/sh\necho à la main\n');
  const pc = await creer();
  assert.deepEqual([etats(pc).conteneur, fs.readFileSync(script, 'utf8')], ['deja', '#!/bin/sh\necho à la main\n'], JSON.stringify(pc.etapes, null, 1));
  git(d, 'checkout', '-q', '--', '.devcontainer/deploy-key.sh');

  // Modifié à la main : l'audit le dit ; à blanc, rien ne change ; rejouée, la création le réécrit.
  fs.writeFileSync(f, genere.replace('"base"', '"autre"'));
  assert.deepEqual(ecartsConteneur(p1.projet), [['.devcontainer/devcontainer.json', 'diffère de la configuration (clé conteneur)']]);
  s.audit({ projet: p1.projet, journaliser: true });
  const blanc = await creer(true);
  assert.deepEqual([etats(blanc).conteneur, fs.readFileSync(f, 'utf8').includes('"autre"')], ['a-faire', true]);
  const p2 = await creer();
  assert.deepEqual([etats(p2).conteneur, git(d, 'log', '-1', '--format=%s'), fs.readFileSync(f, 'utf8'), git(d, 'status', '--porcelain')], ['faite', 'Générer la configuration du conteneur', genere, ''],
    'la modification jamais commitée est remplacée sans commit : le fichier commité est déjà le bon');
  // Corrigé par la création, l'écart se résout au journal (m-8).
  assert.deepEqual([...s.journal.lire()].filter((e) => e.data?.controle === 'conteneur-genere').map((e) => e.kind), ['rule.violated', 'rule.resolved']);
  fs.writeFileSync(f, genere.replace('"base"', '"autre"')); git(d, 'commit', '-qam', 'à la main');
  const p3 = await creer();
  assert.deepEqual([etats(p3).conteneur, git(d, 'log', '-1', '--format=%s'), fs.readFileSync(f, 'utf8')], ['faite', 'Régénérer la configuration du conteneur', genere]);
  assert.deepEqual(ecartsConteneur(p1.projet), []);

  // Écrit à la main (sans la marque) : ni l'audit ni la création n'y touchent ; le geste dit la commande, puis la création
  // le génère.
  fs.writeFileSync(f, '{ "image": "a-la-main" }\n'); git(d, 'commit', '-qam', 'à la main');
  assert.deepEqual(ecartsConteneur(p1.projet), []);
  const p4 = await creer();
  assert.deepEqual([etats(p4).conteneur, etape(p4).geste.commande, fs.readFileSync(f, 'utf8')], ['geste', `git -C ${d} rm -q .devcontainer/devcontainer.json`, '{ "image": "a-la-main" }\n'], JSON.stringify(p4.etapes, null, 1));
  git(d, 'rm', '-q', '.devcontainer/devcontainer.json');
  const p5 = await creer();
  assert.deepEqual([etats(p5).conteneur, git(d, 'log', '-1', '--format=%s'), fs.readFileSync(f, 'utf8'), git(d, 'status', '--porcelain')], ['faite', 'Générer la configuration du conteneur', genere, '']);

  // La racine du projet porte sa propre commande : le script de la clé n'est plus appelé, il ne revient pas une fois retiré.
  git(d, 'rm', '-q', '.devcontainer/deploy-key.sh'); git(d, 'commit', '-qm', 'sans script');
  const index = path.join(d, 'arbre', 'index.md');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('types: [methode]\n', 'types: [methode]\nconfig:\n  conteneur: { devcontainer: { postCreateCommand: "npm install" } }\n'));
  git(d, 'commit', '-qam', 'commande propre');
  const p6 = await creer();
  assert.deepEqual([etats(p6).conteneur, etape(p6).detail, fs.existsSync(script)], ['faite', '.devcontainer/devcontainer.json', false], JSON.stringify(p6.etapes, null, 1));
  assert.equal(parseJsonc(fs.readFileSync(f, 'utf8')).postCreateCommand, 'npm install');

  // Un commit refusé laisse le fichier écrit ; rejouée, la création le commite sans le réécrire.
  const crochet = path.join(d, '.git', 'hooks', 'pre-commit'); ecrire(crochet, '#!/bin/sh\necho refusé >&2\nexit 1\n'); fs.chmodSync(crochet, 0o755);
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('"npm install"', '"npm ci"'));
  git(d, 'commit', '-qam', 'npm ci', '--no-verify');
  const p8 = await creer();
  assert.deepEqual([etats(p8).conteneur, etape(p8).detail], ['echec', 'commit refusé : refusé'], JSON.stringify(p8.etapes, null, 1));
  fs.rmSync(crochet);
  const p9 = await creer();
  assert.deepEqual([etats(p9).conteneur, git(d, 'log', '-1', '--format=%s'), git(d, 'status', '--porcelain'), parseJsonc(fs.readFileSync(f, 'utf8')).postCreateCommand], ['faite', 'Régénérer la configuration du conteneur', '', 'npm ci']);

  // Une configuration qui ne se génère plus : l'étape échoue sans rien écrire, l'audit le dit.
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('postCreateCommand: "npm ci"', 'name: autre'));
  git(d, 'commit', '-qam', 'nom');
  const avant = fs.readFileSync(f, 'utf8'); const p7 = await creer();
  assert.deepEqual([etats(p7).conteneur, etape(p7).detail, fs.readFileSync(f, 'utf8')], ['echec', 'posé par le socle, qu’aucune couche ne remplace : name', avant]);
  assert.deepEqual(ecartsConteneur(p1.projet), [['.devcontainer/devcontainer.json', 'la configuration ne le génère plus']]);

  // Un lien symbolique posé dans le dépôt (le conteneur l'écrit) ne détourne aucune écriture vers l'hôte : le fichier ou
  // son dossier, l'étape échoue et rien ne s'écrit dehors ; de même pour les fichiers de base.
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('name: autre', 'postCreateCommand: "bash .devcontainer/deploy-key.sh origin || true"'));
  git(d, 'commit', '-qam', 'clé');
  // Le script de la clé, écrit par un passage dont le commit est refusé, reste indexé sans commit : rejouée, la création
  // le commite avec le reste (m-4).
  ecrire(crochet, '#!/bin/sh\necho refusé >&2\nexit 1\n'); fs.chmodSync(crochet, 0o755);
  const k1 = await creer();
  assert.deepEqual([etats(k1).conteneur, git(d, 'status', '--porcelain', '--', '.devcontainer/deploy-key.sh')], ['echec', 'A  .devcontainer/deploy-key.sh'], JSON.stringify(k1.etapes, null, 1));
  fs.rmSync(crochet);
  const k2 = await creer();
  assert.deepEqual([etats(k2).conteneur, git(d, 'status', '--porcelain'), git(d, 'ls-files', '.devcontainer/deploy-key.sh')], ['faite', '', '.devcontainer/deploy-key.sh'], JSON.stringify(k2.etapes, null, 1));

  // Un lien vers un fichier de l'hôte n'est pas même lu (il passerait pour un fichier écrit à la main) : l'étape échoue.
  const dehors = path.join(r, 'dehors'); ecrire(path.join(dehors, 'cible.json'), '{ "hote": true }\n');
  fs.rmSync(f); fs.symlinkSync(path.join(dehors, 'cible.json'), f);
  const l1 = await creer();
  assert.deepEqual([etats(l1).conteneur, etape(l1).detail, fs.readdirSync(dehors)], ['echec', '.devcontainer/devcontainer.json est un lien symbolique : rien n’est lu', ['cible.json']], JSON.stringify(l1.etapes, null, 1));
  // L'audit non plus ne le lit pas : son contrôle n'a pas pu se faire.
  assert.deepEqual(s.audit({ projet: l1.projet }).cibles.find((c) => c.projet === l1.projet).controles.find((c) => c.id === 'conteneur-genere'),
    { id: 'conteneur-genere', etat: 'indisponible', raison: '.devcontainer/devcontainer.json est un lien symbolique : rien n’est lu' });
  fs.rmSync(path.join(dehors, 'cible.json'));
  fs.rmSync(path.join(d, '.devcontainer'), { recursive: true }); fs.symlinkSync(dehors, path.join(d, '.devcontainer'));
  const l2 = await creer();
  assert.deepEqual([etats(l2).conteneur, etape(l2).detail, fs.readdirSync(dehors)], ['echec', '.devcontainer est un lien symbolique : rien n’est lu', []], JSON.stringify(l2.etapes, null, 1));
  git(d, 'rm', '-q', '.gitignore'); git(d, 'commit', '-qm', 'sans .gitignore');
  fs.symlinkSync(path.join(dehors, 'gitignore'), path.join(d, '.gitignore'));
  const l3 = await creer();
  assert.deepEqual([etats(l3).fichiers, l3.etapes.find((e) => e.etape === 'fichiers').detail, fs.readdirSync(dehors)], ['echec', '.gitignore est un lien symbolique : rien n’est écrit', []]);
  // Un chemin réglé qui sort du dépôt (un journal en `../`) n'est pas écrit non plus.
  assert.throws(() => ecrireSansLien(d, '../dehors/x', 'a'), /hors du dépôt/); assert.deepEqual(fs.readdirSync(dehors), []);
}));

// M-2 étendu (contre-épreuve de C) : toute écriture de HOLARCH dans un dépôt, que le conteneur écrit, passe par la même
// vérification (`cheminSansLien`). Un lien symbolique par endroit, vers un dossier de l'hôte (`dehors`) : rien n'y est
// écrit ni retiré, et c'est dit.
import { dossierProjet, dossierCompte } from '../src/regles-claude-code.js';
import * as affichage from '../bin/affichage.js';
test('Écritures dans un dépôt (M-2) : un lien symbolique n’y détourne vers l’hôte ni les règles, ni les réglages, ni le crochet, ni la déclaration, ni la récolte', () => gitIsole(async () => {
  const lien = (cible, l) => { fs.rmSync(l, { recursive: true, force: true }); fs.mkdirSync(path.dirname(l), { recursive: true }); fs.symlinkSync(cible, l); };
  const LIEN = (x) => `${x} est un lien symbolique : rien n’est écrit`;
  const liste = (d) => fs.readdirSync(d, { recursive: true }).sort();

  // Règles (`appliquer`), au projet et au compte : un dossier du chemin depuis la racine qui est un lien ; rien n'y est
  // lu, créé ni retiré (un fichier marqué dehors reste), à blanc non plus.
  const regle = { id: 'r', fiche: 'f', enonce: 'Une règle.', niveau: 'reminder', statut: 'stable', applicable: true, origine: 'projet', provenance: { arbre: 'a', noeud: '/' }, recouvre: [] };
  const plan = planifier([regle], { portee: 'projet', classificationDepot: 'internal' }); const vide = { fichiers: [], non: [], signaux: [] };
  for (const [seg, dossier] of [['.claude', dossierProjet], ['.claude/rules', dossierProjet], ['.claude/rules/holarch', dossierProjet], ['rules', dossierCompte], ['rules/holarch', dossierCompte]]) {
    const racine = tmp(); const d = dossier(racine); const dehors = tmp();
    ecrire(path.join(dehors, path.relative(path.join(racine, seg), d), 'ancienne.md'), `${MARQUE}\nrègle retirée de l'arbre\n`);
    lien(dehors, path.join(racine, seg)); const avant = liste(dehors);
    for (const [p, o] of [[plan, {}], [vide, {}], [plan, { ecrire: false }]]) assert.deepEqual([appliquer(racine, d, p, o).erreur, liste(dehors)], [LIEN(seg), avant], `${seg} ${p.fichiers.length} ${JSON.stringify(o)}`);
  }
  // Le dossier lien sans fichier de règle : dit quand même, son contenu n'est pas lu ; un fichier de règle qui est un
  // lien : rien n'est écrit à travers, et `regles appliquer` le dit.
  const r0 = tmp(); lien(tmp(), dossierProjet(r0)); assert.equal(appliquer(r0, dossierProjet(r0), vide).erreur, LIEN('.claude/rules/holarch'));
  const r1 = tmp(); const dehors1 = tmp(); lien(path.join(dehors1, 'r.md'), path.join(dossierProjet(r1), 'r.md'));
  const e1 = appliquer(r1, dossierProjet(r1), plan);
  assert.deepEqual([e1.erreur, liste(dehors1)], [LIEN('.claude/rules/holarch/r.md'), []]);
  assert.match(affichage.bilan('projet', e1), /\n {2}ATTENTION règles arrêtées : \.claude\/rules\/holarch\/r\.md est un lien symbolique/);

  // Réglages et lectures refusées du compte (`ecrireJson`) : le dossier du manifeste ou le temporaire qui est un lien.
  const voulu = reglagesVoulus({ claude_code: { reglages: { effortLevel: 'high' } } }, { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv' });
  for (const [nom, poser] of [['permissions', (h) => appliquerPermissions(h, ['Read(//**/.env)'])], ['reglages', (h) => appliquerReglages(h, voulu)]]) {
    for (const seg of ['rules', `settings.json.${process.pid}.holarch`]) {
      const home = tmp(); const dehors = tmp(); lien(seg === 'rules' ? dehors : path.join(dehors, 'tmp'), path.join(home, seg));
      assert.throws(() => poser(home), (e) => e.message === LIEN(seg), `${nom} ${seg}`); assert.deepEqual(liste(dehors), [], `${nom} ${seg}`);
    }
  }

  // Crochet de git (`poserCrochet`) : `.git/hooks` ou le crochet qui est un lien, état erreur, rien n'est écrit ni retiré
  // dehors, à blanc non plus ; hors du dépôt (`core.hooksPath`), seul le crochet lui-même est gardé (risque accepté jusqu'à D).
  const texte = crochetDe({ node: '/inexistant/node', holarch: '/inexistant/holarch.js', accueil: '/inexistant' });
  const autre = crochetDe({ node: '/inexistant/node', holarch: '/inexistant/holarch.js', accueil: '/ailleurs' });
  for (const seg of ['.git/hooks', '.git/hooks/pre-commit']) {
    const { d } = depotGit(); const dehors = tmp(); ecrire(path.join(dehors, 'pre-commit'), texte);
    lien(seg === '.git/hooks' ? dehors : path.join(dehors, 'pre-commit'), path.join(d, seg));
    for (const [v, o] of [[autre, {}], [null, {}], [autre, { ecrire: false }]]) {
      const c = poserCrochet(d, v, o);
      assert.deepEqual([c.etat, c.raison, liste(dehors), fs.readFileSync(path.join(dehors, 'pre-commit'), 'utf8')], ['erreur', LIEN(seg), ['pre-commit'], texte], `${seg} ${v ? 'pose' : 'retrait'} ${JSON.stringify(o)}`);
    }
  }
  const { d: dh, g: gh } = depotGit(); const crochets = tmp(); gh('config', 'core.hooksPath', crochets);
  assert.deepEqual([poserCrochet(dh, texte).etat, fs.existsSync(path.join(crochets, 'pre-commit'))], ['pose', true]);

  // Récolte proposée (`proposerRegles`, `ajouterRegles`) : le rules.yaml du profil, ou l'arbre d'un projet qui n'en a
  // pas, qui est un lien ; la règle est dite non écrite, rien n'est écrit dehors.
  {
    const g = (id, x = {}) => ({ id, consigne: `Consigne ${id}.`, pourquoi: `Raison ${id}.`, couverte_par: null, contredit: [], elements: 2, sessions: 2, sources: ['s1', 's2'],
      projets: [], projets_ids: [], hors_projet: 0, memoires: 0, premiere: '2026-10-01T00:00:00Z', derniere: '2026-10-03T00:00:00Z', ...x });
    const profil = tmp(); const demo = tmp(); const dehors = tmp(); const dehors2 = tmp();
    ecrire(path.join(profil, 'arbre', 'index.md'), '---\ntype: guideline\ntitle: Profil\nstatus: draft\n---\n');
    lien(path.join(dehors, 'rules.yaml'), path.join(profil, 'arbre', 'rules.yaml')); lien(dehors2, path.join(demo, 'arbre'));
    const s = new Socle({ site: 'local', profil, donnees: tmp(), web: {}, inventaire: {}, import: {} });
    s.catalogue.remplacer([{ id: 'holarch:node:profil', kind: 'node', name: 'profil', status: 'proposed', provenance: { source: 't' }, location: path.join(profil, 'arbre', 'index.md'), node: '/arbre/index.md', attributes: { type: 'guideline', arbre: 'profil', racine: true } },
      { id: 'holarch:project:demo', kind: 'project', name: 'demo', status: 'active', provenance: { source: 't' }, location: demo, attributes: {} }]);
    s.indexer();
    const p = s.proposerRegles([g('commune'), g('du-projet', { projets: ['demo'], projets_ids: ['holarch:project:demo'] })], { at: '2026-10-07' });
    assert.deepEqual([p.ecrites, p.sans_noeud, liste(dehors), liste(dehors2)], [[], [{ id: 'du-projet', raison: LIEN('arbre') }, { id: 'commune', raison: LIEN('arbre/rules.yaml') }], [], []]);
  }

  // Déclaration dans le contexte (création, étape 3) : le contexte du profil qui est un lien n'est pas même lu (l'inventaire
  // de l'arbre le dit illisible), la création s'arrête sans rien écrire dehors ; un lien posé pendant le commit refusé
  // (par un crochet du profil), la remise en l'état n'écrit pas dehors non plus.
  const { r, s, etats, git } = await bancCreation();
  const profil = path.join(r, 'profil'); const ctx = path.join(profil, 'arbre', 'contextes', 'perso.md'); const texteCtx = fs.readFileSync(ctx, 'utf8');
  const etape = (x, e) => x.etapes.find((y) => y.etape === e); const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'] });
  const dehors = path.join(r, 'dehors'); ecrire(path.join(dehors, 'perso.md'), texteCtx);
  lien(path.join(dehors, 'perso.md'), ctx); git(profil, 'add', '-A'); git(profil, 'commit', '-qm', 'contexte en lien');
  await assert.rejects(creer(), /contexte à préciser \(--contexte\) : perso illisible \(profil:\/arbre\/contextes\/perso\.md : fichier illisible : arbre\/contextes\/perso\.md est un lien symbolique : rien n’est lu\)/);
  assert.deepEqual([liste(dehors), fs.readFileSync(path.join(dehors, 'perso.md'), 'utf8')], [['perso.md'], texteCtx]);
  assert.match(s.arbreFrais().find((n) => n.location === ctx).attributes.erreur_entete, /arbre\/contextes\/perso\.md est un lien symbolique : rien n’est lu/);
  fs.rmSync(ctx); fs.writeFileSync(ctx, texteCtx); git(profil, 'add', '-A'); git(profil, 'commit', '-qm', 'contexte en fichier');
  const dehors2 = path.join(r, 'dehors2'); fs.mkdirSync(dehors2); const crochet = path.join(profil, '.git', 'hooks', 'pre-commit');
  ecrire(crochet, `#!/bin/sh\nrm arbre/contextes/perso.md && ln -s '${path.join(dehors2, 'perso.md')}' arbre/contextes/perso.md\nexit 1\n`); fs.chmodSync(crochet, 0o755);
  const p2 = await creer();
  assert.deepEqual([etats(p2).declaration, etape(p2, 'declaration').detail, liste(dehors2)], ['echec', LIEN('arbre/contextes/perso.md'), []], JSON.stringify(p2.etapes, null, 1));

  // Règles du projet (étape 4) : son `.claude` qui est un lien, l'étape échoue sans rien écrire dehors ; l'audit dit le
  // contrôle non disponible, comme celui du crochet quand `.git/hooks` est un lien (ce qu'il n'a pas vu ne se résout pas).
  fs.rmSync(crochet); fs.rmSync(ctx); fs.writeFileSync(ctx, texteCtx);
  const d = path.join(r, 'neuf'); const dehors3 = path.join(r, 'dehors3'); fs.mkdirSync(dehors3); lien(dehors3, path.join(d, '.claude'));
  const p3 = await creer();
  assert.deepEqual([etats(p3).declaration, etats(p3).regles, etape(p3, 'regles').detail, liste(dehors3)], ['faite', 'echec', LIEN('.claude'), []], JSON.stringify(p3.etapes, null, 1));
  const controle = (c) => s.audit({ projet: p3.projet }).cibles.find((x) => x.projet === p3.projet).controles.find((x) => x.id === c);
  assert.deepEqual(controle('regles-a-jour'), { id: 'regles-a-jour', etat: 'indisponible', raison: LIEN('.claude') });
  lien(path.join(r, 'dehors4'), path.join(d, '.git', 'hooks'));
  assert.deepEqual(controle('crochet-pose'), { id: 'crochet-pose', etat: 'indisponible', raison: LIEN('.git/hooks') });
  assert.deepEqual([liste(dehors3), fs.existsSync(path.join(r, 'dehors4'))], [[], false]);
  // Au compte de même : son `rules` qui est un lien, une règle du profil à y écrire.
  const compte = tmp(); lien(path.join(r, 'dehors5'), path.join(compte, 'rules')); s.config.inventaire['claude-code'] = { home: compte };
  ecrire(path.join(profil, 'arbre', 'rules.yaml'), '- id: francais\n  statement: Répondre en français.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  await s.inventaire(); s.indexer();
  assert.deepEqual(s.audit({ projet: p3.projet }).cibles.find((x) => x.projet === null).controles.find((x) => x.id === 'regles-a-jour'), { id: 'regles-a-jour', etat: 'indisponible', raison: LIEN('rules') });
  assert.equal(fs.existsSync(path.join(r, 'dehors5')), false);
}));

// Lectures dans un dépôt (limite de C levée) : ce que HOLARCH lit d'un dépôt et dont le contenu sort (audit, journal,
// écriture) ne se lit pas à travers un lien symbolique que le conteneur y aurait posé vers un fichier de l'hôte
// (`lireSansLien`) ; le refus se dit (contrôle non disponible, nœud illisible), sans rien arrêter. Chaque fichier de
// l'hôte porte un secret qui, lu, sortirait dans le résultat.
test('Lectures dans un dépôt : un lien symbolique n’y fait lire aucun fichier de l’hôte, et le refus se dit', () => {
  const SECRET = 'SECRET-DE-L-HOTE'; const dehors = tmp();
  const LU = (x) => `${x} est un lien symbolique : rien n’est lu`;
  const sans = (x) => { assert.ok(!JSON.stringify(x).includes(SECRET), JSON.stringify(x, null, 1)); return x; };
  const lien = (cible, contenu, l) => { ecrire(cible, contenu); fs.mkdirSync(path.dirname(l), { recursive: true }); fs.symlinkSync(cible, l); };

  // montage-sensible : une configuration, une feature locale (par un dossier lien, ou hors du dépôt en `../`), les
  // réglages Claude Code du dépôt. Ce qui est lu ailleurs se dit encore ; une exception des crochets n'est pas jugée.
  const d = tmp(); const maison = tmp();
  const vers = (f) => path.relative(path.join(d, '.devcontainer'), path.join(dehors, f));
  ecrire(path.join(d, '.devcontainer', 'devcontainer.json'), JSON.stringify({ image: 'x', runArgs: ['--cap-add=NET_ADMIN'], features: { './locale': {}, [vers('hors')]: {} } }));
  lien(path.join(dehors, 'conf.json'), JSON.stringify({ runArgs: [`--cap-add=${SECRET}`] }), path.join(d, '.devcontainer', 'autre', 'devcontainer.json'));
  ecrire(path.join(dehors, 'locale', 'devcontainer-feature.json'), JSON.stringify({ capAdd: [SECRET] })); fs.symlinkSync(path.join(dehors, 'locale'), path.join(d, '.devcontainer', 'locale'));
  ecrire(path.join(dehors, 'hors', 'devcontainer-feature.json'), JSON.stringify({ capAdd: [SECRET] }));
  lien(path.join(dehors, 'reglages.json'), JSON.stringify({ hooks: { [SECRET]: [] } }), path.join(d, '.claude', 'settings.json'));
  const couches = [{ origine: 'contexte', provenance: 'profil:/arbre/contextes/perso.md', config: { montage_sensible: { exceptions: [{ ecart: 'crochets:.claude/settings.json', pourquoi: 'x' }] } } }];
  const m = sans(executer('montage-sensible', { depot: d, holarch: [], maison, env: {}, maisonsWindows: [], distants: [], couches }, 'audit'));
  assert.deepEqual(m.ecarts.map((e) => e.cle), ['privilege:.devcontainer/devcontainer.json:cap-add:NET_ADMIN']);
  assert.deepEqual(m.indisponible.split(' ; ').sort(), [`${path.join('.devcontainer', vers('hors'), 'devcontainer-feature.json')} : hors du dépôt`, LU('.claude/settings.json'),
    LU('.devcontainer/autre/devcontainer.json'), LU('.devcontainer/locale')].sort());
  assert.deepEqual(m.exceptions.map((x) => [x.ecart, x.utilisee, x.jugee]), [['crochets:.claude/settings.json', false, false]]);

  // journal-tenu : le journal, ou un journal réglé hors du dépôt.
  const { d: dj } = depotGit(); lien(path.join(dehors, 'journal.md'), `## ${SECRET} 2026-10-01\n`, path.join(dj, 'log.md'));
  assert.deepEqual(sans(executer('journal-tenu', { depot: dj, config: { journal: 'log.md' } }, 'audit')), { indisponible: LU('log.md') });
  assert.deepEqual(executer('journal-tenu', { depot: dj, config: { journal: '../journal.md' } }, 'audit'), { indisponible: '../journal.md : hors du dépôt' });

  // donnees-personnelles (audit) : un fichier suivi qui est un lien ; un autre, ordinaire, se lit encore.
  const { d: dp, g: gp } = depotGit(); lien(path.join(dehors, 'note.md'), `${SECRET}\n`, path.join(dp, 'note.md'));
  ecrire(path.join(dp, 'propre.md'), `${SECRET}\n`); gp('add', '.'); gp('commit', '-qm', 'lien');
  assert.deepEqual(executer('donnees-personnelles', { depot: dp, termes: [SECRET], couches: [] }, 'audit'),
    { ecarts: [{ fichier: 'propre.md', ligne: 1, cle: 'propre.md', n: 1, message: 'terme de la liste privée' }], indisponible: LU('note.md') });

  // dependances-vulnerables : un fichier de verrouillage qui est un lien n'est ni lu ni passé à osv-scanner.
  const { d: dv, g: gv } = depotGit(); lien(path.join(dehors, 'package-lock.json'), `{ "${SECRET}": 1 }`, path.join(dv, 'package-lock.json'));
  gv('add', '.'); gv('commit', '-qm', 'lien');
  const osv = path.join(tmp(), 'osv-scanner'); const appels = `${osv}.appels`;
  ecrire(osv, `#!/bin/sh\necho "$@" >> '${appels}'\necho '{"results":[]}'\n`); fs.chmodSync(osv, 0o755);
  assert.deepEqual(executer('dependances-vulnerables', { depot: dv, osv, cache: null, config: {} }, 'audit'), { ecarts: [], indisponible: LU('package-lock.json') });
  assert.equal(fs.existsSync(appels), false);

  // Inventaire de l'arbre : un nœud, le rules.yaml et les questions qui sont des liens ; un dossier `arbre` qui en est un.
  const da = tmp(); ecrire(path.join(da, 'arbre', 'index.md'), '---\ntype: guideline\ntitle: Racine\nstatus: draft\n---\n');
  lien(path.join(dehors, 'noeud.md'), `---\ntype: guideline\ntitle: ${SECRET}\nconfig: { conteneur: { devcontainer: { image: ${SECRET} } } }\n---\n`, path.join(da, 'arbre', 'noeud.md'));
  lien(path.join(dehors, 'rules.yaml'), `- id: fuite\n  statement: ${SECRET}\n  status: stable\n`, path.join(da, 'arbre', 'rules.yaml'));
  lien(path.join(dehors, 'questions.md'), `| Q1 | x | ${SECRET} | gênant |\n`, path.join(da, 'arbre', 'questions.md'));
  const db = tmp(); for (const f of ['index.md', 'autre.md']) ecrire(path.join(dehors, 'arbre', f), `---\ntype: guideline\ntitle: ${SECRET}\n---\n`);
  fs.symlinkSync(path.join(dehors, 'arbre'), path.join(db, 'arbre'));
  const n = sans(inventaireArbre({ depots: [da, db] }, { site: 'local' }));
  const de = (dep, f) => n.find((x) => x.location === path.join(dep, f));
  assert.deepEqual([de(da, 'arbre/noeud.md').attributes.erreur_entete, de(da, 'arbre/index.md').attributes.erreur_regles, de(da, 'arbre/index.md').attributes.erreur_suivi],
    [`fichier illisible : ${LU('arbre/noeud.md')}`, `rules.yaml illisible : ${LU('arbre/rules.yaml')}`, LU('arbre/questions.md')]);
  assert.deepEqual(n.filter((x) => x.location.startsWith(db)).map((x) => [x.node, x.attributes.erreur_entete]), [['/arbre/index.md', `fichier illisible : ${LU('arbre')}`]]);

  // Récolte : le rules.yaml où s'ajoute une règle, un lien vers un fichier de l'hôte illisible, dont l'erreur citerait
  // une ligne : rien n'est lu.
  const dr = tmp(); lien(path.join(dehors, 'invalide.yaml'), `${SECRET}: [\n`, path.join(dr, 'arbre', 'rules.yaml'));
  assert.throws(() => ajouterRegles(dr, path.join(dr, 'arbre', 'rules.yaml'), [{ id: 'r', statement: 'Une règle.' }]), (e) => e.message === 'arbre/rules.yaml est un lien symbolique : rien n’est écrit');
});

// Course entre la vérification et l'écriture (limite de C levée) : un lien posé à la place du fichier juste après
// `cheminSansLien` (ici, pendant la création de son dossier) fait échouer l'écriture ; le fichier de l'hôte reste tel
// quel, son mode compris.
test('ecrireSansLien : un lien posé entre la vérification et l’écriture la fait échouer, rien n’est écrit dehors', () => {
  const d = tmp(); const cible = path.join(tmp(), 'hote.txt'); fs.writeFileSync(cible, 'à moi\n'); fs.chmodSync(cible, 0o644);
  const mkdir = fs.mkdirSync;
  fs.mkdirSync = (...a) => { fs.mkdirSync = mkdir; const r = mkdir(...a); fs.symlinkSync(cible, path.join(d, 'x', 'f.sh')); return r; };
  try { assert.throws(() => ecrireSansLien(d, 'x/f.sh', 'du conteneur\n', 0o755), (e) => e.message === 'x/f.sh est un lien symbolique : rien n’est écrit'); } finally { fs.mkdirSync = mkdir; }
  assert.deepEqual([fs.readFileSync(cible, 'utf8'), fs.statSync(cible).mode & 0o777], ['à moi\n', 0o644]);
  // Sans course, l'écriture se fait ; un fichier présent est remplacé en entier, et prend le mode demandé.
  ecrireSansLien(d, 'y/f.sh', 'un contenu plus long\n'); ecrireSansLien(d, 'y/f.sh', 'court\n', 0o755);
  assert.deepEqual([fs.readFileSync(path.join(d, 'y', 'f.sh'), 'utf8'), fs.statSync(path.join(d, 'y', 'f.sh')).mode & 0o777], ['court\n', 0o755]);
});

// Course entre la vérification et la lecture (limite de C levée) : un lien posé à la place du fichier juste après
// `cheminSansLien` (ici, après le `lstat` qui le vérifie) fait échouer la lecture, ouverte en `O_NOFOLLOW` : rien de
// l'hôte n'est lu, et un lien vers un fichier absent se dit aussi, au lieu de passer pour un fichier absent.
test('lireSansLien : un lien posé entre la vérification et la lecture la fait échouer, rien n’est lu dehors', () => {
  const d = tmp(); const cible = path.join(tmp(), 'hote.txt'); fs.writeFileSync(cible, 'secret de l’hôte\n');
  const f = path.join(d, 'x', 'f.yaml'); fs.mkdirSync(path.dirname(f));
  const lstat = fs.lstatSync;
  const course = (vers) => {
    fs.writeFileSync(f, 'du dépôt\n');
    fs.lstatSync = (q, ...a) => { const r = lstat(q, ...a); if (q === f) { fs.lstatSync = lstat; fs.rmSync(f); fs.symlinkSync(vers, f); } return r; };
    try { assert.throws(() => lireSansLien(d, 'x/f.yaml'), (e) => e.message === 'x/f.yaml est un lien symbolique : rien n’est lu', vers); } finally { fs.lstatSync = lstat; fs.rmSync(f, { force: true }); }
  };
  course(cible); course(path.join(d, 'absent.yaml'));
  // Sans course, le fichier se lit ; absent, il vaut null.
  fs.writeFileSync(f, 'du dépôt\n');
  assert.deepEqual([lireSansLien(d, 'x/f.yaml'), lireSansLien(d, 'x/absent.yaml')], ['du dépôt\n', null]);
});

// Course sur un dossier du chemin (limite de C levée) : `x` remplacé par un lien vers un dossier de l'hôte juste avant
// l'ouverture, puis laissé (la vérification refaite après l'ouverture le voit) ou remis aussitôt (l'inode ouvert n'est
// pas celui que le chemin désigne) : rien n'est écrit ni lu dehors, rien n'est tronqué, aucun descripteur ne reste
// ouvert. Reste ouvert sans `openat` (absent de Node) : le temporaire de l'écriture est créé, vide, au bout du lien quand
// le dossier est remis aussitôt (le lien encore là, il est retiré).
test('ecrireSansLien, lireSansLien : un dossier du chemin remplacé par un lien pendant l’ouverture ne fait rien écrire ni lire dehors', () => {
  const d = tmp(); const hote = tmp(); const x = path.join(d, 'x');
  fs.writeFileSync(path.join(hote, 'f.sh'), 'à moi\n'); fs.chmodSync(path.join(hote, 'f.sh'), 0o644);
  fs.mkdirSync(x); fs.writeFileSync(path.join(x, 'f.sh'), 'du dépôt\n');
  const open = fs.openSync; let pose = false;
  const poser = () => { fs.renameSync(x, `${x}-vrai`); fs.symlinkSync(hote, x); pose = true; };
  const remettre = () => { if (pose) { fs.unlinkSync(x); fs.renameSync(`${x}-vrai`, x); pose = false; } };
  const course = (f, remis) => {
    fs.openSync = (...a) => { fs.openSync = open; poser(); try { return open(...a); } finally { if (remis) remettre(); } };
    try { f(); } finally { fs.openSync = open; remettre(); }
  };
  const refus = (fn, message) => () => assert.throws(fn, (e) => e.message === message);
  const descripteurs = () => fs.readdirSync('/proc/self/fd').length; const avant = descripteurs();
  course(refus(() => ecrireSansLien(d, 'x/f.sh', 'du conteneur\n', 0o755), 'x est un lien symbolique : rien n’est écrit'), false);
  course(refus(() => ecrireSansLien(d, 'x/f.sh', 'du conteneur\n', 0o755), 'x/f.sh : un dossier de son chemin a changé pendant l’ouverture, rien n’est écrit'), true);
  course(refus(() => lireSansLien(d, 'x/f.sh'), 'x est un lien symbolique : rien n’est lu'), false);
  course(refus(() => lireSansLien(d, 'x/f.sh'), 'x/f.sh : un dossier de son chemin a changé pendant l’ouverture, rien n’est lu'), true);
  course(refus(() => ecrireSansLien(d, 'x/neuf.sh', 'du conteneur\n'), 'x/neuf.sh : un dossier de son chemin a changé pendant l’ouverture, rien n’est écrit'), true);
  assert.equal(descripteurs(), avant, 'un refus ferme ce qu’il a ouvert');
  assert.deepEqual([fs.readFileSync(path.join(hote, 'f.sh'), 'utf8'), fs.statSync(path.join(hote, 'f.sh')).mode & 0o777, fs.readFileSync(path.join(x, 'f.sh'), 'utf8')], ['à moi\n', 0o644, 'du dépôt\n']);
  const vide = (n) => `${n}.${process.pid}.holarch`;
  assert.deepEqual([fs.readdirSync(hote).sort(), fs.readFileSync(path.join(hote, vide('f.sh')), 'utf8'), fs.readFileSync(path.join(hote, vide('neuf.sh')), 'utf8'), fs.existsSync(path.join(x, 'neuf.sh'))],
    [['f.sh', vide('f.sh'), vide('neuf.sh')], '', '', false], 'la limite qui reste : le temporaire créé vide au bout du lien, quand le dossier est remis aussitôt');
  // Un lien vers un fichier absent, posé à la place du fichier juste avant l'ouverture : rien n'est créé au bout.
  const bout = path.join(hote, 'cree.sh'); fs.mkdirSync(path.join(d, 'z'));
  fs.openSync = (...a) => { fs.openSync = open; fs.symlinkSync(bout, path.join(d, 'z', 'f.sh')); return open(...a); };
  try { assert.throws(() => ecrireSansLien(d, 'z/f.sh', 'du conteneur\n'), (e) => e.message === 'z/f.sh est un lien symbolique : rien n’est écrit'); } finally { fs.openSync = open; }
  assert.equal(fs.existsSync(bout), false);
});

// Défaut N4 (revue des limites) : `ecrireSansLien` et les écritures des règles générées, des unités systemd et du passage
// du réveil tronquaient le fichier avant de l'écrire. Coupées en route (disque plein, processus tué), elles laissaient un
// fichier à moitié écrit : sans sa marque ou son empreinte, il était pris pour étranger et plus jamais réécrit.
test('écritures du socle : coupées en route, elles laissent le fichier d’avant entier, et aucun temporaire', () => {
  const ecrireFs = fs.writeFileSync;
  // Le disque se remplit au milieu de l'écriture d'un texte que `quand` reconnaît : sa moitié, puis l'erreur.
  const coupee = (faire, quand = () => true) => {
    fs.writeFileSync = (f, t, ...r) => {
      if (!quand(String(t))) return ecrireFs(f, t, ...r);
      ecrireFs(f, String(t).slice(0, Math.ceil(String(t).length / 2)), ...r); throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' });
    };
    try { return faire(); } finally { fs.writeFileSync = ecrireFs; }
  };
  const d = tmp(); const f = path.join(d, 'x', 'f.sh'); ecrire(f, 'ancien contenu\n'); fs.chmodSync(f, 0o640);
  assert.throws(() => coupee(() => ecrireSansLien(d, 'x/f.sh', 'nouveau contenu, plus long\n')), /ENOSPC/);
  assert.deepEqual([fs.readFileSync(f, 'utf8'), fs.readdirSync(path.dirname(f))], ['ancien contenu\n', ['f.sh']]);
  ecrireSansLien(d, 'x/f.sh', 'nouveau\n');
  assert.deepEqual([fs.readFileSync(f, 'utf8'), fs.statSync(f).mode & 0o777], ['nouveau\n', 0o640], 'les droits du fichier remplacé se gardent');
  // Règles générées : coupée, la règle perdait sa marque et n'était plus jamais réécrite.
  const depot = tmp(); const dossier = path.join(depot, '.claude', 'rules', 'holarch'); ecrire(path.join(dossier, 'r.md'), `${MARQUE}\nancienne règle\n`);
  const plan = { fichiers: [{ fichier: 'r.md', contenu: `${MARQUE}\nnouvelle règle\n` }] };
  assert.match(coupee(() => appliquer(depot, dossier, plan)).erreur, /ENOSPC/);
  assert.deepEqual([fs.readFileSync(path.join(dossier, 'r.md'), 'utf8'), fs.readdirSync(dossier)], [`${MARQUE}\nancienne règle\n`, ['r.md']]);
  assert.deepEqual(appliquer(depot, dossier, plan).modifies, ['r.md']);
  // Unités systemd : coupée, l'unité ne correspondait plus à son empreinte, prise pour modifiée à la main. Passage du réveil.
  const { d: distant, unites, accueil } = banc();
  distant.activer('demo'); const unite = path.join(unites, 'holarch-distant-demo.service'); const texte = fs.readFileSync(unite, 'utf8');
  assert.throws(() => coupee(() => distant.activer('demo'), (t) => t.includes('[Service]')), /ENOSPC/);
  assert.equal(fs.readFileSync(unite, 'utf8'), texte);
  assert.equal(distant.activer('demo').nom, 'demo', 'réécrite ensuite, pas prise pour modifiée à la main');
  distant.reveil(); const passage = fs.readFileSync(path.join(accueil, 'distant-reveil'), 'utf8');
  assert.throws(() => coupee(() => distant.reveil(), (t) => /^\d{4}-/.test(t)), /ENOSPC/);
  assert.equal(fs.readFileSync(path.join(accueil, 'distant-reveil'), 'utf8'), passage);
  assert.ok(!fs.readdirSync(unites).some((n) => n.endsWith('.holarch')) && !fs.readdirSync(accueil).some((n) => n.endsWith('.holarch')), 'aucun temporaire laissé');
});

// Réglages du compte (limite de C levée) : le manifeste de ce que HOLARCH pose dans settings.json s'écrit d'abord ;
// refusé, settings.json reste tel quel ; settings.json refusé ensuite, le manifeste revient comme il était. Aucune entrée
// posée par HOLARCH ne manque au manifeste : une fois le lien retiré, ce qui n'est plus voulu se retire.
test('Réglages du compte : un manifeste ou un settings.json refusé ne laisse aucune entrée posée par HOLARCH hors du manifeste', () => {
  const X = 'Read(//**/.env)'; const Y = 'Read(//**/.ssh/**)';
  const vouloir = (cles) => reglagesVoulus({ claude_code: { reglages: cles } }, { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv' });
  for (const [nom, poser, avant, apres, manifeste, attendu] of [
    ['permissions', (h, v) => appliquerPermissions(h, v), [X], [Y], 'permissions.json', [{ permissions: { deny: [Y] } }, { deny: [Y] }]],
    ['reglages', (h, v) => appliquerReglages(h, vouloir(v)), { effortLevel: 'high' }, { model: 'opus' }, 'reglages.json', [{ model: 'opus' }, { cles: { model: 'opus' }, crochets: [] }]]]) {
    const home = tmp(); const lire = (f) => fs.readFileSync(path.join(home, f), 'utf8');
    const etat = () => [lire('settings.json'), lire(path.join('rules', 'holarch', manifeste))];
    poser(home, avant); const pose = etat();
    for (const f of [path.join('rules', 'holarch', manifeste), 'settings.json']) {
      const temporaire = path.join(home, `${f}.${process.pid}.holarch`); fs.symlinkSync(path.join(tmp(), 'x'), temporaire);
      assert.throws(() => poser(home, apres), (e) => e.message === `${f}.${process.pid}.holarch est un lien symbolique : rien n’est écrit`, `${nom} ${f}`);
      assert.deepEqual(etat(), pose, `${nom} ${f}`); fs.rmSync(temporaire);
    }
    poser(home, apres);
    assert.deepEqual(etat().map((x) => JSON.parse(x)), attendu, nom);
  }
});

// Copie de service (décision copie-de-service) : git et tar réels sur un dépôt jetable ; npm et systemctl remplacés.
import { creerService, binaireService, copieEnService, copierGitleaks } from '../src/service.js';

test('copie de service : le gitleaks de l’hôte copié pour les conteneurs générés, seulement s’il diffère, jamais à moitié', () => {
  const maison = tmp(); const bin = path.join(tmp(), 'gitleaks'); const f = path.join(maison, '.local', 'share', 'holarch', 'outils', 'gitleaks');
  assert.match(copierGitleaks(null, maison).etat, /^absent de l’hôte/); assert.ok(!fs.existsSync(f), 'rien n’est écrit sans gitleaks');
  fs.writeFileSync(bin, '#!/bin/sh\necho 8.30.1\n'); fs.chmodSync(bin, 0o700);
  assert.equal(copierGitleaks(bin, maison).etat, `copié (${f})`);
  assert.deepEqual([fs.readFileSync(f, 'utf8'), fs.statSync(f).mode & 0o777], ['#!/bin/sh\necho 8.30.1\n', 0o755], 'exécutable par l’utilisateur du conteneur');
  assert.equal(copierGitleaks(bin, maison).etat, 'inchangé');
  fs.writeFileSync(bin, '#!/bin/sh\necho 8.31.0\n');
  assert.equal(copierGitleaks(bin, maison).etat, `copié (${f})`, 'une mise à jour de l’hôte suit à la pose suivante');
  assert.deepEqual(fs.readdirSync(path.dirname(f)), ['gitleaks'], 'aucun fichier temporaire laissé');
});

test('copie de service : posée d\'un commit vérifié, bascule, retour arrière, points d\'entrée, copie de travail cassée sans effet', () => {
  const src = tmp(); const accueil = tmp(); const unites = tmp(); const home = tmp();
  const g = (...a) => { const r = spawnSync('git', ['-C', src, '-c', 'user.name=t', '-c', 'user.email=t@exemple.invalid', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  const version = (n) => { fs.mkdirSync(path.join(src, 'bin'), { recursive: true }); fs.writeFileSync(path.join(src, 'bin', 'holarch.js'), `console.log('v${n}');\n`); g('add', '-A'); g('commit', '-qm', `v${n}`); return g('rev-parse', '--short=12', 'HEAD'); };
  g('init', '-q'); fs.writeFileSync(path.join(src, 'package.json'), '{}\n');
  const c1 = version(1);
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ autre: 1, mcpServers: { holarch: { command: 'node', args: ['--no-warnings', path.join(src, 'bin', 'holarch.js'), 'mcp'] } } }));
  let testsVerts = false; const appels = [];
  const lancer = (cmd, args, o) => {
    if (cmd !== 'npm') return spawnSync(cmd, args, o);
    appels.push(`${args[0]} ${o.cwd}`);
    if (args[0] === 'ci') fs.mkdirSync(path.join(o.cwd, 'node_modules'));
    const rouge = args[0] === 'test' && !testsVerts;
    return { status: rouge ? 1 : 0, stdout: rouge ? "✔ vert (1.2ms)\n✖ intermittent (3.4ms)\nℹ fail 1\n\n✖ failing tests:\n\ntest at test/a.test.js:3:1\n✖ intermittent (3.4ms)\n  'x'\n" : '', stderr: '' };
  };
  // systemctl répond comme le vrai : une unité activée et active, systemd en marche.
  const systemctl = (args) => ({ status: 0, stdout: { 'is-enabled': 'enabled\n', 'is-active': 'active\n', 'is-system-running': 'running\n' }[args[0]] ?? '', stderr: '' });
  // La règle de veille se lit à la pose : illisible, la pose continue et le dit sur la ligne du gardien.
  const sv = creerService({ accueil, comptes: [{ nom: 'perso', home }], veille: () => { throw new Error('arbre du profil illisible'); } }, { source: src, unites, systemctl, npm: 'npm', lancer, node: '/opt/node/bin/node' });

  assert.equal(sv.etat().copie, null);
  assert.equal(binaireService(accueil), path.resolve('bin/holarch.js'), 'sans copie : le code qui s\'exécute');
  assert.throws(() => sv.poser(), /npm test rouge \(1 en échec : intermittent\) : rien n'est posé/, 'les tests en échec se nomment');
  assert.ok(!fs.existsSync(path.join(accueil, 'service', c1)));
  testsVerts = true;
  fs.writeFileSync(path.join(src, 'brouillon.txt'), 'x');
  assert.throws(() => sv.poser(), /non propre/); fs.rmSync(path.join(src, 'brouillon.txt'));

  const r1 = sv.poser();
  assert.equal(r1.commit, c1); assert.ok(r1.nouvelle);
  assert.deepEqual(appels.map((a) => a.split(' ')[0]), ['test', 'test', 'ci'], 'les tests dans la source, npm ci dans la copie');
  assert.equal(appels.at(-1), `ci ${path.join(accueil, 'service', `${c1}.pose-${process.pid}`)}`);
  const bin = binaireService(accueil);
  assert.equal(bin, path.join(accueil, 'service', 'courant', 'bin', 'holarch.js'));
  assert.equal(fs.readlinkSync(path.join(accueil, 'service', 'courant')), c1, 'lien relatif');
  assert.equal(copieEnService(accueil).commit, c1); assert.ok(!fs.existsSync(path.join(accueil, 'service', c1, '.git')), 'un export, pas un dépôt');
  // Points d'entrée : interface absente laissée, minuteur d'import marqué sur le lien, entrée MCP réécrite (le reste gardé).
  assert.deepEqual(r1.points.map((p) => [p.point, p.etat.split(' ')[0]]), [['interface', 'absente'], ['import', 'posé'], ['recolte', 'posé'], ['reveil', 'absente'], ['veille', 'erreur'], ['gitleaks des conteneurs', 'absent'], ['mcp perso', 'posé']]);
  assert.equal(r1.points.find((p) => p.point === 'veille').message, 'arbre du profil illisible');
  const unite = fs.readFileSync(path.join(unites, 'holarch-import.service'), 'utf8');
  assert.match(unite, /^# Écrit par HOLARCH/); assert.ok(unite.includes(`"${bin}" inventaire`)); assert.ok(fs.existsSync(path.join(unites, 'holarch-import.timer')));
  assert.ok(fs.readFileSync(path.join(unites, 'holarch-recolte.service'), 'utf8').includes(`"${bin}" recolte --proposer`));
  assert.match(fs.readFileSync(path.join(unites, 'holarch-recolte.timer'), 'utf8'), /OnCalendar=Mon \*-\*-\* 08:00\nPersistent=true/);
  const cfg = JSON.parse(fs.readFileSync(path.join(home, '.claude.json'), 'utf8'));
  assert.deepEqual(cfg.mcpServers.holarch.args, ['--no-warnings', bin, 'mcp']); assert.equal(cfg.autre, 1);

  // Critère : la copie de travail cassée, la copie en service tourne.
  fs.writeFileSync(path.join(src, 'bin', 'holarch.js'), 'console.log(\n');
  assert.equal(spawnSync(process.execPath, [bin], { encoding: 'utf8' }).stdout, 'v1\n');
  g('checkout', '-q', '--', '.');

  const c2 = version(2); const c3 = version(3);
  assert.equal(sv.etat().retard, 2);
  assert.throws(() => sv.poser(c2), /n'est pas HEAD/, 'une copie neuve ne se tire que de HEAD');
  const r3 = sv.poser();
  assert.deepEqual([r3.commit, r3.precedent, r3.supprimees], [c3, c1, []]);
  assert.equal(r3.points.find((p) => p.point === 'mcp perso').etat, 'inchangé', 'le chemin du lien ne change pas d\'une pose à l\'autre');
  fs.writeFileSync(path.join(src, 'brouillon.txt'), 'x');
  const retour = sv.poser(c1);
  assert.deepEqual([retour.commit, retour.nouvelle, retour.precedent], [c1, false, c3], 'retour arrière sans condition');
  assert.equal(spawnSync(process.execPath, [bin], { encoding: 'utf8' }).stdout, 'v1\n');
  fs.rmSync(path.join(src, 'brouillon.txt'));
  const c4 = version(4); const r4 = sv.poser();
  assert.deepEqual([r4.commit, r4.precedent, r4.supprimees], [c4, c1, [c3]], 'gardées : la posée et la précédente');
  assert.deepEqual(sv.etat().copies.sort(), [c1, c4].sort()); assert.equal(sv.etat().retard, 0);
  // Reposer la copie en service garde celle du retour arrière (défaut trouvé à la passe globale, A2).
  const r4bis = sv.poser();
  assert.deepEqual([r4bis.commit, r4bis.supprimees], [c4, []]); assert.deepEqual(sv.etat().copies.sort(), [c1, c4].sort());

  // Un minuteur posé à la main n'est jamais touché ; le reste passe.
  fs.writeFileSync(path.join(unites, 'holarch-import.timer'), '[Timer]\nOnCalendar=daily\n');
  const r5 = sv.poser(c1);
  assert.equal(r5.points.find((p) => p.point === 'import').etat, 'erreur');
  assert.equal(fs.readFileSync(path.join(unites, 'holarch-import.timer'), 'utf8'), '[Timer]\nOnCalendar=daily\n');
});

test('récolte : messages de l’auteur et mémoires de retour, sans injections, doublons ni secrets ; redites comptées par le socle', () => {
  const home = tmp(); const depot = tmp();
  const u = (uuid, at, texte, x = {}) => JSON.stringify({ type: 'user', uuid, sessionId: x.s || 'A', timestamp: at, cwd: x.cwd || depot, message: { role: 'user', content: texte }, ...x.e });
  ecrire(path.join(home, 'projects', 'p', 'A.jsonl'), [
    u('1', '2026-10-01T10:00:00Z', 'Vérifie toujours les tests avant de rendre la main, sans exception.'),
    u('2', '2026-10-01T10:01:00Z', 'oui'),
    u('3', '2026-10-01T10:02:00Z', '<command-name>/clear</command-name> et la suite du texte'),
    u('4', '2026-10-01T10:03:00Z', 'Un texte méta assez long pour passer la longueur.', { e: { isMeta: true } }),
    u('5', '2026-09-01T10:00:00Z', 'Un message trop ancien pour la période retenue ici.'),
    JSON.stringify({ type: 'user', uuid: '6', sessionId: 'A', timestamp: '2026-10-01T10:04:00Z', cwd: depot, message: { content: [{ type: 'text', text: 'Réponds en français, toujours, quoi qu’il arrive.' }, { type: 'tool_result', content: 'ignoré' }] } }),
    u('7', '2026-10-01T10:05:00Z', 'Voici ma clé SECRET à ne jamais envoyer nulle part.'),
  ].join('\n'));
  ecrire(path.join(home, 'projects', 'p', 'B.jsonl'), [
    u('1', '2026-10-01T10:00:00Z', 'Vérifie toujours les tests avant de rendre la main, sans exception.', { s: 'B' }), // recopié par une reprise
    u('8', '2026-10-02T09:00:00Z', 'Lance npm test avant de me rendre la main, merci.', { s: 'B', cwd: '/ailleurs' }),
  ].join('\n'));
  ecrire(path.join(home, 'projects', 'p', 'A', 'subagents', 'agent-1.jsonl'), u('9', '2026-10-01T11:00:00Z', 'Invite écrite par un agent, pas par l’auteur.'));
  const memoire = path.join(home, 'projects', 'p', 'memory', 'tests.md');
  ecrire(memoire, '---\nname: tests-verts\ntype: feedback\n---\nToujours lancer les tests avant de rendre.\n');
  const fiches = [{ id: 'mem1', kind: 'memory', name: 'tests-verts', location: memoire, links: { project: ['holarch:project:demo'] }, attributes: { type: 'feedback', modifie: '2026-10-03T00:00:00Z' } },
    { id: 'mem2', kind: 'memory', name: 'etat', location: memoire, attributes: { type: 'project', modifie: '2026-10-03T00:00:00Z' } }];
  // Un gitleaks fictif : il signale tout fichier qui contient SECRET.
  const faux = path.join(tmp(), 'gitleaks');
  ecrire(faux, '#!/bin/sh\nout=""\nfor f in "$2"/*; do case "$(cat "$f")" in *SECRET*) out="$out${out:+,}{\\"File\\":\\"$f\\",\\"RuleID\\":\\"x\\"}";; esac; done\necho "[$out]"\n[ -z "$out" ]\n');
  fs.chmodSync(faux, 0o755);
  let envoye = null;
  const regroupeur = (texte) => { envoye = texte; return { modele: 'faux', cout_usd: 0.01, groupes: [
    { id: 'tests-avant-de-rendre', consigne: 'Lancer les tests avant de rendre la main.', pourquoi: 'Un rendu non vérifié casse la suite.', refs: ['m0', '[m2]', 'n3', 'm99', 'm0'], couverte_par: 'verifier', contredit: [] },
    { id: 'francais', consigne: 'Répondre en français.', pourquoi: 'Langue de l’auteur.', refs: ['m1'], couverte_par: null, contredit: [] }] }; };
  const o = { comptes: [{ nom: null, home }], fiches, projets: [{ id: 'holarch:project:demo', nom: 'demo', location: depot }], regles: [{ id: 'verifier', enonce: 'Les tests sont verts avant de rendre.', statut: 'stable' }, { id: 'refusee', enonce: 'Une consigne refusée.', statut: 'deprecated' }],
    gitleaksBin: faux, regroupeur, depuis: '2026-09-15T00:00:00Z', jusqua: '2026-10-05T00:00:00Z' };
  const r = recolter(o);
  assert.deepEqual([r.candidats.messages, r.candidats.memoires, r.candidats.sessions, r.secrets_retires], [4, 1, 2, 1], 'un message recopié compte une fois ; sous-agent, méta, injecté, court, ancien écartés');
  assert.match(envoye, /^Règles existantes :\n- verifier : Les tests sont verts avant de rendre\.\n- refusee \(refusée\) : Une consigne refusée\.\n/);
  assert.match(envoye, /\[m1\] Réponds en français/); assert.match(envoye, /\[n3\] tests-verts : Toujours lancer/);
  assert.doesNotMatch(envoye, /SECRET|ignoré|agent|oui\n/);
  assert.deepEqual(r.redites, [{ id: 'tests-avant-de-rendre', consigne: 'Lancer les tests avant de rendre la main.', pourquoi: 'Un rendu non vérifié casse la suite.', couverte_par: 'verifier', contredit: [],
    elements: 3, sessions: 3, sources: ['A', 'B', 'memoire:mem1'], projets: ['demo'], projets_ids: ['holarch:project:demo'], hors_projet: 1, memoires: 1,
    premiere: '2026-10-01T10:00:00Z', derniere: '2026-10-03T00:00:00Z' }], 'une référence inconnue ignorée, un groupe d’une session écarté');
  envoye = null;
  assert.equal(recolter({ ...o, aBlanc: true }).a_blanc, true); assert.equal(envoye, null, 'à blanc : rien n’est envoyé');
  assert.match(recolter({ ...o, gitleaksBin: null }).indisponible, /gitleaks absent/); assert.equal(envoye, null, 'sans gitleaks : rien n’est envoyé');
});

test('claude : le chemin réglé (acces_distant.claude) sert aussi à la récolte, au PATH réduit d’un service', () => {
  const avant = { HOME: process.env.HOME, PATH: process.env.PATH };
  // Aucun vrai claude atteignable : HOME et PATH d'essai (défaut A8).
  process.env.HOME = tmp(); process.env.PATH = '/usr/bin:/bin';
  try {
    const appele = path.join(tmp(), 'appele'); const faux = path.join(tmp(), 'claude-ailleurs');
    ecrire(faux, `#!/bin/sh\ncat > /dev/null\ntouch "${appele}"\necho '{"structured_output":{"groupes":[]},"total_cost_usd":0}'\n`); fs.chmodSync(faux, 0o755);
    const gitleaks = path.join(tmp(), 'gitleaks'); ecrire(gitleaks, '#!/bin/sh\necho "[]"\n'); fs.chmodSync(gitleaks, 0o755);
    assert.deepEqual([binaireClaude({ acces_distant: { claude: faux } }), binaireClaude({}), binaireClaude({ acces_distant: { claude: '/absent/claude' } })], [faux, null, null]);
    const cc = tmp();
    ecrire(path.join(cc, 'projects', 'p', 'A.jsonl'), JSON.stringify({ type: 'user', uuid: '1', sessionId: 'A', timestamp: new Date().toISOString(), cwd: '/x', message: { role: 'user', content: 'Vérifie toujours les tests avant de rendre la main, sans exception.' } }));
    const s = new Socle({ site: 'local', donnees: tmp(), web: {}, inventaire: {}, import: { 'claude-code-transcriptions': { home: cc } }, controles: { gitleaks }, acces_distant: { claude: faux } });
    s.indexer();
    const r = s.recolte({ depuis: new Date(Date.now() - 864e5).toISOString() });
    assert.ok(fs.existsSync(appele), `le claude réglé est celui que lance la récolte : ${JSON.stringify(r).slice(0, 300)}`);
  } finally { for (const [k, v] of Object.entries(avant)) process.env[k] = v; }
});

test('récolte : une redite nouvelle devient une règle brouillon au nœud commun de ses sources ; contradictions à trancher', () => {
  const g = (id, x = {}) => ({ id, consigne: `Consigne ${id}.`, pourquoi: `Raison ${id}.`, couverte_par: null, contredit: [], elements: 2, sessions: 2, sources: ['s1', 's2'],
    projets: [], projets_ids: [], hors_projet: 0, memoires: 0, premiere: '2026-10-01T00:00:00Z', derniere: '2026-10-03T00:00:00Z', ...x });
  const redites = [g('couverte', { couverte_par: 'verifier' }), g('contraire', { contredit: ['avis'] }), g('commune', { projets: ['demo', 'b'], projets_ids: ['holarch:project:demo', 'holarch:project:b'] }),
    g('du-projet', { projets: ['demo'], projets_ids: ['holarch:project:demo'] }), g('melee', { projets: ['demo'], projets_ids: ['holarch:project:demo'], hors_projet: 1 })];
  const t = trier(redites);
  assert.deepEqual([t.couvertes.map((x) => x.id), t.a_trancher.map((x) => x.id), t.proposees.map((x) => [x.id, x.noeud.profil ? 'profil' : x.noeud.nom])],
    [['couverte'], ['contraire'], [['commune', 'profil'], ['du-projet', 'demo'], ['melee', 'profil']]], 'un projet seul et rien hors projet : ce projet ; sinon le profil');
  const donnees = tmp(); const profil = tmp(); const demo = tmp();
  ecrire(path.join(profil, 'arbre', 'index.md'), '---\ntype: guideline\ntitle: Profil\nstatus: draft\n---\n');
  ecrire(path.join(profil, 'arbre', 'rules.yaml'), '# Règles du profil (commentaire gardé)\n- id: melee\n  statement: "Déjà là."\n  status: deprecated\n');
  const s = new Socle({ site: 'local', profil, donnees, web: {}, inventaire: {}, import: {} });
  const noeud = (id, location, attributes) => ({ id, kind: 'node', name: id, status: 'proposed', provenance: { source: 't' }, location, node: '/arbre/index.md', attributes });
  s.catalogue.remplacer([
    noeud('holarch:node:profil', path.join(profil, 'arbre', 'index.md'), { type: 'guideline', arbre: 'profil', racine: true }),
    { ...noeud('holarch:node:ctx', path.join(profil, 'arbre', 'contextes', 'perso.md'), { type: 'context', arbre: 'profil', projects: ['holarch:project:demo'] }), node: '/arbre/contextes/perso.md' },
    { id: 'holarch:project:demo', kind: 'project', name: 'demo', description: 'Un projet sans arbre', status: 'active', provenance: { source: 't' }, location: demo, attributes: {} },
  ]);
  s.indexer();
  const p = s.proposerRegles(redites, { at: '2026-10-07' });
  const fp = path.join(profil, 'arbre', 'rules.yaml'); const fd = path.join(demo, 'arbre', 'rules.yaml');
  assert.deepEqual(p.ecrites, [{ id: 'commune', fichier: fp }, { id: 'du-projet', fichier: fd }]);
  assert.deepEqual([p.deja, p.couvertes, p.a_trancher], [[{ id: 'melee', fichier: fp }], 1, [{ id: 'contraire', consigne: 'Consigne contraire.', contredit: ['avis'] }]], 'un id déjà présent, même refusé, n’est pas repris');
  const lu = fs.readFileSync(fp, 'utf8');
  assert.match(lu, /^# Règles du profil \(commentaire gardé\)\n- id: melee\n/, 'ce qui était là reste tel quel');
  assert.deepEqual(YAML.parse(lu).at(-1), { id: 'commune', statement: 'Consigne commune.', why: 'Raison commune.', level: 'reminder', status: 'draft', source: 'harvest',
    harvest: { at: '2026-10-07', sessions: 2, projects: ['demo', 'b'], first: '2026-10-01', last: '2026-10-03', refs: ['s1', 's2'] } });
  assert.match(fs.readFileSync(path.join(demo, 'arbre', 'index.md'), 'utf8'), /^---\ntype: guideline\nid: demo\n/, 'arbre du projet posé comme à la création');
  assert.equal(YAML.parse(fs.readFileSync(fd, 'utf8'))[0].id, 'du-projet');
  assert.equal(ajouterRegles(demo, fd, [{ id: 'du-projet', statement: 'x' }]).ecrites.length, 0, 'rejouer n’ajoute rien');
  assert.throws(() => s.recolte({ jusqua: '2026-10-06T00:00:00Z', proposer: true }), /rejeu/);
});

test('eprouver : un test neuf rouge sur le parent ou sur un mutant ; vert, ou rouge au seul chargement, il ne prouve rien', async () => {
  const { eprouver } = await import('../bin/eprouver.js');
  const { spawnSync } = await import('node:child_process');
  const r = tmp(); const ecrire = (f, t) => { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), t); };
  const g = (...a) => spawnSync('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@exemple.invalid', '-c', 'core.hooksPath=/dev/null', ...a], { encoding: 'utf8' });
  ecrire('package.json', '{ "type": "module" }');
  ecrire('src/a.js', 'export const double = (x) => x * 2;\n');
  ecrire('test/a.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport * as a from '../src/a.js';\ntest('double', () => assert.equal(a.double(2), 4));\n");
  g('init', '-q'); g('add', '.'); g('commit', '-qm', 'a');
  // La correction : `triple`, et ses tests (l'un importe le module entier, l'autre le nom, qui manque au parent).
  ecrire('src/a.js', 'export const double = (x) => x * 2;\nexport const triple = (x) => x * 3;\n');
  fs.appendFileSync(path.join(r, 'test/a.test.js'), "test('triple', () => assert.equal(a.triple?.(2), 6));\n");
  ecrire('test/b.test.js', "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { triple } from '../src/a.js';\ntest('triple nommé', () => assert.equal(triple(2), 6));\n");
  const e = (o) => eprouver({ racine: r, ...o });
  assert.equal(e({ mode: 'parent', motif: '^triple$', fichiers: ['src/a.js'] }).code, 0);
  assert.match(e({ mode: 'parent', motif: 'triple nommé', fichiers: ['src/a.js'] }).message, /seul le chargement échoue \(test\/b\.test\.js\)/);
  assert.equal(e({ mode: 'parent', motif: '^double$', fichiers: ['src/a.js'] }).code, 1, 'vert sur le parent');
  assert.equal(e({ mode: 'mutant', motif: '^triple$', fichier: 'src/a.js', expression: 'x \\* 3', remplacement: 'x * 2' }).code, 0);
  assert.equal(e({ mode: 'mutant', motif: '^double$', fichier: 'src/a.js', expression: 'x \\* 2', remplacement: 'x + x' }).code, 1, 'mutant équivalent');
  assert.match(e({ mode: 'mutant', motif: '^double$', fichier: 'src/a.js', expression: 'absent', remplacement: '' }).message, /mutation sans effet/);
  assert.match(e({ mode: 'parent', motif: 'aucun test', fichiers: ['src/a.js'] }).message, /aucun test ne correspond/);
  ecrire('test/c.test.js', "import test from 'node:test';\ntest('rouge', () => { throw new Error('x'); });\n");
  assert.match(e({ mode: 'parent', motif: '^rouge$', fichiers: ['src/a.js'] }).message, /déjà rouge sur la copie telle quelle/);
  assert.equal(e({ mode: 'inconnu', motif: 'x' }).code, 2);
  // La copie temporaire est retirée ; la copie de travail n'a pas bougé.
  assert.match(fs.readFileSync(path.join(r, 'src/a.js'), 'utf8'), /triple/);
});

test('rapport : le rapport d’un sous-agent se lit dans sa transcription, le plus long des messages après son dernier outil de travail ; un identifiant se donne par un début qui n’en désigne qu’un', async () => {
  const { rapportSousAgent } = await import('../src/transcription.js');
  const home = tmp(); const sa = path.join(home, 'projects', '-dossier', 'session-1', 'subagents'); fs.mkdirSync(sa, { recursive: true });
  const ligne = (contenu) => JSON.stringify({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: contenu } });
  // Sous-agent de fond : le rapport est l'argument de l'outil de remise, après un dernier texte court.
  fs.writeFileSync(path.join(sa, 'agent-abc123.jsonl'), [ligne([{ type: 'text', text: 'Rapport intermédiaire' }]), ligne([{ type: 'text', text: 'Je rédige.' }]),
    ligne([{ type: 'thinking', thinking: '' }]), ligne([{ type: 'tool_use', name: 'SubagentHandback', input: { message: '# Contre-épreuve\nTout tient.' } }]),
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } })].join('\n') + '\n');
  fs.writeFileSync(path.join(sa, 'agent-abc123.meta.json'), JSON.stringify({ description: 'Contre-épreuve fictive' }));
  // Sous-agent ordinaire : son dernier texte.
  fs.writeFileSync(path.join(sa, 'agent-abd456.jsonl'), [ligne([{ type: 'text', text: 'Avant' }]), ligne([{ type: 'text', text: 'Rapport final' }])].join('\n') + '\n');
  // Une session reprise garde une copie de ses sous-agents : la plus récente se lit, l'autre se dit.
  const reprise = path.join(home, 'projects', '-dossier', 'session-0', 'subagents'); fs.mkdirSync(reprise, { recursive: true });
  fs.writeFileSync(path.join(reprise, 'agent-abd456.jsonl'), ligne([{ type: 'text', text: 'Rapport de la copie ancienne' }]) + '\n');
  fs.utimesSync(path.join(reprise, 'agent-abd456.jsonl'), new Date('2026-01-01'), new Date('2026-01-01'));
  const r = rapportSousAgent([home], 'abc');
  assert.deepEqual([r.id, r.description, r.rapport, r.copies], ['abc123', 'Contre-épreuve fictive', '# Contre-épreuve\nTout tient.', []]);
  const d = rapportSousAgent([home], 'agent-abd456');
  assert.deepEqual([d.rapport, d.copies], ['Rapport final', [path.join(reprise, 'agent-abd456.jsonl')]]);
  assert.throws(() => rapportSousAgent([home], 'ab'), /ambigu, 2 sous-agents/);
  assert.throws(() => rapportSousAgent([home], 'zzz'), /aucun sous-agent zzz/);
  assert.throws(() => rapportSousAgent([home], ''), /identifiant du sous-agent attendu/);
  // Remise refusée (cas du 2026-10-10) : le rapport écrit, puis la remise répétée, raccourcie, puis une explication
  // courte ; le rapport est le plus long des messages écrits après le dernier outil de travail, pas le dernier.
  const outil = (nom) => ligne([{ type: 'tool_use', name: nom, input: { command: 'npm test' } }]);
  const refus = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', is_error: true, content: 'refusé' }] } });
  const long = `# Contre-épreuve\n${'Détail. '.repeat(40)}`;
  fs.writeFileSync(path.join(sa, 'agent-cde789.jsonl'), [ligne([{ type: 'text', text: `Avant le travail : ${'x'.repeat(500)}` }]), outil('Bash'),
    ligne([{ type: 'text', text: long }]), ligne([{ type: 'tool_use', name: 'SubagentHandback', input: { message: long.slice(0, 100) } }]), refus,
    ligne([{ type: 'text', text: 'La remise est refusée.' }])].join('\n') + '\n');
  assert.equal(rapportSousAgent([home], 'cde').rapport, long);
  // Un texte long suivi d'un outil de travail n'est pas le rapport : le court écrit après l'outil l'est.
  fs.writeFileSync(path.join(sa, 'agent-cdf000.jsonl'), [ligne([{ type: 'text', text: long }]), outil('Read'), ligne([{ type: 'text', text: 'Rapport court' }])].join('\n') + '\n');
  assert.equal(rapportSousAgent([home], 'cdf').rapport, 'Rapport court');
  // La commande lit les transcriptions du compte de la configuration, et ne fait rien d'autre.
  const accueil = tmp(); fs.writeFileSync(path.join(accueil, 'config.yaml'), `import:\n  claude-code-transcriptions: { home: ${JSON.stringify(home)} }\n`);
  const holarch = (...a) => spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), ...a], { encoding: 'utf8', env: { ...process.env, HOLARCH_HOME: accueil } });
  const ok = holarch('rapport', 'abc');
  assert.equal(ok.status, 0, ok.stderr); assert.match(ok.stdout, /^# abc123 — Contre-épreuve fictive\n/); assert.match(ok.stdout, /Tout tient\.\n$/);
  const ko = holarch('rapport', 'ab');
  assert.equal(ko.status, 1); assert.match(ko.stderr, /holarch rapport : identifiant ambigu/);
  assert.deepEqual(fs.readdirSync(accueil), ['config.yaml']);
});

// C2 (famille Gardes muettes, choix de l'auteur du 2026-10-13) : un inventaire passé entre `git init` et le premier
// commit identifie le projet par son chemin ; la création reprenait cet identifiant périmé, le déclarait et le commitait
// dans le profil, puis ne trouvait plus le projet. L'identifiant se compare au premier commit : l'inventaire est refait.
import { racine as premierCommit, tireDuCommit } from '../src/inventaire/depots-git.js';
test('C2 : la création ne déclare pas l’identifiant de chemin qu’un inventaire a pris avant le premier commit', () => gitIsole(async () => {
  const { r, s, etats, git } = await bancCreation();
  const d = path.join(r, 'neuf'); assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', d]).status, 0);
  await s.inventaire(); s.indexer();
  const perime = s.fiches({ kind: 'project' }).find((p) => p.location === d)?.id;
  assert.ok(perime && !/^holarch:project:[0-9a-f]{12}$/.test(perime), `identifiant de chemin attendu avant le premier commit : ${perime}`);
  const p = await creerProjet(s, { nom: 'neuf', types: ['methode'] });
  const id = `holarch:project:${premierCommit(d)}`;
  const contexte = fs.readFileSync(path.join(r, 'profil', 'arbre', 'contextes', 'perso.md'), 'utf8');
  assert.deepEqual([p.projet, contexte.includes(id), contexte.includes(perime), etats(p).identite, etats(p).declaration, etats(p).regles], [id, true, false, 'faite', 'faite', 'faite'], JSON.stringify(p.etapes, null, 1));
  assert.equal(git(path.join(r, 'profil'), 'log', '-1', '--format=%s'), 'Déclarer le projet neuf');
  // Tiré du premier commit : lui seul, ou suivi du chemin quand deux clones du site le partagent ; jamais sans commit.
  assert.deepEqual([['holarch:project:abc', 'abc'], ['holarch:project:abc:/a/neuf', 'abc'], ['holarch:project:abcd', 'abc'], ['holarch:project:/a/abc', 'abc'], ['holarch:project:abc', null]]
    .map(([x, c]) => tireDuCommit(x, c)), [true, true, false, false, false]);
}));

// ---- Famille « Gardes muettes, rejeux, réglages posés à la main », lot 2 (rejeu et accès distant ; choix de l'auteur du
// 2026-10-13). « GitHub » : des dépôts nus sous un dossier `github.com`, créés par un faux gh, comme plus haut.
function ghFictif(github) {
  return (args) => {
    if (args[0] === 'api' && args[1] === 'user') return { status: 0, stdout: 'alice\n' };
    if (args[0] === 'repo' && args[1] === 'view') return { status: fs.existsSync(path.join(github, args[2])) ? 0 : 1, stdout: '' };
    if (args[0] === 'repo' && args[1] === 'create') { spawnSync('git', ['init', '-q', '--bare', path.join(github, args[2])]); return { status: 0, stdout: '' }; }
    return { status: 0, stdout: '' };
  };
}

// R1 : rejouée, la création disait « github : déjà là » sur une branche suivie mais en avance sur son amont. Les commits
// non poussés se comptent et se disent ; ils ne sont pas envoyés (l'envoi revient à l'auteur) : un geste, avec la commande.
test('R1 : rejouée, la création dit les commits non poussés au lieu de « github : déjà là », sans les envoyer', () => gitIsole(async () => {
  const github = path.join(tmp(), 'github.com');
  const { r, s, etats, git } = await bancCreation({ creation: { etapes: { github: true, conteneur: false, distant: false } } });
  const d = path.join(r, 'neuf'); const nu = path.join(github, 'alice', 'neuf');
  const creer = (aBlanc = false) => creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc }, { gh: ghFictif(github), urlDepot: (o, n) => path.join(github, o, n) });
  const p1 = await creer();
  assert.equal(etats(p1).github, 'faite', JSON.stringify(p1.etapes, null, 1));
  const envoye = git(nu, 'rev-parse', 'main');
  ecrire(path.join(d, 'note.md'), 'en cours\n'); git(d, 'add', 'note.md'); git(d, 'commit', '-qm', 'Travail en cours');
  for (const aBlanc of [true, false]) {
    const e = (await creer(aBlanc)).etapes.find((x) => x.etape === 'github');
    assert.deepEqual([e.etat, e.detail, e.geste?.commande], ['geste', `${nu} : 1 commit(s) non poussé(s)`, `git -C ${d} push`], JSON.stringify(e));
  }
  assert.equal(git(nu, 'rev-parse', 'main'), envoye, 'rien n’est envoyé');
  git(d, 'push', '-q');
  assert.equal(etats(await creer()).github, 'deja');
}));

// R2 : rejouée, la création disait « accès distant : service actif » dès que l'unité existait, arrêtée comprise. Elle lit
// l'état (`actif`, que rend `liste`) ; un service arrêté est rallumé, à blanc il est dit à rallumer.
test('R2 : rejouée, la création ne dit l’accès distant déjà là que s’il est actif ; arrêté, elle le rallume', () => gitIsole(async () => {
  const { s } = await bancCreation({ creation: { etapes: { github: false, conteneur: false, distant: true } } });
  const poses = []; const activations = [];
  const distant = { liste: () => poses, activer: (id) => {
    activations.push(id); const p = poses.find((x) => x.projet === id);
    if (p) p.actif = true; else poses.push({ nom: 'neuf', chemin: null, projet: id, actif: true });
    return { unite: 'holarch-distant-neuf.service' };
  } };
  const etape = async (aBlanc = false) => { const e = (await creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc }, { distant })).etapes.find((x) => x.etape === 'distant'); return [e.etat, e.detail]; };
  assert.deepEqual(await etape(), ['faite', 'service holarch-distant-neuf.service']);
  assert.deepEqual(await etape(), ['deja', 'service actif']);
  poses[0].actif = false;
  assert.deepEqual([await etape(true), activations.length], [['a-faire', 'service neuf arrêté : à rallumer'], 1], 'à blanc, rien n’est rallumé');
  assert.deepEqual([await etape(), activations.length], [['faite', 'service holarch-distant-neuf.service rallumé (il était arrêté)'], 2]);
  assert.deepEqual(await etape(), ['deja', 'service actif']);
}));

// Voisin du lot 1 : à blanc, sur un dépôt sans commit, la création disait attendre « l’inventaire », qui n'y peut rien :
// l'identifiant du projet vient de son premier commit. Elle dit attendre le premier commit (étape fichiers).
test('Création à blanc : sur un dépôt sans commit, la suite attend le premier commit, pas l’inventaire', () => gitIsole(async () => {
  const { r, s, etats } = await bancCreation();
  const d = path.join(r, 'neuf'); assert.equal(spawnSync('git', ['init', '-q', '-b', 'main', d]).status, 0);
  const attentes = async () => { const p = await creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc: true }); return [etats(p).fichiers, [...new Set(p.etapes.filter((e) => e.etape !== 'fichiers' && e.etat === 'a-faire' && !['depot', 'identite'].includes(e.etape)).map((e) => e.detail))]]; };
  assert.deepEqual(await attentes(), ['a-faire', ['après le premier commit (étape fichiers)']]);
  await s.inventaire(); s.indexer();
  assert.deepEqual(await attentes(), ['a-faire', ['après le premier commit (étape fichiers)']], 'l’inventaire passé, rien ne change');
  assert.equal(spawnSync('git', ['-C', d, 'rev-parse', '--verify', '-q', 'HEAD']).status, 1, 'à blanc, aucun commit');
}));

// R4 : un fichier de base ignoré par git (ici par le .gitignore du dépôt) faisait refuser le `git add` : l'étape fichiers
// échouait et chaque rejeu s'arrêtait là. Il n'est ni écrit ni commité, un geste le dit avec la commande qui montre la
// règle, et la suite se fait.
test('R4 : un fichier de base ignoré par git ne bloque plus les rejeux ; un geste le dit', () => gitIsole(async () => {
  const { r, s, etats, git } = await bancCreation();
  const d = path.join(r, 'neuf'); const creer = (aBlanc = false) => creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc });
  assert.equal(etats(await creer()).fichiers, 'faite');
  git(d, 'rm', '-q', 'CLAUDE.md'); fs.appendFileSync(path.join(d, '.gitignore'), 'CLAUDE.md\n'); git(d, 'commit', '-qam', 'Garder CLAUDE.md hors du dépôt');
  const tete = git(d, 'rev-parse', 'HEAD');
  for (const aBlanc of [true, false]) {
    const p = await creer(aBlanc); const geste = p.etapes.find((e) => e.etape === 'ignores');
    assert.deepEqual([etats(p).fichiers, geste?.etat, geste?.detail, geste?.geste.commande], ['deja', 'geste', 'CLAUDE.md : ignoré(s) par git, ni écrit(s) ni commité(s)', `git -C ${d} check-ignore -v -- CLAUDE.md`], JSON.stringify(p.etapes, null, 1));
    assert.ok(!p.etapes.find((e) => e.etape === 'fichiers').detail.includes('CLAUDE.md'));
    assert.deepEqual([etats(p).declaration, etats(p).regles], ['deja', 'deja'], 'la suite se fait');
  }
  assert.deepEqual([fs.existsSync(path.join(d, 'CLAUDE.md')), git(d, 'rev-parse', 'HEAD'), git(d, 'status', '--porcelain')], [false, tete, ''], 'ni écrit ni commité');
}));

// Voisin du lot 1 : la règle et le résumé de reprise du dossier de travail le rattachaient par son seul chemin ; un
// worktree, ou un dépôt déplacé depuis l'inventaire, n'avait ni résumé de reprise ni règles de projet jusqu'à l'inventaire
// suivant. Il se rattache comme à la garde avant commit (`projetDuDepot`).
import { reglesDuDossier } from '../src/contexte.js';
test('Reprise : un worktree et un dépôt déplacé se rattachent à leur projet sans attendre l’inventaire', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n');
  ecrire(path.join(d, 'arbre', 'rules.yaml'), '- id: du-projet\n  statement: Propre au projet.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  g('add', '.'); g('commit', '-qm', 'x');
  const id = `holarch:project:${premierCommit(d)}`;
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id }) }), { id, kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const rattache = (dossier) => [reglesDuDossier(s, dossier).some((e) => e.id === 'du-projet'), /^HOLARCH — reprise du projet depot /.test(resume(s, dossier) ?? '')];
  assert.deepEqual(rattache(d), [true, true]);
  const wt = path.join(r, 'branche'); g('worktree', 'add', '-q', '--detach', wt);
  assert.deepEqual(rattache(wt), [true, true], 'un worktree, par son worktree principal');
  g('worktree', 'remove', wt);
  const ailleurs = path.join(r, 'deplace'); fs.renameSync(d, ailleurs);
  assert.deepEqual(rattache(ailleurs), [true, true], 'un dépôt déplacé, par son premier commit');
  assert.deepEqual(rattache(tmp()), [false, false], 'hors projet : rien');
});

// Import, mineur (banc de rejeu) : l'état d'import avançait malgré des événements refusés par le journal, qui étaient
// perdus (la transcription, inchangée, n'était plus relue). Une transcription dont un événement est refusé garde son état ;
// ses cumuls de coût avancent pour ce qui est accepté, sans quoi une transcription qui grandit compterait deux fois.
test('Import : une transcription dont un événement est refusé est relue, sans compter deux fois son coût', () => {
  const home = tmp(); const donnees = tmp(); const vrai = new Journal(donnees, 'local');
  const f = path.join(home, 'projects', '-ws-demo', 's1.jsonl');
  const msg = (id, out, ts) => JSON.stringify({ type: 'assistant', sessionId: 's1', cwd: '/ws/demo', timestamp: ts, requestId: `r${id}`, message: { id: `m${id}`, model: 'modele-x', usage: { input_tokens: 1, output_tokens: out } } });
  ecrire(f, [JSON.stringify({ type: 'user', sessionId: 's1', cwd: '/ws/demo', timestamp: '2026-10-01T10:00:00Z', message: { content: 'bonjour' } }), msg(1, 5, '2026-10-01T10:00:05Z')].join('\n') + '\n'); vieillir(f);
  // Un journal qui refuse les événements d'une sorte, comme le ferait sa validation.
  let refusee = null;
  const journal = { ajouter: (evs) => {
    const non = evs.filter((e) => e.kind === refusee); const r = vrai.ajouter(evs.filter((e) => e.kind !== refusee));
    return { ...r, refuses: [...r.refuses, ...non.map((e) => ({ evenement: e, erreur: `${e.kind} refusé pour l’essai` }))] };
  } };
  const importer = () => importerTranscriptions({ home, calme_minutes: 10 }, { journal, donnees });
  const lu = () => [...vrai.lire()];
  const sortie = () => lu().filter((e) => e.kind === 'cost.recorded').reduce((n, e) => n + e.cost.tokens.out, 0);
  refusee = 'session.finished';
  assert.deepEqual([importer().refuses, lu().map((e) => e.kind).sort()], [1, ['cost.recorded', 'session.started']]);
  refusee = null;
  const r2 = importer();
  assert.deepEqual([r2.fichiers_lus, r2.ajoutes, lu().filter((e) => e.kind === 'session.finished').length, sortie()], [1, 1, 1, 5], 'inchangée, relue : la fin refusée se redit, le reste est déjà connu');
  assert.equal(importer().fichiers_lus, 0, 'tout accepté : l’état avance');
  // Fin refusée, coût accepté, puis la transcription grandit : seul l'ajout se compte.
  fs.appendFileSync(f, msg(2, 7, '2026-10-01T10:01:00Z') + '\n'); vieillir(f);
  refusee = 'session.finished'; importer();
  fs.appendFileSync(f, msg(3, 4, '2026-10-01T10:02:00Z') + '\n'); vieillir(f);
  refusee = null; importer();
  assert.equal(sortie(), 16, 'chaque token compté une fois');
  // Coût refusé : il se recompte en entier au passage suivant.
  fs.appendFileSync(f, msg(4, 2, '2026-10-01T10:03:00Z') + '\n'); vieillir(f);
  refusee = 'cost.recorded'; importer(); assert.equal(sortie(), 16);
  refusee = null; importer(); assert.equal(sortie(), 18);
  // Une transcription neuve dont le coût est refusé à sa première lecture : compté en entier ensuite.
  const f2 = path.join(home, 'projects', '-ws-demo', 's2.jsonl'); ecrire(f2, msg(9, 3, '2026-10-01T11:00:00Z').replace(/"s1"/, '"s2"') + '\n'); vieillir(f2);
  refusee = 'cost.recorded'; importer(); assert.equal(sortie(), 18);
  refusee = null; importer(); assert.equal(sortie(), 21);
});

// Échec de systemctl (famille Gardes muettes, mineur) : `is-active` et `is-enabled` sans réponse (bus injoignable) se
// lisaient « inactive » et « activée ». La réponse se lit comme un état connu de systemctl ; sinon, comme `etatVeille`,
// systemd absent : rien ne tourne ; injoignable ou autre erreur : l'échec se dit.
import { etatRoutines } from '../src/distant.js';
test('Accès distant : un systemctl sans réponse ne se lit ni « arrêté » ni « activée », l’échec se dit', () => {
  const racine = tmp(); const unites = tmp(); fs.mkdirSync(path.join(racine, 'demo'));
  let panne = null; let sousSystemd = true;
  const systemctl = (args) => {
    if (panne && args[0] !== 'is-system-running') return { status: 1, stdout: '', stderr: `${panne}\n` };
    if (panne === 'Failed to connect to bus: No medium found') return { status: 1, stdout: '', stderr: `${panne}\n` };
    return { status: 0, stdout: { 'is-active': 'active\n', 'is-enabled': 'enabled\n', 'is-system-running': 'running\n' }[args[0]] ?? '', stderr: '' };
  };
  const config = { inventaire: { 'claude-code': { config: path.join(tmp(), '.claude.json') } }, acces_distant: {} };
  const d = creerDistant(config, { unites, systemctl, claude: '/opt/outils/claude', projets: [{ id: 'holarch:project:demo', nom: 'demo', location: path.join(racine, 'demo') }], accueil: tmp(), holarch: '/opt/holarch/bin/holarch.js', node: '/opt/node/bin/node', sousSystemd: () => sousSystemd });
  d.activer('demo');
  const routine = () => etatRoutines({ unites, systemctl, sousSystemd: () => sousSystemd }).find((r) => r.unite === 'holarch-reveil.timer').etat;
  assert.deepEqual([d.liste().map((x) => x.actif), routine()], [[true], 'activée']);
  panne = 'Failed to connect to bus: No medium found';
  assert.throws(() => d.liste(), /^Error: systemd utilisateur injoignable : Failed to connect to bus: No medium found$/);
  assert.equal(routine(), 'illisible (systemd utilisateur injoignable : Failed to connect to bus: No medium found)');
  // systemd en marche, mais une réponse sans état : l'erreur de systemctl.
  panne = 'Unit file holarch-reveil.timer is broken';
  assert.equal(routine(), 'illisible (systemctl --user is-enabled holarch-reveil.timer : Unit file holarch-reveil.timer is broken)');
  // Sans systemd, rien ne tourne ni n'a été coupé.
  panne = 'Failed to connect to bus: No medium found'; sousSystemd = false;
  assert.deepEqual([d.liste().map((x) => x.actif), routine()], [[false], 'impossible sans systemd utilisateur']);
});

// M1 (famille Gardes muettes) : `distant activer` rallumait le minuteur de reprise après une veille coupé à la main (trou de
// la décision routines-posees). Il est réécrit sans être rallumé, et la commande le dit.
test('M1 : distant activer laisse coupé le minuteur de réveil coupé à la main, et le dit', () => {
  const { unites, appels, d, systemctl, creer } = banc();
  assert.equal(d.activer('demo').reveil, 'posé');
  systemctl(['disable', '--now', 'holarch-reveil.timer']); appels.length = 0;
  // Une autre copie de HOLARCH : le service du réveil est réécrit pour elle, le minuteur reste coupé.
  assert.equal(creer({ holarch: '/opt/holarch-2/bin/holarch.js' }).activer('autre').reveil, 'coupé à la main : laissé');
  assert.deepEqual(appels.filter((a) => /^(enable|start|restart)/.test(a)), ['enable --now holarch-distant-autre.service'], 'le minuteur n’est pas rallumé');
  assert.match(fs.readFileSync(path.join(unites, 'holarch-reveil.service'), 'utf8'), /"\/opt\/holarch-2\/bin\/holarch\.js" distant reveil$/m);
  assert.equal(appels.filter((a) => a === 'daemon-reload').length, 2, 'l’accès distant, puis le réveil réécrit');
  systemctl(['enable', '--now', 'holarch-reveil.timer']);
  assert.equal(d.activer('demo').reveil, 'posé', 'rallumé à la main : de nouveau tenu');
  fs.writeFileSync(path.join(unites, 'holarch-reveil.timer'), '[Timer]\nOnCalendar=hourly\n');
  assert.equal(d.activer('demo').reveil, 'non écrit par HOLARCH : laissé');
});

// R3 (famille Gardes muettes) : une pose interrompue entre l'écriture d'une unité et son activation la laissait présente et
// `disabled` ; la pose suivante la prenait pour coupée à la main et ne la rallumait plus jamais. Une marque posée avant la
// pose et retirée après la distingue.
test('R3 : une pose interrompue avant l’activation n’est pas prise pour une routine coupée à la main', () => {
  const unites = tmp(); const appels = []; const actives = new Set(); let refus = true;
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'enable' && refus) { refus = false; return { status: 1, stdout: '', stderr: 'Failed to enable unit: interrompu\n' }; }
    if (args[0] === 'enable') actives.add(args.at(-1)); if (args[0] === 'disable') actives.delete(args.at(-1));
    const etat = { 'is-enabled': actives.has(args[1]) ? 'enabled' : 'disabled', 'is-active': actives.has(args[1]) ? 'active' : 'inactive', 'is-system-running': 'running' }[args[0]];
    return { status: 0, stdout: etat ? `${etat}\n` : '', stderr: '' };
  };
  const o = { unites, systemctl, node: '/opt/node/bin/node' };
  const recolte = creerRecolte({ holarch: '/v1/holarch.js', accueil: '/a' }, o);
  const etat = () => etatRoutines(o).find((r) => r.unite === 'holarch-recolte.timer').etat;
  assert.throws(() => recolte.poser(), /systemctl --user enable --now holarch-recolte\.timer : Failed to enable unit: interrompu/);
  assert.ok(fs.existsSync(path.join(unites, 'holarch-recolte.timer')), 'l’unité est écrite, pas activée');
  assert.equal(etat(), 'pose interrompue');
  appels.length = 0; recolte.poser();
  assert.ok(appels.includes('enable --now holarch-recolte.timer'), 'la pose suivante l’active');
  assert.deepEqual([etat(), fs.readdirSync(unites).sort()], ['activée', ['holarch-recolte.service', 'holarch-recolte.timer']], 'la marque est retirée');
  // Coupée à la main ensuite : laissée, comme avant.
  systemctl(['disable', '--now', 'holarch-recolte.timer']); appels.length = 0;
  assert.deepEqual([recolte.poser().etat, appels.filter((a) => a.startsWith('enable')), etat()], ['coupé à la main : laissé', [], 'coupée']);
  // Une unité retirée après une pose interrompue part avec sa marque.
  const i = creerInterface({ holarch: '/v1/holarch.js', accueil: '/a' }, o); refus = true;
  assert.throws(() => i.activer(), /interrompu/); i.desactiver();
  assert.deepEqual(fs.readdirSync(unites).filter((x) => x.startsWith('holarch-interface')), []);
});

// M4 (famille Gardes muettes) : une unité marquée modifiée à la main était réécrite à la pose suivante. Le texte écrit
// porte son empreinte ; une unité dont le texte ne lui correspond plus est laissée, et c'est dit (même principe que le
// retrait à la main). Une unité d'avant l'empreinte n'en a pas : rien ne la distingue, elle est réécrite avec la sienne.
test('M4 : une unité modifiée à la main n’est plus réécrite ; la pose le dit', () => {
  const { unites, appels, d, systemctl, cfgClaude, racine } = banc();
  const o = { unites, systemctl, node: '/opt/node/bin/node' };
  const lire = (u) => fs.readFileSync(path.join(unites, u), 'utf8');
  const retoucher = (u, de, vers) => { fs.writeFileSync(path.join(unites, u), lire(u).replace(de, vers)); return lire(u); };
  const routine = (u) => etatRoutines(o).find((r) => r.unite === u).etat;
  d.activer('demo');
  const recolte = (h) => creerRecolte({ holarch: h, accueil: '/a' }, o); recolte('/v1/holarch.js').poser();
  const gardien = (h) => creerReveil({ holarch: h, accueil: '/a' }, o).gardien({ veille: true }).etat; gardien('/v1/holarch.js');
  const interface_ = (h) => creerInterface({ holarch: h, accueil: '/a' }, o); interface_('/v1/holarch.js').activer();
  for (const u of ['holarch-distant-demo.service', 'holarch-reveil.service', 'holarch-reveil.timer', 'holarch-recolte.timer', 'holarch-veille.service', 'holarch-interface.service']) {
    assert.match(lire(u), /\n# Empreinte HOLARCH : [0-9a-f]{16}\n$/, u);
  }
  // Le texte signé se compare au texte voulu : inchangée, l'interface est relancée une fois (même code chargé sinon).
  appels.length = 0; assert.equal(interface_('/v1/holarch.js').relancer().etat, 'relancée');
  assert.deepEqual(appels.filter((a) => /^(restart|enable)/.test(a)), ['enable --now holarch-interface.service', 'restart holarch-interface.service']);
  // Retouchées à la main : laissées, et dit, à chaque pose ; rien n'est relancé.
  const gardienMain = retoucher('holarch-veille.service', 'Restart=on-failure', 'Restart=always'); appels.length = 0;
  assert.deepEqual([gardien('/v2/holarch.js'), lire('holarch-veille.service'), routine('holarch-veille.service')], ['modifiée à la main : laissée', gardienMain, 'modifiée à la main']);
  const minuteurMain = retoucher('holarch-recolte.timer', 'Mon *-*-* 08:00', 'Fri *-*-* 18:00');
  assert.throws(() => recolte('/v2/holarch.js').poser(), /holarch-recolte\.timer a été modifié à la main : rien n'est réécrit$/);
  assert.deepEqual([lire('holarch-recolte.timer'), lire('holarch-recolte.service').includes('/v1/holarch.js')], [minuteurMain, true]);
  const interfaceMain = retoucher('holarch-interface.service', 'RestartSec=30', 'RestartSec=5');
  assert.deepEqual([interface_('/v2/holarch.js').relancer().etat, lire('holarch-interface.service')], ['modifiée à la main : laissée, à relancer à la main', interfaceMain]);
  const reveilMain = retoucher('holarch-reveil.service', 'Type=oneshot', 'Type=oneshot\nNice=10');
  assert.deepEqual([creerReveil({ holarch: '/v2/holarch.js', accueil: '/a' }, o).reecrire().etat, lire('holarch-reveil.service')], ['modifiée à la main : laissée', reveilMain]);
  assert.equal(d.activer('autre').reveil, 'modifié à la main : laissé');
  assert.deepEqual(appels.filter((a) => /^(restart|start|enable)/.test(a)), ['enable --now holarch-distant-autre.service'], 'rien n’est relancé ni réactivé');
  // Un accès distant retouché : la commande le dit, rien n'est écrit, pas même la confiance.
  const distantMain = fs.readFileSync(path.join(unites, 'holarch-distant-demo.service'), 'utf8').replace('RestartSec=30', 'RestartSec=60') + 'Environment=A=1\n';
  fs.writeFileSync(path.join(unites, 'holarch-distant-demo.service'), distantMain);
  const confiance = fs.readFileSync(cfgClaude, 'utf8'); fs.writeFileSync(cfgClaude, '{}');
  assert.throws(() => d.activer('demo'), /holarch-distant-demo\.service a été modifié à la main : rien n'est réécrit$/);
  assert.deepEqual([lire('holarch-distant-demo.service'), fs.readFileSync(cfgClaude, 'utf8')], [distantMain, '{}']); fs.writeFileSync(cfgClaude, confiance);
  // Une unité écrite avant l'empreinte : réécrite avec la sienne.
  const ancienne = lire('holarch-distant-autre.service').replace(/# Empreinte HOLARCH : [0-9a-f]{16}\n$/, '');
  fs.writeFileSync(path.join(unites, 'holarch-distant-autre.service'), ancienne.replace('RestartSec=30', 'RestartSec=60'));
  d.activer('autre');
  assert.equal(lire('holarch-distant-autre.service').replace(/# Empreinte HOLARCH : [0-9a-f]{16}\n$/, ''), ancienne, path.join(racine, 'autre'));
});

// M2 (famille Gardes muettes) : une clé ou un crochet que HOLARCH avait posé dans `settings.json`, puis retiré à la main,
// était remis à la pose suivante ; un crochet changé à la main était doublé d'un neuf. Une entrée du manifeste absente du
// fichier est un retrait à la main : laissée, dite par la pose et par l'audit, gardée au manifeste tant qu'elle est voulue.
import { materialiserCompte } from '../src/materialisation.js';
test('M2 : un réglage ou un crochet retiré ou changé à la main n’est ni remis ni doublé ; la pose et l’audit le disent', () => {
  const profil = tmp(); const home = tmp(); const accueil = tmp(); const settings = path.join(home, 'settings.json');
  ecrire(path.join(profil, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\nconfig:\n  claude_code: { reglages: { autoCompactWindow: 300000, effortLevel: medium }, passation: { seuil_tokens: 150000, reprise: true } }\n---\n');
  ecrire(path.join(profil, 'arbre', 'rules.yaml'), '- id: rappel\n  statement: Un rappel.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  const s = new Socle({ site: 'local', profil, donnees: tmp(), accueil, web: {}, tarifs: {}, inventaire: { 'claude-code': { home } }, import: {} });
  s.catalogue.remplacer(inventaireArbre({}, { depots: [profil], projetDe: () => null })); s.indexer();
  const poser = () => materialiserCompte(s.regles().compte, [{ home }], { accueil })[0];
  const ecarts = () => s.audit().cibles.find((c) => c.projet === null).ecarts.filter((e) => e.controle === 'reglages-poses').map((e) => e.message).sort();
  const lu = () => JSON.parse(fs.readFileSync(settings, 'utf8'));
  const r1 = poser().reglages;
  assert.deepEqual([r1.cles.posees, r1.crochets.poses.length, ecarts()], [['autoCompactWindow', 'effortLevel'], 2, []]);
  const [alerte, reprise] = r1.crochets.poses;
  // À la main : une clé retirée, le crochet d'alerte retiré, celui de reprise changé.
  const c = lu(); delete c.autoCompactWindow; delete c.hooks.UserPromptSubmit; c.hooks.SessionStart[0].hooks[0].command = reprise.replace('contexte debut', 'contexte debut --court');
  fs.writeFileSync(settings, JSON.stringify(c)); const main = fs.readFileSync(settings, 'utf8');
  for (const fois of ['première', 'seconde']) {
    const m = poser(); const r = m.reglages;
    assert.deepEqual([r.cles.retirees_a_la_main, r.cles.posees, r.cles.inchangees, r.crochets.retires_a_la_main, r.crochets.poses], [['autoCompactWindow'], [], ['effortLevel'], [alerte, reprise], []], `${fois} pose : laissés, et dits`);
    assert.equal(fs.readFileSync(settings, 'utf8'), main, 'ni remis ni doublés : settings.json n’est pas réécrit');
    assert.match(affichage.appliquer({ comptes: [m], projets: [] }), /laissés \(retirés à la main\) : autoCompactWindow ; crochets : 0 posé\(s\), 0 retiré\(s\), 0 inchangé\(s\), 2 laissé\(s\) \(retiré\(s\) ou changé\(s\) à la main\)$/m);
  }
  const gestes = (n, source) => `holarch regles appliquer --reposer ${n} pour le reposer, ou retirer ${source} du profil pour ne plus le vouloir`;
  assert.deepEqual(ecarts(), [`crochet de passation non posé (alerte) : retiré ou changé à la main, laissé ; ${gestes('crochet:alerte', 'claude_code.passation.seuil_tokens')}`,
    `crochet de passation non posé (reprise) : retiré ou changé à la main, laissé ; ${gestes('crochet:debut', 'claude_code.passation.reprise')}`,
    `réglage autoCompactWindow non posé : retiré à la main, laissé ; ${gestes('autoCompactWindow', 'claude_code.reglages.autoCompactWindow')}`], 'l’audit les dit, avec les deux gestes (lot 5)');
  // Remis à la main tels quels : de nouveau inchangés, sans écart.
  fs.writeFileSync(settings, JSON.stringify({ ...lu(), autoCompactWindow: 300000, hooks: { ...lu().hooks, UserPromptSubmit: [{ hooks: [{ type: 'command', command: alerte }] }] } }));
  const r3 = poser().reglages;
  assert.deepEqual([r3.cles.inchangees, r3.cles.retirees_a_la_main, r3.crochets.inchanges, r3.crochets.retires_a_la_main], [['autoCompactWindow', 'effortLevel'], [], [alerte], [reprise]]);
});

// M3 (famille Gardes muettes) : `service poser` repointait vers la copie de service le serveur MCP `holarch` de chaque
// compte, même réglé vers une autre copie de HOLARCH. Seul un chemin qui lance une copie de service (sous l'accueil) ou le
// socle (la copie de travail qui pose, la source) est repointé ; un autre est laissé, et dit. Voisin du lot 5 : laissé, il
// était dit sans la commande qui le repointe, que seul `holarch service` donnait ; la pose donne la même.
test('M3 : service poser ne repointe le serveur MCP holarch que s’il lance une copie de service ou le socle', () => {
  const src = tmp(); const accueil = tmp(); const unites = tmp();
  const g = (...a) => { const r = spawnSync('git', ['-C', src, '-c', 'user.name=t', '-c', 'user.email=t@exemple.invalid', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  g('init', '-q'); ecrire(path.join(src, 'package.json'), '{}\n'); ecrire(path.join(src, 'bin', 'holarch.js'), 'console.log(1);\n'); g('add', '-A'); g('commit', '-qm', 'v1');
  const args = { ailleurs: '/opt/autre-holarch/bin/holarch.js', relatif: 'bin/holarch.js', source: path.join(src, 'bin', 'holarch.js'), socle: path.resolve('bin/holarch.js'),
    ancienne: path.join(accueil, 'service', 'abcdef123456', 'bin', 'holarch.js') };
  const comptes = Object.keys(args).map((nom) => ({ nom, home: tmp() }));
  const cfg = (c) => path.join(c.home, '.claude.json');
  for (const c of comptes) fs.writeFileSync(cfg(c), JSON.stringify({ mcpServers: { holarch: { command: 'node', args: ['--no-warnings', args[c.nom], 'mcp'] } } }));
  comptes.push({ nom: 'chemin', home: tmp() }); fs.writeFileSync(cfg(comptes.at(-1)), JSON.stringify({ mcpServers: { holarch: { command: 'holarch', args: ['mcp'] } } }));
  const lancer = (cmd, a, o) => { if (cmd !== 'npm') return spawnSync(cmd, a, o); if (a[0] === 'ci') fs.mkdirSync(path.join(o.cwd, 'node_modules')); return { status: 0, stdout: '', stderr: '' }; };
  const service = () => creerService({ accueil, comptes }, { source: src, unites, systemctl: () => ({ status: 0, stdout: '', stderr: '' }), npm: 'npm', lancer, node: '/opt/node/bin/node' });
  const r = service().poser();
  const bin = binaireService(accueil); const pose = 'posé (effet à la prochaine session de Claude Code)';
  const point = (nom) => r.points.find((p) => p.point === `mcp ${nom}`);
  assert.deepEqual(comptes.map((c) => [c.nom, point(c.nom).etat, JSON.parse(fs.readFileSync(cfg(c), 'utf8')).mcpServers.holarch.args[1] ?? null]), [
    ['ailleurs', 'réglé ailleurs (/opt/autre-holarch/bin/holarch.js) : laissé', args.ailleurs],
    ['relatif', 'réglé ailleurs (bin/holarch.js) : laissé', args.relatif],
    ['source', pose, bin], ['socle', pose, bin], ['ancienne', pose, bin], ['chemin', 'non reconnu', null]]);
  // Laissé, le point dit la commande qui le repointe : celle que montre `holarch service` ; posé, aucune.
  const vu = service().etat().mcp; const laisses = ['ailleurs', 'relatif', 'chemin'];
  assert.deepEqual(laisses.map((n) => point(n).geste), laisses.map((n) => vu.find((m) => m.compte === n).geste));
  assert.deepEqual([laisses.every((n) => / claude mcp add-json holarch '.*' --scope user$/.test(point(n).geste)), ['source', 'socle', 'ancienne'].map((n) => point(n).geste)], [true, [undefined, undefined, undefined]]);
  const texte = affichage.posee(r).split('\n'); const i = texte.indexOf('  mcp ailleurs : réglé ailleurs (/opt/autre-holarch/bin/holarch.js) : laissé');
  assert.deepEqual(texte.slice(i, i + 3), ['  mcp ailleurs : réglé ailleurs (/opt/autre-holarch/bin/holarch.js) : laissé', '    pour le repointer vers la copie de service :', `      ${point('ailleurs').geste}`], texte.join('\n'));
});

// M5 (famille Gardes muettes ; lot 5, décision geste-a-la-main, revient en partie sur d0540bc) : l'identité de commit que
// HOLARCH avait posée en réglage local, retirée à la main, n'était plus reposée ; la garde d'identité étant bloquante, git
// prenait l'identité du compte et chaque commit était refusé. Elle est reposée, et dite ; un réglage local posé à la main
// reste laissé et dit. Plus voulue, la note restait orpheline quand le réglage local n'était plus celui de HOLARCH : elle
// part (lui reste) ; à blanc, c'est seulement dit.
test('M5 : une identité de commit retirée à la main est reposée, et dite ; plus voulue, sa note est retirée', () => gitIsole(async () => {
  const { r, s, etats, git } = await bancCreation();
  const d = path.join(r, 'neuf'); const creer = (aBlanc = false) => creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc });
  const voulue = { nom: 'Alice Exemple', email: 'alice@noreply.test' }; const texte = 'Alice Exemple <alice@noreply.test>';
  const locale = () => git(d, 'config', '--local', '--get', 'user.email'); const note = () => git(d, 'config', '--local', '--get', 'holarch.identite');
  const retirer = () => { git(d, 'config', '--local', '--unset', 'user.name'); git(d, 'config', '--local', '--unset', 'user.email'); };
  const ligne = (identite) => affichage.appliquer({ comptes: [], projets: [{ nom: 'neuf', m: { fichiers: { dossier: d, crees: [], modifies: [], retires: [], inchanges: [], ignores: [] }, plan: { signaux: [] }, crochet: { etat: 'absent' }, identite } }] }).split('\n')[1];
  const identite = (p) => p.etapes.find((e) => e.etape === 'identite');
  const dite = 'identité du contexte en réglage local, retirée à la main : reposée ; pour une autre identité ici, déclarer `identite` au projet';
  assert.deepEqual([etats(await creer()).identite, locale(), note()], ['faite', voulue.email, texte]);
  retirer();
  const a = identite(await creer(true));
  assert.deepEqual([a.etat, a.detail, a.geste, locale()], ['a-faire', dite, undefined, ''], 'à blanc : dite, rien n’est écrit');
  const e = identite(await creer());
  assert.deepEqual([e.etat, e.detail, e.geste, locale(), note()], ['faite', dite, undefined, voulue.email, texte], 'reposée par la création, sans geste');
  retirer();
  assert.deepEqual([poserIdentite(d, voulue, { ecrire: false }).etat, locale()], ['repose', '']);
  assert.equal(ligne(poserIdentite(d, voulue, { ecrire: false })), '  ATTENTION identité de commit posée par HOLARCH dans ce dépôt, retirée à la main : reposée ; pour une autre identité ici, déclarer `identite` au projet');
  assert.deepEqual([poserIdentite(d, voulue).etat, locale(), poserIdentite(d, voulue).etat], ['repose', voulue.email, 'inchange'], 'reposée par la pose des règles');
  // Changée à la main : laissée et dite, comme avant.
  git(d, 'config', '--local', 'user.email', 'autre@exemple.test');
  assert.deepEqual([poserIdentite(d, voulue).etat, locale(), identite(await creer()).etat], ['ignore', 'autre@exemple.test', 'geste']);
  // Plus voulue : la note part, le réglage local posé à la main reste ; à blanc, seulement dit.
  assert.deepEqual([poserIdentite(d, null, { ecrire: false }).etat, note()], ['note-retiree', texte]);
  assert.equal(ligne(poserIdentite(d, null, { ecrire: false })), '  identité de commit plus déclarée : note de HOLARCH retirée ; le réglage local, posé à la main, reste');
  assert.deepEqual([poserIdentite(d, null).etat, note(), locale(), poserIdentite(d, null).etat], ['note-retiree', '', 'autre@exemple.test', 'absent']);
  // La note seule, le réglage local retiré à la main : plus voulue, retirée aussi.
  retirer(); git(d, 'config', '--local', 'holarch.identite', texte);
  assert.deepEqual([poserIdentite(d, null).etat, note()], ['note-retiree', '']);
}));

// `git add -A` des règles non vérifié (famille Gardes muettes, écarts mineurs) : refusé (ici, un verrou de l'index laissé
// par un autre git ; un dossier ignoré est un geste depuis le lot 5), l'étape disait les règles faites alors que rien
// n'était commité. L'échec se dit, avec le message de git.
test('Création : un ajout des règles refusé par git se dit en échec, pas « fait »', () => gitIsole(async () => {
  const { r, s, git } = await bancCreation();
  const d = path.join(r, 'neuf'); const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'] });
  await creer();
  const source = path.join(r, 'socle', 'arbre', 'types-transverses', 'methode', 'rules.yaml');
  fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace('Les tests passent', 'Tous les tests passent'));
  fs.writeFileSync(path.join(d, '.git', 'index.lock'), '');
  const p = await creer(); const e = p.etapes.find((x) => x.etape === 'regles');
  assert.equal(e?.etat, 'echec', JSON.stringify(p.etapes, null, 1));
  assert.match(e.detail, /^règles écrites, non ajoutées à git : fatal: Unable to create '.*index\.lock': File exists\.$/);
  assert.equal(p.etapes.at(-1), e, 'la suite attend un rejeu, comme après un commit refusé');
  assert.deepEqual([/^Tous les tests/m.test(fs.readFileSync(path.join(d, '.claude', 'rules', 'holarch', 'tests-verts.md'), 'utf8')), /^Les tests/m.test(git(d, 'show', 'HEAD:.claude/rules/holarch/tests-verts.md'))], [true, true], 'écrite, non commitée');
}));

// verrousVulnerables, voisin de la famille Gardes muettes : l'empreinte des verrous les lisait en entier, deux fois, sans
// garde ; un FIFO posé à la place d'un verrou suivi bloquait l'audit. Lus une fois par la lecture gardée et bornée : ce
// qui n'est pas un fichier, ou dépasse la borne, n'est ni lu ni passé à osv-scanner, et le contrôle le dit.
test('Dépendances vulnérables : un verrou remplacé par un FIFO ou démesuré n’est ni lu ni scanné, et rien ne bloque', () => {
  const { d, g } = depotGit();
  for (const f of ['package-lock.json', 'go.sum', 'Cargo.lock', path.join('web', 'uv.lock')]) ecrire(path.join(d, f), 'v1\n');
  g('add', '.'); g('commit', '-qm', 'verrous');
  fs.rmSync(path.join(d, 'Cargo.lock'));  // suivi, retiré de la copie de travail : rien à lire, rien à dire
  fs.rmSync(path.join(d, 'package-lock.json')); assert.equal(spawnSync('mkfifo', [path.join(d, 'package-lock.json')]).status, 0);
  fs.truncateSync(path.join(d, 'go.sum'), 32 * 2 ** 20 + 1);  // creux : rien n'occupe le disque
  const osv = path.join(tmp(), 'osv-scanner'); const appels = `${osv}.appels`;
  ecrire(osv, `#!/bin/sh\necho "$@" >> '${appels}'\necho '{"results":[]}'\n`); fs.chmodSync(osv, 0o755);
  // Dans un processus à part, borné dans le temps : un FIFO ouvert en lecture bloquerait le processus entier.
  const script = `import { executer } from ${JSON.stringify(new URL('../src/controles.js', import.meta.url).href)};
    console.log(JSON.stringify(executer('dependances-vulnerables', { depot: ${JSON.stringify(d)}, osv: ${JSON.stringify(osv)}, cache: null, config: {} }, 'audit')));`;
  const r = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15e3 });
  assert.equal(r.signal, null, 'la lecture a bloqué');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), { ecarts: [], indisponible: 'go.sum : pas un fichier, ou plus de 32 Mio, non lu ; package-lock.json : pas un fichier, ou plus de 32 Mio, non lu' });
  assert.equal(fs.readFileSync(appels, 'utf8'), 'scan source --config /dev/null -L web/uv.lock --format json\n', 'seul le verrou lu est scanné');
});

// agentgateway, voisin de la famille Gardes muettes : la position de lecture allait au bout du fichier malgré des
// événements refusés par le journal, qui étaient perdus. Elle s'arrête au début de la première ligne refusée, relue au
// passage suivant ; ce qui la suit et a été accepté revient avec le même identifiant, et ne se compte pas deux fois.
test('Passerelle : une ligne dont l’événement est refusé est relue au passage suivant, sans doubler les autres', async () => {
  const { default: importerPasserelle } = await import('../src/import/agentgateway.js');
  const ligne = (t, outil) => JSON.stringify({ level: 'info', time: t, 'http.status': 200, 'mcp.method.name': 'tools/call', 'mcp.target': 'demo', 'gen_ai.tool.name': outil, duration: '6ms' });
  const donnees = tmp(); const vrai = new Journal(donnees, 'local'); const f = path.join(tmp(), 'passerelle.jsonl');
  // Un journal qui refuse les appels d'un outil, comme le ferait sa validation.
  let refuse = null;
  const journal = { ajouter: (evs) => {
    const non = evs.filter((e) => e.data.outil === refuse); const r = vrai.ajouter(evs.filter((e) => e.data.outil !== refuse));
    return { ...r, refuses: [...r.refuses, ...non.map((e) => ({ evenement: e, erreur: `${e.data.outil} refusé pour l’essai` }))] };
  } };
  const importer = () => importerPasserelle({ fichier: f, nom: 'hub' }, { journal, donnees });
  const outils = () => [...vrai.lire()].map((e) => e.data.outil).sort();
  // Des caractères accentués avant la ligne refusée : la position se compte en octets.
  const premiere = ligne('2026-10-01T10:00:00Z', 'àé');
  fs.writeFileSync(f, `${premiere}\n${ligne('2026-10-01T10:00:01Z', 'refusé')}\n${ligne('2026-10-01T10:00:02Z', 'c')}\n`);
  refuse = 'refusé';
  const position = () => JSON.parse(fs.readFileSync(path.join(donnees, 'import', 'agentgateway.json'), 'utf8'))[f].position;
  assert.deepEqual([importer().refuses, outils(), position()], [1, ['c', 'àé'], Buffer.byteLength(premiere) + 1], 'arrêtée au premier octet de la ligne refusée');
  refuse = null;
  const r = importer();
  assert.deepEqual([r.ajoutes, r.ignores, outils()], [1, 1, ['c', 'refusé', 'àé']], 'relue depuis la ligne refusée : elle passe, la suivante est déjà connue');
  fs.appendFileSync(f, `${ligne('2026-10-01T10:00:03Z', 'd')}\n`);
  const r2 = importer();
  assert.deepEqual([r2.ajoutes, r2.ignores, outils()], [1, 0, ['c', 'd', 'refusé', 'àé']], 'tout accepté : la position est allée au bout');
});

import { etatVeille } from '../src/distant.js';
// `etatRoutines` sans systemd, voisin de la famille Gardes muettes : une routine posée se disait « activée » sur un poste
// sans systemd utilisateur (WSL sans systemd, conteneur), où rien ne tourne. Comme `etatVeille`, systemd se lit d'abord.
test('Routines : sans systemd utilisateur, aucune ne se dit activée ; elles se disent impossibles, comme le gardien de veille', () => {
  const unites = tmp(); let sousSystemd = true;
  // Le faux systemctl des images Dev Containers : il répond 0 à tout, avec un texte.
  const systemctl = (args) => ({ status: 0, stdout: sousSystemd ? { 'is-enabled': 'enabled\n', 'is-active': 'active\n', 'is-system-running': 'running\n' }[args[0]] ?? '' : 'systemctl n’est pas disponible ici\n', stderr: '' });
  const o = { unites, systemctl, sousSystemd: () => sousSystemd };
  creerRecolte({ holarch: '/v1/holarch.js', accueil: '/a' }, o).poser();
  const etats = () => Object.fromEntries(etatRoutines(o).map((r) => [r.unite, r.etat]));
  assert.deepEqual([etats()['holarch-recolte.timer'], etats()['holarch-import.timer']], ['activée', 'absente']);
  sousSystemd = false;
  assert.deepEqual(new Set(Object.values(etats())), new Set(['impossible sans systemd utilisateur']));
  assert.equal(etatVeille(o).gardien, 'impossible sans systemd utilisateur', 'la même phrase que le gardien');
});

// R1 sans avance lue, voisin de la famille Gardes muettes : quand l'avance sur l'amont ne se lit pas (`en_avance` null,
// ici un amont dont l'objet manque), le rejeu concluait « github : déjà là ». Il dit qu'elle n'est pas lue.
test('R1 : rejouée, la création ne dit pas « déjà là » quand l’avance sur l’amont ne se lit pas', () => gitIsole(async () => {
  const github = path.join(tmp(), 'github.com');
  const { r, s, etats } = await bancCreation({ creation: { etapes: { github: true, conteneur: false, distant: false } } });
  const d = path.join(r, 'neuf'); const nu = path.join(github, 'alice', 'neuf');
  const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'] }, { gh: ghFictif(github), urlDepot: (o, n) => path.join(github, o, n) });
  assert.equal(etats(await creer()).github, 'faite');
  fs.writeFileSync(path.join(d, '.git', 'refs', 'remotes', 'origin', 'main'), `${'0123456789'.repeat(4)}\n`);
  const e = (await creer()).etapes.find((x) => x.etape === 'github');
  assert.deepEqual([e.etat, e.detail], ['echec', `${nu} : avance sur l’amont non lue, commits non poussés inconnus`], JSON.stringify(e));
}));

// R2 affiné (choix de l'auteur du 2026-10-13) : rejouée, la création rallumait aussi un accès distant coupé à la main
// (désactivé), comme le minuteur de réveil en M1. Il est laissé et dit, en geste avec la commande explicite qui le
// rallume ; arrêté sans être coupé (en échec), il se rallume toujours.
test('R2 affiné : rejouée, la création laisse un accès distant coupé à la main et le dit, avec la commande qui le rallume', () => gitIsole(async () => {
  const { d: vrai, systemctl } = banc();
  vrai.activer('demo'); systemctl(['disable', '--now', 'holarch-distant-demo.service']);
  assert.deepEqual(vrai.liste().map((x) => [x.nom, x.actif, x.coupee]), [['demo', false, true]], 'liste dit l’unité coupée');
  const { s, r } = await bancCreation({ creation: { etapes: { github: false, conteneur: false, distant: true } } });
  const poses = [{ nom: 'neuf', chemin: path.join(r, 'neuf'), projet: null, actif: false, coupee: true }]; const activations = [];
  const distant = { liste: () => poses, activer: (id) => { activations.push(id); Object.assign(poses[0], { actif: true, coupee: false }); return { unite: 'holarch-distant-neuf.service' }; } };
  const etape = async (aBlanc = false) => (await creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc }, { distant })).etapes.find((x) => x.etape === 'distant');
  const geste = { etat: 'geste', detail: 'service neuf coupé à la main : laissé', geste: { quoi: 'le rallumer, si l’accès distant est voulu', commande: `holarch distant activer ${path.join(r, 'neuf')}` } };
  assert.deepEqual(await etape(), { etape: 'distant', ...geste });
  assert.deepEqual(await etape(true), { etape: 'distant', ...geste }, 'à blanc, le même geste');
  assert.deepEqual(activations, [], 'jamais rallumé par la création');
  Object.assign(poses[0], { coupee: false });
  assert.deepEqual([(await etape()).etat, activations.length], ['faite', 1], 'arrêté sans être coupé : rallumé');
  assert.equal((await etape()).etat, 'deja');
}));

// Retrait d'une unité modifiée à la main (choix de l'auteur du 2026-10-13, suite de M4) : `distant desactiver`, le retrait
// du réveil, du gardien de veille et de l'interface exécutent la demande, mais retiraient aussi le texte changé à la main,
// sans trace. Il est d'abord copié à côté, sous un nom que systemd ne lit pas (`.bak`), et le retrait le dit.
test('Retrait d’une unité modifiée à la main : copiée en .bak à côté, retirée, et dit ; une copie précédente reste', () => {
  const { unites, systemctl, d } = banc();
  const u = (x) => path.join(unites, x);
  const modifier = (f) => { const t = `${fs.readFileSync(f, 'utf8')}Environment=NOTE=main\n`; fs.writeFileSync(f, t); return t; };
  d.activer('demo');
  assert.deepEqual(d.desactiver('demo').copies, [], 'inchangées : aucune copie');
  d.activer('demo');
  const texte = modifier(u('holarch-distant-demo.service')); const minuteur = modifier(u('holarch-reveil.timer'));
  assert.deepEqual(d.desactiver('demo').copies, [
    { unite: 'holarch-distant-demo.service', copie: u('holarch-distant-demo.service.bak') },
    { unite: 'holarch-reveil.timer', copie: u('holarch-reveil.timer.bak') }]);
  assert.deepEqual([fs.readFileSync(u('holarch-distant-demo.service.bak'), 'utf8'), fs.readFileSync(u('holarch-reveil.timer.bak'), 'utf8')], [texte, minuteur]);
  assert.deepEqual(fs.readdirSync(unites).sort(), ['holarch-distant-demo.service.bak', 'holarch-reveil.timer.bak'], 'les unités retirées');
  // De nouveau posée, modifiée et retirée : la première copie reste, la seconde prend le nom libre suivant.
  d.activer('demo'); const autre = modifier(u('holarch-distant-demo.service')); modifier(u('holarch-reveil.service'));
  assert.deepEqual(d.desactiver('demo').copies.map((c) => c.copie), [u('holarch-distant-demo.service.1.bak'), u('holarch-reveil.service.bak')]);
  assert.deepEqual([fs.readFileSync(u('holarch-distant-demo.service.bak'), 'utf8'), fs.readFileSync(u('holarch-distant-demo.service.1.bak'), 'utf8')], [texte, autre]);
  // Le gardien de veille, quand sa règle ne s'applique plus, et l'interface.
  const o = { unites, systemctl, sousSystemd: () => true };
  const reveil = creerReveil({ holarch: '/opt/holarch/bin/holarch.js', accueil: tmp() }, o);
  assert.equal(reveil.gardien({ veille: true }).etat, 'posée'); modifier(u('holarch-veille.service'));
  assert.equal(reveil.gardien({ veille: false }).etat, `règle veille-retardee non appliquée : modifiée à la main : retirée, copie en ${u('holarch-veille.service.bak')}`);
  const i = creerInterface({ holarch: '/opt/holarch/bin/holarch.js', accueil: tmp() }, o);
  i.activer(); modifier(u('holarch-interface.service'));
  assert.deepEqual(i.desactiver(), { unite: 'holarch-interface.service', copie: u('holarch-interface.service.bak') });
  assert.ok(!fs.existsSync(u('holarch-veille.service')) && !fs.existsSync(u('holarch-interface.service')));
});

// Liste des projets sans filtre de site (risque faible à la clôture) : l'index porte les catalogues de tous les sites
// qui partagent les données ; le projet d'un autre site entrait dans la vue Projets, rendait ambigu le nom d'un projet
// d'ici et rattachait la reprise de son chemin. Une seule liste, celle des projets du site.
import { Catalogue } from '../src/stockage/catalogue.js';
test('Projets du site : la vue, le nom, la reprise et le tableau de bord ne prennent pas le projet d’un autre site', () => {
  const donnees = tmp(); const ici = tmp(); const ailleurs = tmp();
  const projet = (id, location, site) => ({ id, kind: 'project', name: 'demo', status: 'active', location, site, provenance: { source: 't' }, attributes: { fichiers_modifies: 1 } });
  new Catalogue(donnees, 'hote').remplacer([projet('holarch:project:b', ailleurs, 'hote')]);
  const s = new Socle({ site: 'local', donnees, accueil: donnees, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([projet('holarch:project:a', ici, 'local'), { ...projet('holarch:project:c', tmp()), name: 'sans-site' }]); s.indexer();
  assert.deepEqual(s.projets().projets.map((p) => p.id).sort(), ['holarch:project:a', 'holarch:project:c'], 'une fiche sans site vaut partout');
  assert.equal(s.projetDe('demo'), 'holarch:project:a', 'le nom n’est pas ambigu');
  assert.deepEqual([resume(s, ailleurs), /reprise du projet demo/.test(resume(s, ici))], [null, true]);
  assert.deepEqual(s.etat().projets_sales.map((p) => p.name).sort(), ['demo', 'sans-site']);
});

// Compte Claude Code réglé à deux endroits (risque faible à la clôture ; constat 1 de l'essai du site de travail) :
// `inventaire.claude-code.home` posé seul, l'import, la récolte et le rapport d'un sous-agent lisaient encore `~/.claude`,
// défaut de leur propre clé. Une seule lecture des comptes du site ; la clé de l'import, posée à la main, reste lue.
test('Compte Claude Code : posé à l’inventaire seul, l’import et la récolte le lisent ; la clé de l’import posée à la main l’emporte', async () => {
  const { chargerConfig, comptesDuSite } = await import('../src/config.js');
  const compte = path.join(tmp(), '.claude-pro'); const autre = path.join(tmp(), '.claude-autre'); const d = tmp(); const f = path.join(d, 'config.yaml');
  for (const [home, id] of [[compte, 's1'], [autre, 's2']]) {
    const t = path.join(home, 'projects', '-ws-demo', `${id}.jsonl`);
    ecrire(t, [JSON.stringify({ type: 'user', sessionId: id, cwd: '/ws/demo', timestamp: '2026-10-01T10:00:00Z', message: { content: id === 's1' ? 'Toujours répondre en français.' : 'Toujours répondre en français, en phrases courtes.' } }),
      JSON.stringify({ type: 'assistant', sessionId: id, cwd: '/ws/demo', timestamp: '2026-10-01T10:00:05Z', requestId: 'r', message: { id: 'm', model: 'modele-x', usage: { input_tokens: 1, output_tokens: 2 } } })].join('\n') + '\n');
    vieillir(t);
  }
  // Le défaut `~` vaut un dossier personnel fictif, vide : rien n'est lu du vrai compte.
  const lire = (texte) => { ecrire(f, texte); const h = process.env.HOME; process.env.HOME = tmp(); try { return chargerConfig(f, 'local'); } finally { process.env.HOME = h; } };
  const sessions = (config) => {
    const s = new Socle({ ...config, donnees: tmp() }); s.importer(); s.indexer();
    const c = s.recolte({ aBlanc: true, regroupeur: () => { throw new Error('rien n’est envoyé'); } }).candidats;
    return [s.sessions({ jours: 3650 }).map((x) => x.session), c.messages, c.caracteres];
  };
  const seul = lire(`site: local\ninventaire:\n  claude-code: { home: ${JSON.stringify(compte)} }\n`);
  assert.deepEqual(sessions(seul), [['s1'], 1, 30], 'l’import et la récolte lisent le compte de l’inventaire');
  assert.deepEqual([comptesDuSite(seul), comptesDuSite(seul, { journal: true })].map((c) => c.map((x) => x.home)), [[compte], [compte]]);
  const deux = lire(`site: local\ninventaire:\n  claude-code: { home: ${JSON.stringify(compte)} }\nimport:\n  claude-code-transcriptions: { home: ${JSON.stringify(autre)} }\n`);
  assert.deepEqual(sessions(deux), [['s2'], 1, 50], 'la clé de l’import, posée à la main, l’emporte pour le journal');
  assert.deepEqual(comptesDuSite(deux).map((x) => x.home), [compte], 'l’inventaire garde le sien');
});

// Seuil de passation en dur (risque faible à la clôture) : sans seuil réglé au profil, le tableau de bord prenait 150 000
// et disait des sessions « lourdes, au-dessus du seuil de passation » alors qu'aucune alerte n'était posée. Le seuil est
// celui du profil, comme pour le crochet ; sans lui, aucun.
test('Seuil de passation : sans seuil au profil, aucune session lourde ; réglé, celles qui le dépassent', () => {
  const home = tmp(); const t = path.join(home, 'projects', '-ws-demo', 's1.jsonl'); const at = new Date(Date.now() - 864e5).toISOString();
  ecrire(t, [1, 2].map((i) => JSON.stringify({ type: 'assistant', sessionId: 's1', cwd: '/ws/demo', timestamp: at, requestId: `r${i}`, message: { id: `m${i}`, model: 'modele-x', usage: { input_tokens: 1, cache_read_input_tokens: 200000, output_tokens: 2 } } })).join('\n') + '\n');
  vieillir(t);
  const r = tmp();
  const s = new Socle({ site: 'local', profil: r, donnees: tmp(), accueil: tmp(), web: {}, tarifs: {}, inventaire: {}, import: { 'claude-code-transcriptions': { home, calme_minutes: 10 } } });
  s.importer();
  const contexte = (passation) => {
    ecrire(path.join(r, 'arbre', 'index.md'), `---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\n${passation ? `config:\n  claude_code: { passation: ${passation} }\n` : ''}---\n`);
    s.catalogue.remplacer(inventaireArbre({}, { depots: [r], projetDe: () => null })); s.indexer();
    const c = s.contexte(); return [c.seuil, c.lourdes_n, c.moyen_7];
  };
  assert.deepEqual(contexte(null), [null, 0, 200000], 'au-dessus de l’ancien défaut, et pourtant aucune session lourde');
  for (const x of ['0', '-1']) assert.deepEqual(contexte(`{ seuil_tokens: ${x} }`), [null, 0, 200000], 'un seuil qui ne pose pas d’alerte : aucun non plus');
  assert.deepEqual(contexte('{ seuil_tokens: 100000 }'), [100000, 1, 200000]);
});

// Lecture de l'amont et de `git config` recopiées (risque faible à la clôture) : la création refaisait la lecture de
// l'amont que fait `etatDepot`, et la liste privée, le contrôle et la pose de l'identité lisaient chacun une clé git à
// leur façon. Une seule lecture de chaque : `etatDepot` et `configGit`, partagées ; aucune copie ne reste.
test('Lecture de l’amont et d’une clé git : une seule fonction de chaque, aucune copie dans les modules', () => gitIsole(async () => {
  const { configGit } = await import('../src/commun.js');
  const { d, g } = depotGit(); g('config', '--unset', 'user.email');
  assert.deepEqual([configGit(d, 'user.name', '--local'), configGit(d, 'user.email', '--local'), configGit(d, 'user.email'), configGit(d, 'user.name')],
    ['Alice Exemple', '', 'compte@exemple.invalid', 'Alice Exemple'], 'une portée, ou la valeur effective');
  const src = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
  const copies = fs.readdirSync(src, { recursive: true }).filter((f) => f.endsWith('.js')).flatMap((f) => {
    const t = fs.readFileSync(path.join(src, f), 'utf8');
    return [[/'config',[^\]\n]*'--get'/, 'commun.js'], [/'--symbolic-full-name', '@\{upstream\}'/, path.join('inventaire', 'depots-git.js')]].filter(([m, seul]) => f !== seul && m.test(t)).map(([m]) => `${f} : ${m}`);
  });
  assert.deepEqual(copies, []);
}, '[user]\n\tname = Compte Fictif\n\temail = compte@exemple.invalid\n'));

// Récolte sans gitleaks en code 0 (risque faible à la clôture) : rien n'était envoyé, mais la commande, et la routine du
// lundi qui la lance, se disaient réussies. Elle sort en code 1.
test('Récolte sans gitleaks : rien n’est envoyé, et la commande sort en code 1', () => {
  const accueil = tmp(); const maison = tmp();
  const coupe = Object.fromEntries(['depots-git', 'claude-code', 'arbre', 'docker', 'claude-desktop'].map((x) => [x, { actif: false }]));
  fs.writeFileSync(path.join(accueil, 'config.yaml'), YAML.stringify({ site: 'local', inventaire: coupe, controles: { gitleaks: path.join(maison, 'inexistant', 'gitleaks') } }));
  const r = spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), 'recolte', '--a-blanc'], { encoding: 'utf8', env: { ...process.env, HOLARCH_HOME: accueil, HOME: maison } });
  assert.match(r.stdout, /rien n'est envoyé : gitleaks absent/);
  assert.equal(r.status, 1, r.stderr);
});

// Copies `*.pose-<pid>` interrompues jamais retirées (risque faible à la clôture) : une pose arrêtée net (le processus tué
// pendant `npm ci`) laissait sa copie, son lien ou son gitleaks temporaire pour toujours. La pose suivante retire ceux
// dont le processus est mort ; celui d'un processus vivant reste.
test('Copies de pose interrompues : retirées à la pose suivante si leur processus est mort, gardées sinon', () => {
  const src = tmp(); const accueil = tmp(); const unites = tmp(); const maison = tmp();
  const g = (...a) => { const r = spawnSync('git', ['-C', src, '-c', 'user.name=t', '-c', 'user.email=t@exemple.invalid', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  g('init', '-q'); fs.mkdirSync(path.join(src, 'bin')); fs.writeFileSync(path.join(src, 'bin', 'holarch.js'), 'console.log(1);\n'); fs.writeFileSync(path.join(src, 'package.json'), '{}\n');
  g('add', '-A'); g('commit', '-qm', 'v1');
  const lancer = (cmd, args, o) => { if (cmd !== 'npm') return spawnSync(cmd, args, o); if (args[0] === 'ci') fs.mkdirSync(path.join(o.cwd, 'node_modules')); return { status: 0, stdout: '', stderr: '' }; };
  const systemctl = (args) => ({ status: 0, stdout: { 'is-enabled': 'enabled\n', 'is-active': 'active\n', 'is-system-running': 'running\n' }[args[0]] ?? '', stderr: '' });
  const mort = spawnSync(process.execPath, ['-e', '0']).pid; const vivant = process.ppid;
  const service = path.join(accueil, 'service'); const outils = path.join(maison, '.local', 'share', 'holarch', 'outils');
  fs.mkdirSync(path.join(service, `0123456789ab.pose-${mort}`, 'node_modules'), { recursive: true }); fs.mkdirSync(path.join(service, `0123456789ab.pose-${vivant}`)); fs.mkdirSync(path.join(service, 'courant.pose-1'));
  fs.symlinkSync('0123456789ab', path.join(service, `courant.pose-${mort}`));
  fs.mkdirSync(outils, { recursive: true }); fs.writeFileSync(path.join(outils, `gitleaks.pose-${mort}`), 'moitié');
  // Le temporaire d'`ecrireSansLien`, qui copie le gitleaks depuis le 2026-10-14 : de même.
  for (const p of [mort, vivant]) fs.writeFileSync(path.join(outils, `gitleaks.${p}.holarch`), 'moitié');
  const bin = path.join(tmp(), 'gitleaks'); fs.writeFileSync(bin, '#!/bin/sh\n', { mode: 0o755 });
  const sv = creerService({ accueil, gitleaks: bin, maison }, { source: src, unites, systemctl, npm: 'npm', lancer, node: '/opt/node/bin/node' });
  const r = sv.poser();
  assert.deepEqual(r.orphelines.sort(), [path.join(service, `0123456789ab.pose-${mort}`), path.join(service, `courant.pose-${mort}`), path.join(outils, `gitleaks.pose-${mort}`), path.join(outils, `gitleaks.${mort}.holarch`)].sort());
  assert.deepEqual(fs.readdirSync(service).filter((n) => n.includes('.pose-')).sort(), [`0123456789ab.pose-${vivant}`, 'courant.pose-1'].sort(), 'celle d’un processus vivant reste, d’un autre utilisateur comprise (pid 1)');
  assert.deepEqual(fs.readdirSync(outils).sort(), ['gitleaks', `gitleaks.${vivant}.holarch`]);
  assert.match(affichage.posee(r).split('\n')[0], new RegExp(`pose\\(s\\) interrompue\\(s\\) retirée\\(s\\) : .*gitleaks\\.pose-${mort}`));
});

// Worktree sous les racines de l'inventaire (voisin vu par les lots 1 à 3) : son `.git` est un fichier, et il était pris
// pour un dépôt de plus ; le premier commit devenait partagé et l'identifiant du projet principal prenait un suffixe. Un
// worktree lié dont le principal est trouvé est écarté ; celui d'un dépôt nu, sans principal, reste le seul à le porter.
test('Inventaire : un worktree lié n’est pas un projet de plus, et l’identifiant du principal ne change pas', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  fs.writeFileSync(path.join(d, 'a.txt'), 'a\n'); g('add', '.'); g('commit', '-qm', 'x');
  const id = `holarch:project:${premierCommit(d)}`;
  g('worktree', 'add', '-q', '--detach', path.join(r, 'branche'));
  assert.deepEqual(inventaireDepots({ racines: [r], profondeur: 2 }, { site: 'local' }).map((f) => [f.id, f.location]), [[id, d]]);
  // Son principal hors des racines, ou un dépôt nu : le worktree est le seul à porter le dépôt.
  const r3 = tmp(); g('worktree', 'add', '-q', '--detach', path.join(r3, 'ailleurs'));
  assert.deepEqual(inventaireDepots({ racines: [r3], profondeur: 2 }, { site: 'local' }).map((f) => [f.id, f.location]), [[id, path.join(r3, 'ailleurs')]]);
  const nu = path.join(tmp(), 'nu.git'); spawnSync('git', ['clone', '-q', '--bare', d, nu]);
  const r2 = tmp(); spawnSync('git', ['-C', nu, 'worktree', 'add', '-q', '--detach', path.join(r2, 'travail')]);
  assert.deepEqual(inventaireDepots({ racines: [r2], profondeur: 2 }, { site: 'local' }).map((f) => [f.id, f.location]), [[id, path.join(r2, 'travail')]]);
});

// Reprise d'un dépôt déplacé ou d'un worktree (voisin vu par les lots 1 à 3) : le projet se rattachait, mais l'état du
// dépôt se lisait au chemin du catalogue (le worktree principal), ou, déplacé, se prenait dans l'inventaire de l'heure.
// Il se lit dans le dépôt du dossier de travail quand c'est celui du projet ; un dépôt imbriqué étranger ne parle pas pour lui.
test('Reprise : l’état du dépôt se lit dans le worktree ou au nouveau chemin du dossier de travail', () => {
  const r = tmp(); fs.mkdirSync(path.join(r, 'depot')); const { d, g } = depotGit(path.join(r, 'depot'));
  ecrire(path.join(d, 'arbre', 'index.md'), '---\ntype: guideline\nid: depot\ntitle: Dépôt fictif\nstatus: draft\n---\n'); g('add', '.'); g('commit', '-qm', 'x');
  const id = `holarch:project:${premierCommit(d)}`;
  const accueil = tmp(); const s = new Socle({ site: 'local', donnees: accueil, accueil, web: {}, tarifs: {}, inventaire: {}, import: {} });
  s.catalogue.remplacer([...inventaireArbre({}, { depots: [d], projetDe: () => ({ id }) }), { id, kind: 'project', name: 'depot', status: 'active', location: d, provenance: { source: 't' } }]);
  s.indexer();
  const etat = (dossier) => (resume(s, dossier) ?? '').split('\n').find((l) => l.startsWith('Dépôt :')) ?? null;
  const wt = path.join(r, 'branche'); g('worktree', 'add', '-q', '--detach', wt); fs.writeFileSync(path.join(wt, 'b.txt'), 'b\n');
  assert.deepEqual([etat(d), etat(wt)], [null, 'Dépôt : 1 fichier(s) non commité(s), 0 commit(s) non poussé(s).'], 'le worktree, pas le principal');
  g('worktree', 'remove', '--force', wt);
  // Un dépôt imbriqué étranger (non inventorié) : l'état est celui du projet, qui le voit comme un dossier non suivi.
  const imbrique = path.join(d, 'imbrique'); fs.mkdirSync(imbrique); depotGit(imbrique);
  for (const f of ['e', 'f', 'g', 'h', 'i']) fs.writeFileSync(path.join(imbrique, f), 'x\n');
  assert.equal(etat(imbrique), 'Dépôt : 1 fichier(s) non commité(s), 0 commit(s) non poussé(s).', 'le dossier imbriqué, pas ses cinq fichiers');
  fs.rmSync(imbrique, { recursive: true });
  const ailleurs = path.join(r, 'deplace'); fs.renameSync(d, ailleurs);
  for (const f of ['c.txt', 'd.txt']) fs.writeFileSync(path.join(ailleurs, f), 'x\n');
  assert.equal(etat(ailleurs), 'Dépôt : 2 fichier(s) non commité(s), 0 commit(s) non poussé(s).', 'au nouveau chemin, en direct');
});

// `fichierMarque` lisait par `readFileSync` (voisin vu par les lots 1 à 3) : un FIFO posé dans `.claude/rules/holarch/`
// d'un dépôt, que le conteneur écrit, bloquait `regles appliquer` et l'audit. La marque se lit par la lecture gardée :
// un FIFO ne la porte pas, il n'est ni réécrit ni retiré.
test('Règles d’un dépôt : un FIFO dans le dossier des règles ne bloque ni l’écriture ni l’audit, et reste', () => {
  const depot = tmp(); const dossier = path.join(depot, '.claude', 'rules', 'holarch'); fs.mkdirSync(dossier, { recursive: true });
  for (const n of ['prevu.md', 'ancien.md']) assert.equal(spawnSync('mkfifo', [path.join(dossier, n)]).status, 0);
  const plan = { fichiers: ['a.md', 'prevu.md'].map((fichier) => ({ fichier, contenu: `${MARQUE} : règle ${fichier}\n` })), non: [], signaux: [] };
  // Dans un processus à part, borné dans le temps : un FIFO ouvert en lecture bloquerait le processus entier.
  const src = (f) => JSON.stringify(new URL(`../src/${f}`, import.meta.url).href);
  const script = `import { appliquer } from ${src('regles-claude-code.js')}; import { fichierMarque } from ${src('commun.js')};
    const [d, r, p] = ${JSON.stringify([depot, dossier, plan])};
    const x = (o) => { const y = appliquer(d, r, p, o); return [y.crees, y.ignores, y.retires, y.erreur ?? null]; };
    console.log(JSON.stringify([x({ ecrire: false }), x(), fichierMarque(r + '/ancien.md', '#')]));`;
  const r = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], { encoding: 'utf8', timeout: 15e3 });
  assert.equal(r.signal, null, 'la lecture a bloqué');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [[['a.md'], ['prevu.md'], [], null], [['a.md'], ['prevu.md'], [], null], false], 'un essai (l’audit), l’écriture, et une lecture hors dépôt (le compte)');
  assert.deepEqual(fs.readdirSync(dossier).sort(), ['a.md', 'ancien.md', 'prevu.md']);
  assert.ok(fs.lstatSync(path.join(dossier, 'ancien.md')).isFIFO());
});

// M2, suite (lot 5, décision geste-a-la-main) : un retrait à la main valait pour toujours, pour une clé (une autre valeur
// au profil n'était pas posée) comme pour un crochet ; un crochet dont HOLARCH seul changeait la commande (node mis à
// jour) était reposé, doublant celui que l'auteur avait changé ; aucun geste n'était proposé. Le geste ne vaut que pour
// la valeur à laquelle il répondait : par valeur pour une clé, par rôle et valeur du profil pour un crochet ; `--reposer`
// repose ce qui est nommé ; la pose et l'audit disent les deux gestes.
test('M2 : un retrait à la main ne vaut que pour sa valeur ; un changement de HOLARCH seul ne repose rien ; --reposer repose', async () => {
  const { gesteLaisse } = await import('../src/regles-claude-code.js');
  const home = tmp(); const settings = path.join(home, 'settings.json'); const lu = () => JSON.parse(fs.readFileSync(settings, 'utf8'));
  const vouloir = (reglages, seuil, node = '/opt/node') => reglagesVoulus({ claude_code: { reglages, passation: { seuil_tokens: seuil, reprise: true } } }, { node, holarch: '/opt/holarch.js', accueil: '/srv' });
  const cmd = (v) => v.crochets.map((x) => x.command);
  const presentes = () => Object.values(lu().hooks || {}).flat().flatMap((g) => g.hooks.map((h) => h.command)).sort();
  const notees = () => JSON.parse(fs.readFileSync(path.join(dossierCompte(home), 'reglages.json'), 'utf8'));
  // Cas normal : node mis à jour, l'ancien crochet de HOLARCH présent est retiré, le nouveau posé.
  const v1 = vouloir({ autoCompactWindow: 300000 }, 150000); appliquerReglages(home, v1);
  const v2 = vouloir({ autoCompactWindow: 300000 }, 150000, '/opt/node-24'); const r2 = appliquerReglages(home, v2);
  assert.deepEqual([r2.crochets.retires, r2.crochets.poses, r2.crochets.retires_a_la_main, presentes()], [cmd(v1), cmd(v2), [], [...cmd(v2)].sort()]);
  // À la main : la clé et l'alerte retirées, la reprise changée.
  const c = lu(); delete c.autoCompactWindow; delete c.hooks.UserPromptSubmit; c.hooks.SessionStart[0].hooks[0].command = 'ma-reprise';
  fs.writeFileSync(settings, JSON.stringify(c)); const main = fs.readFileSync(settings, 'utf8');
  // HOLARCH seul change ses commandes : rien n'est reposé ni doublé ; les voulues sont notées à la place des anciennes.
  const v3 = vouloir({ autoCompactWindow: 300000 }, 150000, '/opt/node-26'); const r3 = appliquerReglages(home, v3);
  assert.deepEqual([r3.cles.retirees_a_la_main, r3.crochets.retires_a_la_main, r3.crochets.poses, r3.crochets.poses_a_cote], [['autoCompactWindow'], cmd(v3), [], []]);
  assert.equal(fs.readFileSync(settings, 'utf8'), main, 'settings.json n’est pas réécrit');
  assert.deepEqual(notees(), { cles: { autoCompactWindow: 300000 }, crochets: cmd(v3) });
  // Une autre valeur au profil : la clé est posée ; l'alerte à un autre seuil aussi, et dite (posée à côté) ; la reprise reste laissée.
  const v4 = vouloir({ autoCompactWindow: 400000 }, 200000, '/opt/node-26'); const r4 = appliquerReglages(home, v4);
  assert.deepEqual([r4.cles.posees, r4.cles.retirees_a_la_main, r4.crochets.poses, r4.crochets.poses_a_cote, r4.crochets.retires_a_la_main], [['autoCompactWindow'], [], [cmd(v4)[0]], [cmd(v4)[0]], [cmd(v4)[1]]]);
  assert.deepEqual([lu().autoCompactWindow, presentes(), notees().cles], [400000, [cmd(v4)[0], 'ma-reprise'].sort(), { autoCompactWindow: 400000 }]);
  // La nouvelle valeur retirée à la main : laissée à son tour.
  const c4 = lu(); delete c4.autoCompactWindow; fs.writeFileSync(settings, JSON.stringify(c4));
  assert.deepEqual(appliquerReglages(home, v4).cles.retirees_a_la_main, ['autoCompactWindow']);
  // La pose dit chaque laissé avec ses deux gestes, et ce qui est posé à côté.
  const sortie = (r) => affichage.appliquer({ comptes: [{ compte: 'essai', fichiers: { dossier: home, crees: [], modifies: [], retires: [], inchanges: [], ignores: [] }, permissions: { ajoutees: [], retirees: [], inchangees: [] }, reglages: r }], projets: [] });
  assert.deepEqual(sortie(appliquerReglages(home, v4, { ecrire: false })).split('\n').filter((l) => l.includes('ATTENTION')), [
    '  ATTENTION réglage autoCompactWindow retiré à la main : laissé ; holarch regles appliquer --reposer autoCompactWindow pour le reposer, ou retirer claude_code.reglages.autoCompactWindow du profil pour ne plus le vouloir',
    '  ATTENTION crochet crochet:debut retiré ou changé à la main : laissé ; holarch regles appliquer --reposer crochet:debut pour le reposer, ou retirer claude_code.passation.reprise du profil pour ne plus le vouloir']);
  assert.match(sortie(r4), new RegExp(`^  ATTENTION crochet crochet:alerte posé pour une autre valeur du profil, le précédent ayant été retiré ou changé à la main : changé, il tourne aussi \\(à retirer de ${settings.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')} s'il fait double emploi\\)$`, 'm'));
  assert.equal(gesteLaisse('crochet:veille:Stop'), 'holarch regles appliquer --reposer crochet:veille:Stop pour le reposer, ou retirer la règle qui désigne veille-retardee du profil pour ne plus le vouloir');
  assert.match(gesteLaisse('une clé'), /^holarch regles appliquer --reposer 'une clé' pour le reposer, ou retirer claude_code\.reglages\.une clé du profil/, 'un nom que le shell couperait est cité');
  // --reposer : ce qui est nommé et laissé est posé ; un nom inconnu, ou qui n'est pas laissé, est dit.
  const r5 = appliquerReglages(home, v4, { reposer: ['crochet:debut', 'autoCompactWindow', 'crochet:alerte', 'crochet:veille:Stop'] });
  assert.deepEqual([r5.cles.posees, r5.crochets.poses, r5.reposer], [['autoCompactWindow'], [cmd(v4)[1]], { reposes: ['autoCompactWindow', 'crochet:debut'], inconnus: ['crochet:veille:Stop'], non_laisses: ['crochet:alerte'] }]);
  assert.deepEqual([lu().autoCompactWindow, presentes()], [400000, [...cmd(v4), 'ma-reprise'].sort()], 'reposée à côté de celle que l’auteur a changée, puisqu’il le demande');
  assert.deepEqual(sortie(r5).split('\n').slice(-3), ['  reposé(s) à la demande (--reposer) : autoCompactWindow, crochet:debut',
    '  ATTENTION --reposer : crochet:veille:Stop : ni réglage ni crochet voulu par le profil, rien n\'est reposé', '  ATTENTION --reposer : crochet:alerte : ni retiré ni changé à la main, rien à reposer']);
});

// M2, suite : `holarch regles appliquer --reposer <clé ou rôle>` (répétable) passe à la pose ce qu'il nomme ; une valeur
// absente, ou l'option sans `appliquer`, arrête la commande avant qu'elle n'agisse. Compte, profil et accueil fictifs,
// `HOME` aussi (le gardien de veille se lit sous lui : aucune unité de la vraie session n'est touchée). Voisin du lot 5 :
// un nom inconnu, ou qui n'est pas laissé, sortait en 0 avec un ATTENTION ; reposé sur aucun compte, la commande échoue,
// après avoir fait le reste.
test('M2 : regles appliquer --reposer repose un crochet laissé ; mal formée, l’option arrête tout avant d’agir ; sans effet, elle échoue', () => {
  const maison = tmp(); const accueil = tmp(); const profil = tmp(); const home = path.join(maison, '.claude'); const outils = tmp();
  fs.writeFileSync(path.join(outils, 'systemctl'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  ecrire(path.join(profil, 'arbre', 'index.md'), '---\ntype: guideline\nid: profil\ntitle: Profil\nstatus: draft\nconfig:\n  claude_code: { passation: { seuil_tokens: 150000 } }\n---\n');
  ecrire(path.join(profil, 'arbre', 'rules.yaml'), '- id: rappel\n  statement: Un rappel.\n  status: stable\n  approved: { by: human:alice, at: 2026-10-07 }\n');
  ecrire(path.join(accueil, 'config.yaml'), YAML.stringify({ site: 'local', profil, donnees: accueil, inventaire: { 'claude-code': { home, config: path.join(home, '.claude.json') },
    'depots-git': { actif: false }, arbre: { actif: true, depots: [profil] }, docker: { actif: false }, 'claude-desktop': { actif: false } } }));
  const holarch = (...a) => spawnSync(process.execPath, ['--no-warnings', path.resolve('bin/holarch.js'), 'regles', ...a], { encoding: 'utf8', timeout: 60e3,
    env: { ...process.env, HOME: maison, HOLARCH_HOME: accueil, PATH: `${outils}:${process.env.PATH}` } });
  for (const [a, message] of [[['appliquer', '--reposer'], /--reposer attend une clé/], [['--reposer', 'crochet:alerte'], /--reposer ne vaut qu’avec regles appliquer/]]) {
    const r = holarch(...a); assert.deepEqual([r.status, r.stdout], [2, '']); assert.match(r.stderr, message);
  }
  assert.deepEqual([fs.readdirSync(accueil), fs.existsSync(home)], [['config.yaml'], false], 'rien n’est écrit');
  const r1 = holarch('appliquer'); assert.equal(r1.status, 0, r1.stderr);
  const settings = path.join(home, 'settings.json'); const alerte = () => JSON.parse(fs.readFileSync(settings, 'utf8')).hooks?.UserPromptSubmit?.length ?? 0;
  assert.equal(alerte(), 1);
  const c = JSON.parse(fs.readFileSync(settings, 'utf8')); delete c.hooks; fs.writeFileSync(settings, JSON.stringify(c));
  const r2 = holarch('appliquer'); assert.equal(r2.status, 0, r2.stderr);
  assert.match(r2.stdout, /^  ATTENTION crochet crochet:alerte retiré ou changé à la main : laissé ; holarch regles appliquer --reposer crochet:alerte pour le reposer/m);
  assert.equal(alerte(), 0, 'laissé');
  const r3 = holarch('appliquer', '--reposer', 'crochet:alerte', '--reposer', 'effortLevel'); assert.equal(r3.status, 1, 'un nom inconnu : la commande échoue');
  assert.match(r3.stdout, /^  reposé\(s\) à la demande \(--reposer\) : crochet:alerte$/m);
  assert.match(r3.stdout, /^  ATTENTION --reposer : effortLevel : ni réglage ni crochet voulu par le profil, rien n'est reposé$/m);
  assert.equal(alerte(), 1, 'reposé : le reste est fait');
  const r4 = holarch('appliquer', '--reposer', 'crochet:alerte'); assert.equal(r4.status, 1, 'un nom qui n’est pas laissé : la commande échoue');
  assert.match(r4.stdout, /^  ATTENTION --reposer : crochet:alerte : ni retiré ni changé à la main, rien à reposer$/m);
  fs.writeFileSync(settings, JSON.stringify(c));
  const r5 = holarch('appliquer', '--reposer', 'crochet:alerte'); assert.equal(r5.status, 0, r5.stderr);
  assert.equal(alerte(), 1, 'reposé, sans autre nom : la commande réussit');
});

// M3, suite (lot 5, décision geste-a-la-main) : l'entrée MCP `holarch` réglée ailleurs était laissée par `service poser`,
// mais rien ne la montrait ensuite, ni ne disait comment la repointer. `holarch service` montre l'entrée de chaque compte
// (ce qu'elle lance : copie de service, socle, ou réglée ailleurs) et, laissée, la commande `claude mcp` qui la repointe.
test('M3 : holarch service montre l’entrée MCP de chaque compte, et le geste qui repointe celle réglée ailleurs', async () => {
  const { pourCompte } = await import('../src/commun.js');
  const src = tmp(); const accueil = tmp(); const socle = path.resolve('bin/holarch.js');
  const entrees = { ailleurs: { command: 'node', args: ['--no-warnings', '/opt/autre-holarch/bin/holarch.js', 'mcp'], env: { A: 'x y' } }, socle: { command: 'node', args: [socle, 'mcp'] },
    source: { command: 'node', args: [path.join(src, 'bin', 'holarch.js'), 'mcp'] }, ancienne: { command: 'node', args: [path.join(accueil, 'service', 'abcdef123456', 'bin', 'holarch.js'), 'mcp'] },
    chemin: { command: 'holarch', args: ['mcp'] }, hub: { type: 'http', url: 'https://hub.exemple.invalid/mcp' }, absente: null };
  const comptes = Object.keys(entrees).map((nom) => ({ nom, home: tmp() }));
  for (const c of comptes) if (entrees[c.nom]) fs.writeFileSync(path.join(c.home, '.claude.json'), JSON.stringify({ mcpServers: { holarch: entrees[c.nom] } }));
  const e = creerService({ accueil, comptes }, { source: src, unites: tmp(), systemctl: () => ({ status: 0, stdout: '', stderr: '' }), node: '/opt/node/bin/node' }).etat();
  const bin = binaireService(accueil); const pose = ' : repointée à la prochaine pose (holarch service poser)';
  assert.deepEqual(e.mcp.map((m) => [m.compte, m.lance ?? null, m.etat, Boolean(m.geste)]), [
    ['ailleurs', 'node --no-warnings /opt/autre-holarch/bin/holarch.js mcp', 'réglée ailleurs : laissée', true], ['socle', `node ${socle} mcp`, 'socle', false],
    ['source', `node ${path.join(src, 'bin', 'holarch.js')} mcp`, `socle${pose}`, false], ['ancienne', `node ${entrees.ancienne.args[0]} mcp`, `copie de service${pose}`, false],
    ['chemin', 'holarch mcp', 'non reconnue : laissée', true], ['hub', 'https://hub.exemple.invalid/mcp', 'non reconnue : laissée', true], ['absente', null, 'absente', false]]);
  // Le geste : la même entrée, le chemin remplacé, réécrite dans la portée utilisateur du compte que désigne CLAUDE_CONFIG_DIR.
  const geste = (nom) => e.mcp.find((m) => m.compte === nom).geste;
  const json = (g) => { const m = g.match(/ claude mcp add-json holarch '(.*)' --scope user$/); return JSON.parse(m[1].replace(/'\\''/g, "'")); };
  const home = comptes[0].home;
  assert.ok(geste('ailleurs').startsWith(`CLAUDE_CONFIG_DIR='${home}' claude mcp remove holarch --scope user && CLAUDE_CONFIG_DIR='${home}' claude mcp add-json holarch '`), geste('ailleurs'));
  assert.deepEqual(json(geste('ailleurs')), { command: 'node', args: ['--no-warnings', bin, 'mcp'], env: { A: 'x y' } });
  assert.deepEqual(json(geste('chemin')), { type: 'stdio', command: '/opt/node/bin/node', args: ['--no-warnings', bin, 'mcp'] });
  assert.deepEqual(json(geste('hub')), { type: 'stdio', command: '/opt/node/bin/node', args: ['--no-warnings', bin, 'mcp'] });
  assert.deepEqual([pourCompte(path.join(os.homedir(), '.claude')), pourCompte('/srv/compte b')], ['', "CLAUDE_CONFIG_DIR='/srv/compte b' "], 'le compte par défaut se désigne sans la variable');
  // Un .claude.json illisible : dit, sans arrêter les autres.
  fs.writeFileSync(path.join(comptes[1].home, '.claude.json'), '{ cassé');
  const illisible = creerService({ accueil, comptes }, { source: src, unites: tmp(), systemctl: () => ({ status: 0, stdout: '', stderr: '' }) }).etat().mcp[1];
  assert.deepEqual([illisible.etat, /illisible/.test(illisible.message)], ['illisible', true]);
  // Ce que montre `holarch service`.
  const texte = affichage.service(e).split('\n');
  assert.ok(texte.includes(`serveur MCP holarch du compte ailleurs (${path.join(home, '.claude.json')}) : lance node --no-warnings /opt/autre-holarch/bin/holarch.js mcp ; réglée ailleurs : laissée`), texte.join('\n'));
  assert.equal(texte[texte.indexOf(`serveur MCP holarch du compte ailleurs (${path.join(home, '.claude.json')}) : lance node --no-warnings /opt/autre-holarch/bin/holarch.js mcp ; réglée ailleurs : laissée`) + 2], `    ${geste('ailleurs')}`);
  assert.ok(texte.includes(`serveur MCP holarch du compte socle (${path.join(comptes[1].home, '.claude.json')}) : lance node ${socle} mcp ; socle`));
  assert.ok(texte.includes(`serveur MCP holarch du compte absente (${path.join(comptes[6].home, '.claude.json')}) : absente`));
});

// `.claude/` ignoré par git (lot 5, voisin de R4) : `git add -A` sur le dossier des règles échouait, en indexant quand même
// les règles déjà suivies. Ignoré dès la création (ici par le fichier d'exclusions du compte), l'étape échouait, puis les
// rejeux la disaient « déjà là » sans rien de commité ; ignoré après coup, une règle suivie modifiée faisait échouer
// chaque rejeu. Les règles ignorées sont écrites mais ni ajoutées ni commitées, un geste le dit avec la commande qui
// montre la règle, les suivies se commitent, et la suite de la création continue.
test('Création : un dossier de règles ignoré par git ne bloque plus les rejeux ; un geste le dit', async () => {
  const exclusions = path.join(tmp(), 'exclusions'); fs.writeFileSync(exclusions, '.claude/\n');
  await gitIsole(async () => {
    const { r, s, etats, git } = await bancCreation();
    const d = path.join(r, 'neuf'); const creer = (aBlanc = false) => creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc });
    const regle = path.join('.claude', 'rules', 'holarch', 'tests-verts.md');
    const tete = () => git(d, 'rev-parse', 'HEAD');
    for (const aBlanc of [false, true, false]) {
      const p = await creer(aBlanc); const e = p.etapes.find((x) => x.etape === 'regles');
      assert.deepEqual([e.etat, e.detail.endsWith('; tests-verts.md : ignorée(s) par git, ni ajoutée(s) ni commitée(s)'), e.geste?.commande], ['geste', true, `git -C ${d} check-ignore -v -- ${regle}`], JSON.stringify(p.etapes, null, 1));
      assert.equal(etats(p).audit, aBlanc ? 'a-faire' : 'faite', 'la suite se fait');
    }
    assert.deepEqual([fs.existsSync(path.join(d, regle)), git(d, 'ls-files', '--', '.claude'), git(d, 'status', '--porcelain')], [true, '', ''], 'écrite, ni ajoutée ni commitée');
    const commande = spawnSync('/bin/sh', ['-c', (await creer()).etapes.find((x) => x.etape === 'regles').geste.commande], { encoding: 'utf8' });
    assert.equal(commande.stdout, `${exclusions}:1:.claude/\t${regle}\n`, 'la commande montre la règle');
  }, `[core]\n\texcludesFile = ${exclusions}\n`);
  // Ignoré après coup : la règle suivie, modifiée, se commite ; aucun geste (un fichier suivi n'est jamais ignoré).
  await gitIsole(async () => {
    const { r, s, etats, git } = await bancCreation();
    const d = path.join(r, 'neuf'); const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'] });
    const regle = path.join(d, '.claude', 'rules', 'holarch', 'tests-verts.md');
    assert.equal(etats(await creer()).regles, 'faite');
    fs.appendFileSync(path.join(d, '.gitignore'), '.claude/\n'); git(d, 'commit', '-qam', 'Ignorer .claude');
    const source = path.join(r, 'socle', 'arbre', 'types-transverses', 'methode', 'rules.yaml');
    fs.writeFileSync(source, fs.readFileSync(source, 'utf8').replace('Les tests passent', 'Tous les tests passent'));
    for (const attendu of ['faite', 'deja']) {
      const p = await creer(); const e = p.etapes.find((x) => x.etape === 'regles');
      assert.deepEqual([e.etat, e.geste, etats(p).audit], [attendu, undefined, 'faite'], JSON.stringify(p.etapes, null, 1));
    }
    assert.deepEqual([git(d, 'status', '--porcelain'), git(d, 'log', '-1', '--format=%s')], ['', 'Appliquer les règles HOLARCH']);
    assert.match(git(d, 'show', 'HEAD:.claude/rules/holarch/tests-verts.md'), /^Tous les tests passent/m, 'la règle suivie, modifiée, est commitée');
  });
});

// `.devcontainer/` ignoré par git (voisin du lot 5, même traitement que `.claude/`) : `git add` refusait la configuration
// générée et le script de la clé, et chaque rejeu échouait à l'étape conteneur. Les fichiers ignorés sont écrits mais ni
// ajoutés ni commités, un geste le dit avec la commande qui montre la règle ; un fichier suivi se commite.
test('Création : un dossier .devcontainer ignoré par git ne fait plus échouer l’étape conteneur ; un geste le dit', async () => {
  const etapes = { github: false, conteneur: true, distant: false };
  const appel = 'bash .devcontainer/deploy-key.sh origin || true';
  const fichiers = ['.devcontainer/devcontainer.json', '.devcontainer/deploy-key.sh'];
  const ignores = (d, liste) => [`; ${liste.join(', ')} : ignoré(s) par git, ni ajouté(s) ni commité(s)`, `git -C ${d} check-ignore -v -- ${liste.join(' ')}`];
  const exclusions = path.join(tmp(), 'exclusions'); fs.writeFileSync(exclusions, '.devcontainer/\n');
  await gitIsole(async () => {
    const base = { devcontainer: { image: 'base', remoteUser: 'vscode', postCreateCommand: appel } };
    const { r, s, etats, git } = await bancCreation({ creation: { etapes }, conteneur: base });
    const d = path.join(r, 'neuf'); const creer = (aBlanc = false) => creerProjet(s, { nom: 'neuf', types: ['methode'], aBlanc });
    for (const aBlanc of [false, true, false]) {
      const p = await creer(aBlanc); const e = p.etapes.find((x) => x.etape === 'conteneur');
      const [fin, commande] = ignores(d, fichiers);
      assert.deepEqual([e.etat, e.detail.endsWith(fin), e.geste?.commande], ['geste', true, commande], JSON.stringify(p.etapes, null, 1));
      assert.equal(etats(p).audit, aBlanc ? 'a-faire' : 'faite', 'la suite se fait');
    }
    assert.deepEqual([fs.readFileSync(path.join(d, fichiers[0]), 'utf8'), git(d, 'ls-files', '--', '.devcontainer'), git(d, 'status', '--porcelain')],
      [genererConteneur({ nom: 'neuf', config: { conteneur: base } }).texte, '', ''], 'écrits, ni ajoutés ni commités');
    const commande = spawnSync('/bin/sh', ['-c', (await creer()).etapes.find((x) => x.etape === 'conteneur').geste.commande], { encoding: 'utf8' });
    assert.equal(commande.stdout, fichiers.map((f) => `${exclusions}:1:.devcontainer/\t${f}\n`).join(''), 'la commande montre la règle');
  }, `[core]\n\texcludesFile = ${exclusions}\n`);
  // Ignoré après coup : la configuration suivie, régénérée, se commite ; le script, devenu appelé, est écrit, ignoré et dit.
  await gitIsole(async () => {
    const { r, s, etats, git } = await bancCreation({ creation: { etapes }, conteneur: { devcontainer: { image: 'base', remoteUser: 'vscode', postCreateCommand: 'npm ci' } } });
    const d = path.join(r, 'neuf'); const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'] });
    assert.equal(etats(await creer()).conteneur, 'faite');
    fs.appendFileSync(path.join(d, '.gitignore'), '.devcontainer/\n'); git(d, 'commit', '-qam', 'Ignorer .devcontainer');
    const index = path.join(d, 'arbre', 'index.md');
    fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('types: [methode]\n', `types: [methode]\nconfig:\n  conteneur: { devcontainer: { postCreateCommand: "${appel}" } }\n`));
    git(d, 'commit', '-qam', 'appeler le script');
    const [fin, commande] = ignores(d, [fichiers[1]]);
    for (const [attendu, detail] of [['faite', fichiers.join(', ')], ['deja', fichiers[0]]]) {
      const p = await creer(); const e = p.etapes.find((x) => x.etape === 'conteneur');
      assert.deepEqual([e.etat, e.detail, e.geste?.commande, etats(p).audit], ['geste', `${detail} ${fin}`, commande, 'faite'], `${attendu} : ${JSON.stringify(p.etapes, null, 1)}`);
    }
    assert.deepEqual([git(d, 'status', '--porcelain'), git(d, 'log', '-1', '--format=%s'), git(d, 'ls-files', '--', '.devcontainer'), fs.existsSync(path.join(d, fichiers[1]))],
      ['', 'Régénérer la configuration du conteneur', fichiers[0], true]);
    assert.equal(parseJsonc(git(d, 'show', `HEAD:${fichiers[0]}`)).postCreateCommand, appel, 'la configuration suivie, régénérée, est commitée');
  });
});

// Voisin des voisins du lot 5 (vu le 2026-10-14) : un fichier de base suivi, retiré à la main sous un dossier ignoré
// (ici `arbre/`), était réécrit puis refusé par `git add`, qui l'indexe mais sort en 1 : l'étape fichiers échouait une
// fois, puis le rejeu la disait « déjà là » sans rien commiter. Ajouté comme les règles et le conteneur (`ajouter`).
test('Création : un fichier de base suivi, retiré à la main sous un dossier ignoré, est réécrit et commité sans échec', () => gitIsole(async () => {
  const { r, s, etats, git } = await bancCreation();
  const d = path.join(r, 'neuf'); const creer = () => creerProjet(s, { nom: 'neuf', types: ['methode'], description: 'Un projet neuf.' });
  const index = path.join(d, 'arbre', 'index.md');
  assert.equal(etats(await creer()).fichiers, 'faite');
  fs.appendFileSync(path.join(d, '.gitignore'), 'arbre/\n'); git(d, 'commit', '-qam', 'Ignorer arbre');
  const avant = fs.readFileSync(index, 'utf8'); fs.writeFileSync(index, avant.replace('Un projet neuf.', 'Un projet neuf, changé.')); git(d, 'commit', '-qam', 'Changer la racine');
  fs.rmSync(index);
  const p = await creer(); const e = p.etapes.find((x) => x.etape === 'fichiers');
  assert.deepEqual([e.etat, e.detail, git(d, 'status', '--porcelain'), git(d, 'log', '-1', '--format=%s')], ['faite', 'arbre/index.md', '', 'Compléter les fichiers de base du projet'], JSON.stringify(p.etapes, null, 1));
  assert.equal(git(d, 'show', 'HEAD:arbre/index.md'), avant.trim(), 'réécrit et commité');
}));

// ---- Famille « Chiffres », voisins du lot 1 (choix de l'auteur du 2026-10-14).

// Voisin de N2 : un inventaire déjà en cours quand la création relit le catalogue, après avoir déclaré le projet, passe son
// tour ; l'étape des règles disait alors « projet toujours non déclaré après l'inventaire », qui ne s'était pas fait, puis
// « à rejouer ». Depuis la ligne 238, les règles se lisent dans l'arbre frais, où la déclaration écrite est déjà : elles
// s'appliquent sans attendre l'inventaire.
test('Création : un inventaire en cours après la déclaration n’arrête pas les règles, lues dans l’arbre frais', () => gitIsole(async () => {
  const { stat } = await import('../src/commun.js');
  const { r, s, etats } = await bancCreation();
  const d = path.join(r, 'neuf'); fs.mkdirSync(d); const { g } = depotGit(d);
  ecrire(path.join(d, 'LISEZMOI.md'), 'Neuf.\n'); g('add', '.'); g('commit', '-qm', 'départ');
  await s.inventaire(); s.indexer();
  ecrire(path.join(s.config.donnees, 'inventaire.verrou'), JSON.stringify({ pid: process.pid, debut: stat(process.pid).debut, at: new Date().toISOString() }));
  const p = await creerProjet(s, { nom: 'neuf', types: ['methode'] });
  const e = p.etapes.find((x) => x.etape === 'regles');
  assert.equal(etats(p).declaration, 'faite', JSON.stringify(p.etapes, null, 1));
  assert.deepEqual([e.etat, e.detail], ['faite', '1 créé(s), 0 modifié(s), 0 retiré(s) ; crochet absent']);
  // L'audit lirait l'index d'avant la déclaration (faux écart `regles-a-jour`, journalisé) : il attend l'inventaire en
  // cours, comme `rafraichir`.
  const violes = () => [...s.journal.lire()].filter((x) => x.kind === 'rule.violated').map((x) => x.data);
  const a = p.etapes.find((x) => x.etape === 'audit');
  assert.deepEqual([a.etat, a.detail, violes()], ['a-faire', 'l’audit suit l’inventaire en cours', []], JSON.stringify(p.etapes, null, 1));
  // L'inventaire passé, la création rejouée audite, sans écart.
  fs.rmSync(path.join(s.config.donnees, 'inventaire.verrou'));
  const q = await creerProjet(s, { nom: 'neuf', types: ['methode'] });
  const b = q.etapes.find((x) => x.etape === 'audit');
  assert.deepEqual([b.etat, b.detail, violes()], ['faite', 'aucun écart', []], JSON.stringify(q.etapes, null, 1));
}));

// V6, relecture du lot 2 (choix de l'auteur : jour local partout) : le titre du journal d'un projet créé était le jour
// UTC, que le contrôle `journal-tenu` compare aux dates de commit, en heure locale : un projet créé entre 0 h et 2 h à
// Paris avait un faux écart dès sa création. Fuseau fixé pour le test, comme le test V6 des chiffres.
test('Création : le titre du journal d’un projet créé à 23 h 30 UTC est le jour local du poste', () => gitIsole(async () => {
  const fuseau = process.env.TZ; process.env.TZ = 'Europe/Paris';
  try {
    const { r, s } = await bancCreation({ creation: { journal: 'arbre/log.md' } });
    await creerProjet(s, { nom: 'neuf', types: ['methode'] }, { maintenant: new Date('2026-10-15T23:30:00Z') });
    assert.match(fs.readFileSync(path.join(r, 'neuf', 'arbre', 'log.md'), 'utf8'), /^## 2026-10-16$/m);
  } finally { if (fuseau === undefined) delete process.env.TZ; else process.env.TZ = fuseau; }
}));

// Voisin de N4 : deux écritures de fichier restaient hors des fonctions communes (`ecrireSansLien`, `ecrireJson`). `init`
// écrivait la configuration à travers un lien cassé posé à sa place ; le gitleaks des conteneurs avait sa propre copie
// temporaire, un troisième mécanisme.
test('Écritures : init n’écrit pas à travers un lien cassé ; aucun fichier ne s’écrit hors des fonctions communes', async () => {
  const { ecrireConfigExemple } = await import('../src/config.js');
  const d = tmp(); const ailleurs = path.join(tmp(), 'ailleurs.yaml'); fs.symlinkSync(ailleurs, path.join(d, 'config.yaml'));
  assert.throws(() => ecrireConfigExemple(path.join(d, 'config.yaml')), /config\.yaml est un lien symbolique : rien n’est écrit/);
  assert.ok(!fs.existsSync(ailleurs), 'rien n’est écrit au bout du lien');
  assert.equal(ecrireConfigExemple(path.join(d, 'neuve.yaml')), true); assert.match(fs.readFileSync(path.join(d, 'neuve.yaml'), 'utf8'), /^site: local$/m);
  assert.equal(ecrireConfigExemple(path.join(d, 'neuve.yaml')), false, 'déjà présente : laissée');
  // Seules les fonctions communes écrivent un fichier ; la récolte écrit ses candidats dans un dossier privé (`mkdtemp`).
  const src = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src');
  const directes = fs.readdirSync(src, { recursive: true }).filter((f) => f.endsWith('.js') && !['commun.js', 'recolte.js'].includes(f))
    .filter((f) => /\bwriteFileSync\(/.test(fs.readFileSync(path.join(src, f), 'utf8')));
  assert.deepEqual(directes, []);
});
