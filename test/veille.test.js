// Tests de la veille retardée (étape 3, tranche 12, livraison B ; décision environnement-d-execution) : notes des
// crochets, évaluation des sessions, gardien de la demande d'éveil (remplacée par un processus témoin : Windows n'est
// jamais appelé), unités systemd (systemctl remplacé par un enregistreur), crochets générés, contrôle de l'audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { noter, evaluer, etatGardien, processusSession, vivant, attenteDansTranscription, transcriptionLisible, fichierGardien, fichierErreur, creerGardien, lancerDemande, scriptDemande, commandeWindows, dossierVeille, distante } from '../src/veille.js';
import { creerDistant, creerReveil, etatVeille, etatRoutines } from '../src/distant.js';
import { reglagesVoulus, appliquerReglages, crochetVoulu } from '../src/regles-claude-code.js';
import { materialiserCompte, veilleVoulue } from '../src/materialisation.js';
import { regleDuCompte } from '../src/regles.js';
import { executer } from '../src/controles.js';
import { Journal } from '../src/stockage/journal.js';
import * as affichage from '../bin/affichage.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-'));
const ecrire = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const DISTANTE = { CLAUDE_CODE_ENVIRONMENT_KIND: 'bridge' };
const T0 = Date.parse('2026-10-09T10:00:00Z');
const min = 60e3;
// Processus fictifs : la session vit tant que son numéro est dans `vivants`, avec le même début.
const vivants = new Map([[4242, '777']]);
const enVie = ({ pid, debut }) => vivants.get(pid) === debut;
const session = () => ({ pid: 4242, debut: '777' });
const note = (accueil, evenement, id = 'sess-1', o = {}) => noter({ evenement, entree: { session_id: id, transcript_path: o.transcription || null, cwd: '/home/x/projet-a' }, accueil, env: DISTANTE, maintenant: o.t ?? T0, session: o.session || session });
const ligne = (o) => `${JSON.stringify(o)}\n`;
// Une transcription a la forme de celles de Claude Code : sous un dossier `projects/`.
const transcription = (nom = 's.jsonl') => path.join(tmp(), 'projects', '-dossier', nom);

test('veille : les crochets notent l’état d’une session distante, jamais d’une session locale ; SessionEnd efface la note', () => {
  const accueil = tmp(); const f = path.join(dossierVeille(accueil), 'sess-1.json');
  assert.deepEqual(noter({ evenement: 'UserPromptSubmit', entree: { session_id: 'sess-1' }, accueil, env: {} }), { note: false, raison: 'session locale' });
  assert.ok(!fs.existsSync(f), 'une session locale ne retient rien : l’auteur est devant le poste');
  assert.ok(distante({ CLAUDE_CODE_BRIDGE_SESSION_ID: 'cse_1' }), 'variable documentée d’une session reliée');
  assert.equal(note(accueil, 'UserPromptSubmit').etat, 'travaille');
  const n = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.deepEqual([n.etat, n.depuis, n.pid, n.debut_pid, n.dossier], ['travaille', '2026-10-09T10:00:00.000Z', 4242, '777', '/home/x/projet-a']);
  assert.equal(note(accueil, 'Stop').etat, 'attend');
  assert.equal(note(accueil, 'StopFailure').etat, 'attend', 'une erreur d’API finit aussi le tour');
  assert.equal(note(accueil, 'SessionEnd').etat, 'finie'); assert.ok(!fs.existsSync(f));
  assert.equal(note(accueil, 'Notification').note, false, 'un événement non suivi n’écrit rien');
  // Un identifiant venu de l'entrée du crochet ne devient jamais un chemin hors du dossier.
  assert.equal(note(accueil, 'UserPromptSubmit', '../../evade').note, false);
  assert.deepEqual(fs.readdirSync(dossierVeille(accueil)), []);
});

test('veille : le processus de la session est le premier ancêtre du crochet qui n’est pas un shell ; un numéro réattribué ne la fait pas revivre', () => {
  const procs = { 10: { comm: 'sh', ppid: 9, debut: '1' }, 9: { comm: 'bash', ppid: 8, debut: '1' }, 8: { comm: 'claude', ppid: 2, debut: '55' } };
  assert.deepEqual(processusSession(10, (p) => procs[p] || null), { pid: 8, debut: '55' });
  assert.equal(processusSession(10, () => null), null);
  assert.equal(vivant({ pid: 8, debut: '55' }, (p) => procs[p] || null), true);
  assert.equal(vivant({ pid: 8, debut: '54' }, (p) => procs[p] || null), false, 'même numéro, autre début : un autre processus');
  assert.equal(vivant({ pid: 7, debut: '55' }, (p) => procs[p] || null), false);
  // Le vrai /proc : ce processus de test se reconnaît lui-même.
  const moi = processusSession(process.pid); assert.equal(moi.pid, process.pid); assert.equal(vivant(moi), true);
});

test('veille : sur le vrai /proc, un crochet lancé par un shell trouve le processus qui l’a lancé, et le reconnaît vivant', () => {
  const module = new URL('../src/veille.js', import.meta.url).href;
  const script = `import(${JSON.stringify(module)}).then((m) => { const p = m.processusSession(); console.log(JSON.stringify({ p, vivant: p && m.vivant(p) })); })`;
  const r = spawnSync('/bin/sh', ['-c', `"${process.execPath}" --no-warnings -e '${script}'`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const { p, vivant: v } = JSON.parse(r.stdout);
  assert.equal(p.pid, process.pid, 'le shell est sauté : le processus trouvé est celui qui a lancé le crochet');
  assert.equal(v, true);
  assert.equal(vivant({ pid: process.pid, debut: '0' }), false, 'un autre début : ce n’est pas le même processus');
});

test('veille : une session qui travaille retient la veille ; une attente, moins de 30 min ; une session morte est finie et sa note effacée', () => {
  const accueil = tmp(); const d = dossierVeille(accueil);
  note(accueil, 'UserPromptSubmit', 'a');
  note(accueil, 'Stop', 'b', { t: T0 - 10 * min });
  note(accueil, 'Stop', 'c', { t: T0 - 45 * min });
  note(accueil, 'UserPromptSubmit', 'morte', { session: () => ({ pid: 999, debut: '1' }) });
  ecrire(path.join(d, 'abimee.json'), '{ coupé');
  const e = evaluer({ accueil, maintenant: T0, enVie });
  assert.equal(e.besoin, true);
  assert.deepEqual(e.sessions.map((s) => [s.session, s.etat, s.retient, s.reste_min]), [['a', 'travaille', true, undefined], ['b', 'attend', true, 20], ['c', 'attend', false, undefined]]);
  assert.deepEqual(e.finies, ['morte']);
  assert.ok(fs.existsSync(path.join(d, 'morte.json')), 'une lecture n’efface rien');
  evaluer({ accueil, maintenant: T0, enVie, nettoyer: true });
  assert.ok(!fs.existsSync(path.join(d, 'morte.json')), 'le gardien efface la note d’une session morte');
  assert.ok(fs.existsSync(path.join(d, 'abimee.json')), 'une note illisible n’est ni comptée ni effacée');
  // Plus rien ne travaille et l'attente est échue : la veille n'est plus retenue.
  note(accueil, 'Stop', 'a', { t: T0 - 31 * min }); fs.rmSync(path.join(d, 'b.json'));
  assert.equal(evaluer({ accueil, maintenant: T0, enVie }).besoin, false);
  // Sans processus connu, « travaille » ne se vérifie pas : bornée comme une attente, puis effacée après un jour.
  note(accueil, 'UserPromptSubmit', 'sans-pid', { session: () => null, t: T0 - 40 * min });
  assert.deepEqual(evaluer({ accueil, maintenant: T0, enVie }).sessions.find((s) => s.session === 'sans-pid').etat, 'attend');
  evaluer({ accueil, maintenant: T0 + 2 * 864e5, enVie, nettoyer: true });
  assert.ok(!fs.existsSync(path.join(d, 'sans-pid.json')));
});

test('veille : un tour interrompu (aucun Stop) ou une question à l’auteur restée sans réponse comptent comme une attente', () => {
  const accueil = tmp(); const t = transcription();
  const prompt = { type: 'user', timestamp: '2026-10-09T09:00:00.000Z', message: { content: 'fais X' } };
  const appel = (nom, ts) => ({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', id: 'u1', name: nom, input: {} }] } });
  ecrire(t, ligne(prompt) + ligne(appel('Bash', '2026-10-09T09:01:00.000Z')));
  assert.equal(attenteDansTranscription(t), null, 'un outil en cours : la session travaille');
  ecrire(t, ligne(prompt) + ligne(appel('Bash', '2026-10-09T09:01:00.000Z')) + ligne({ type: 'user', timestamp: '2026-10-09T09:02:00.000Z', message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }));
  assert.equal(attenteDansTranscription(t), Date.parse('2026-10-09T09:02:00.000Z'));
  // La marque lue dans le résultat d'un outil (une transcription affichée, un journal) n'est pas une interruption.
  const lu = { type: 'user', timestamp: '2026-10-09T09:03:00.000Z', message: { content: [{ type: 'tool_result', tool_use_id: 'u1', content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] }] } };
  ecrire(t, ligne(prompt) + ligne(appel('Bash', '2026-10-09T09:01:00.000Z')) + ligne(lu));
  assert.equal(attenteDansTranscription(t), null, 'un résultat d’outil qui contient la marque');
  ecrire(t, ligne(prompt) + ligne({ type: 'user', timestamp: '2026-10-09T09:03:00.000Z', message: { content: 'voici ce que dit le journal : [Request interrupted by user]' } }));
  assert.equal(attenteDansTranscription(t), null, 'la marque citée au milieu d’un message');
  ecrire(t, ligne(prompt) + ligne(appel('Bash', '2026-10-09T09:01:00.000Z')) + ligne({ type: 'user', timestamp: '2026-10-09T09:02:00.000Z', message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }));
  note(accueil, 'UserPromptSubmit', 's', { t: Date.parse('2026-10-09T09:00:00.000Z'), transcription: t });
  const e = (m) => evaluer({ accueil, maintenant: Date.parse(m), enVie }).sessions[0];
  assert.deepEqual([e('2026-10-09T09:20:00Z').etat, e('2026-10-09T09:20:00Z').retient], ['attend', true]);
  assert.equal(e('2026-10-09T09:40:00Z').retient, false, '30 min après l’interruption');
  ecrire(t, ligne(prompt) + ligne(appel('AskUserQuestion', '2026-10-09T09:05:00.000Z')) + ligne({ type: 'assistant', isSidechain: true, timestamp: '2026-10-09T09:06:00.000Z', message: { content: [] } }));
  assert.equal(attenteDansTranscription(t), Date.parse('2026-10-09T09:05:00.000Z'), 'un sous-agent ne masque pas la question');
  assert.equal(e('2026-10-09T09:40:00Z').retient, false, 'une question restée sans réponse ne tient pas le poste éveillé toute la nuit');
  // Une interruption plus ancienne que le message en cours ne compte pas (transcription écrite en différé).
  note(accueil, 'UserPromptSubmit', 's', { t: Date.parse('2026-10-09T10:00:00.000Z'), transcription: t });
  assert.equal(e('2026-10-09T10:20:00Z').etat, 'travaille');
  assert.deepEqual([e('2026-10-09T11:00:00Z').etat, e('2026-10-09T11:00:00Z').depuis], ['attend', '2026-10-09T10:00:00.000Z'], 'rien d’écrit depuis le message : immobile 30 min, elle attend');
});

test('veille : une session qui « travaille » sans que sa transcription bouge depuis 30 min attend (permission, élicitation, Stop manqué) ; une attente suivie d’écritures travaille de nouveau', () => {
  const accueil = tmp(); const t = transcription(); ecrire(t, ligne({ type: 'user', timestamp: '2026-10-09T09:00:00.000Z', message: { content: 'fais X' } }));
  // Une écriture datée, comme Claude Code en ajoute à chaque pas d'un tour.
  const ecrite = (ms) => fs.appendFileSync(t, ligne({ type: 'assistant', timestamp: new Date(ms).toISOString(), message: { content: [] } }));
  const e = (m) => evaluer({ accueil, maintenant: m, enVie }).sessions[0];
  note(accueil, 'UserPromptSubmit', 's', { t: T0, transcription: t });
  // Un `Stop` manqué : la note dit « travaille » des heures ; la transcription, immobile depuis 10 h 05, dit le contraire.
  ecrite(T0 + 5 * min);
  assert.deepEqual([e(T0 + 30 * min).etat, e(T0 + 30 * min).retient], ['travaille', true], 'écrite il y a 25 min');
  assert.deepEqual([e(T0 + 36 * min).etat, e(T0 + 36 * min).depuis, e(T0 + 36 * min).retient], ['attend', new Date(T0 + 5 * min).toISOString(), false]);
  assert.equal(evaluer({ accueil, maintenant: T0 + 10 * 60 * min, enVie }).besoin, false, 'plus tenu éveillé jusqu’à l’archivage');
  // Une demande de permission attend l'auteur ; accordée, le tour reprend et la transcription bouge : la session travaille.
  assert.equal(note(accueil, 'PermissionRequest', 's', { t: T0 + 40 * min, transcription: t }).etat, 'attend');
  ecrite(T0 + 40 * min + 1e3);
  assert.equal(e(T0 + 41 * min).etat, 'attend', 'ce qu’écrit la demande elle-même ne compte pas');
  ecrite(T0 + 50 * min);
  assert.deepEqual([e(T0 + 55 * min).etat, e(T0 + 55 * min).retient], ['travaille', true]);
  assert.equal(note(accueil, 'Elicitation', 's', { t: T0 + 60 * min, transcription: t }).etat, 'attend', 'une élicitation MCP attend aussi');
});

test('veille : l’activité se lit à la dernière entrée datée ; les entrées sans date écrites après la fin d’un tour ne font pas travailler une session qui attend', () => {
  const accueil = tmp(); const t = transcription();
  const datee = (ms, type = 'assistant') => fs.appendFileSync(t, ligne({ type, timestamp: new Date(ms).toISOString(), message: { content: [] } }));
  ecrire(t, ''); datee(T0);
  note(accueil, 'Stop', 's', { t: T0, transcription: t });
  const e = (m) => evaluer({ accueil, maintenant: m, enVie }).sessions[0];
  // Le résumé des crochets de fin de tour arrive quelques secondes après `Stop` : la session attend toujours.
  datee(T0 + 20e3, 'system');
  // Claude Code ajoute ensuite des entrées sans date (mesure de la contre-épreuve : jusqu'à 33 min après) ; le fichier
  // change, la session n'a pas repris.
  for (const type of ['bridge-session', 'last-prompt', 'cost-state', 'mode']) fs.appendFileSync(t, ligne({ type, sessionId: 's' }));
  fs.utimesSync(t, new Date(T0 + 20 * min), new Date(T0 + 20 * min));
  assert.deepEqual([e(T0 + 25 * min).etat, e(T0 + 25 * min).reste_min], ['attend', 5]);
  assert.equal(e(T0 + 31 * min).retient, false);
  // Une transcription sans entrée datée lisible : sa date de modification, à défaut.
  const nue = transcription('nue.jsonl'); ecrire(nue, ligne({ type: 'mode' }));
  fs.utimesSync(nue, new Date(T0 + 10 * min), new Date(T0 + 10 * min));
  note(accueil, 'Stop', 'n', { t: T0, transcription: nue });
  assert.equal(evaluer({ accueil, maintenant: T0 + 15 * min, enVie }).sessions.find((x) => x.session === 'n').etat, 'travaille');
});

test('veille : après Stop, un sous-agent de fond qui écrit retient le poste tant que sa transcription bouge ; un shell de fond, non', () => {
  const accueil = tmp(); const t = transcription('sess.jsonl'); ecrire(t, ligne({ type: 'assistant', timestamp: '2026-10-09T10:00:00.000Z', message: { content: [] } }));
  fs.utimesSync(t, new Date(T0), new Date(T0));
  const agent = path.join(t.replace(/\.jsonl$/, ''), 'subagents', 'agent-a1.jsonl'); ecrire(agent, ligne({ type: 'assistant' }));
  const e = (m) => evaluer({ accueil, maintenant: m, enVie }).sessions[0];
  note(accueil, 'Stop', 's', { t: T0, transcription: t });
  fs.utimesSync(agent, new Date(T0 + 50 * min), new Date(T0 + 50 * min));
  assert.deepEqual([e(T0 + 70 * min).etat, e(T0 + 70 * min).retient], ['travaille', true], 'le sous-agent a écrit il y a 20 min, 70 min après Stop');
  assert.deepEqual([e(T0 + 81 * min).etat, e(T0 + 81 * min).retient], ['attend', false], '30 min sans écriture');
  // Un shell de fond n'écrit dans aucune transcription : l'attente compte depuis Stop.
  fs.rmSync(path.dirname(agent), { recursive: true });
  assert.equal(e(T0 + 31 * min).retient, false);
});

test('veille : une question à l’auteur ne fait pas attendre une session dont un sous-agent de fond écrit après elle', () => {
  const accueil = tmp(); const t = transcription('q.jsonl');
  const question = { type: 'assistant', timestamp: new Date(T0 + 5 * min).toISOString(), message: { content: [{ type: 'tool_use', id: 'u1', name: 'AskUserQuestion', input: {} }] } };
  ecrire(t, ligne({ type: 'user', timestamp: new Date(T0).toISOString(), message: { content: 'fais X' } }) + ligne(question));
  fs.utimesSync(t, new Date(T0 + 5 * min), new Date(T0 + 5 * min));
  const agent = path.join(t.replace(/\.jsonl$/, ''), 'subagents', 'agent-b2.jsonl'); ecrire(agent, ligne({ type: 'assistant' }));
  const e = (m) => evaluer({ accueil, maintenant: m, enVie }).sessions[0];
  note(accueil, 'UserPromptSubmit', 'q', { t: T0, transcription: t });
  fs.utimesSync(agent, new Date(T0 + 40 * min), new Date(T0 + 40 * min));
  assert.deepEqual([e(T0 + 45 * min).etat, e(T0 + 45 * min).retient], ['travaille', true], 'le sous-agent écrivait 35 min après la question');
  assert.deepEqual([e(T0 + 71 * min).etat, e(T0 + 71 * min).retient], ['attend', false], '30 min après sa dernière écriture');
  // Un sous-agent qui s'est tu avant la question : elle fait attendre, depuis qu'elle est posée.
  fs.utimesSync(agent, new Date(T0 + 4 * min), new Date(T0 + 4 * min));
  assert.deepEqual([e(T0 + 20 * min).etat, e(T0 + 20 * min).depuis], ['attend', new Date(T0 + 5 * min).toISOString()]);
});

test('veille : le gardien suit la seule règle, comme les crochets : posé si elle s’applique, accès distant ou non, retiré sinon, laissé si les règles sont illisibles', () => {
  const unites = tmp(); const racine = tmp(); fs.mkdirSync(path.join(racine, 'demo'));
  const appels = []; const actifs = new Set();
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'enable') actifs.add(args.at(-1));
    if (args[0] === 'disable') actifs.delete(args.at(-1));
    return { status: 0, stdout: args[0] === 'is-active' ? (actifs.has(args[1]) ? 'active\n' : 'inactive\n') : args[0] === 'is-enabled' ? 'enabled\n' : '', stderr: '' };
  };
  const g = path.join(unites, 'holarch-veille.service');
  const reveil = creerReveil({ holarch: '/opt/holarch.js', accueil: '/a' }, { unites, systemctl, node: '/opt/node/bin/node' });
  assert.equal(reveil.gardien({ veille: false }).etat, 'règle veille-retardee non appliquée : non posé');
  // La règle approuvée, sans aucun accès distant (session reliée par /remote-control) : `regles appliquer` pose le
  // gardien sans le relancer ; la copie de service, elle, le relance.
  assert.equal(reveil.gardien({ veille: true, relancer: false }).etat, 'posée');
  assert.ok(!fs.existsSync(path.join(unites, 'holarch-reveil.service')), 'sans accès distant, aucun réveil');
  appels.length = 0; assert.equal(reveil.gardien({ veille: true, relancer: false }).etat, 'inchangée'); assert.ok(!appels.includes('restart holarch-veille.service'));
  // Règle indéterminée (règles illisibles, profil absent ou en double) : laissé ; actif, relancé par la copie de service.
  appels.length = 0;
  assert.equal(reveil.gardien({ veille: null, relancer: false }).etat, 'règle veille-retardee indéterminée (règles du compte illisibles, aucun profil ou plusieurs) : laissé');
  assert.ok(!appels.includes('restart holarch-veille.service'));
  assert.match(reveil.gardien({ veille: null }).etat, /indéterminée .* : laissé, relancé$/); assert.ok(appels.includes('restart holarch-veille.service')); assert.ok(fs.existsSync(g));
  actifs.delete('holarch-veille.service'); appels.length = 0;
  assert.match(reveil.gardien({ veille: null }).etat, /: laissé$/, 'arrêté : ni relancé ni démarré'); assert.deepEqual(appels.filter((a) => /^(restart|start|enable)/.test(a)), []);
  actifs.add('holarch-veille.service');
  // Un accès distant n'y touche pas : ni le premier ne le pose, ni le dernier ne le retire.
  const cfg = path.join(tmp(), '.claude.json'); fs.writeFileSync(cfg, '{}');
  const d = creerDistant({ inventaire: { 'claude-code': { config: cfg } }, acces_distant: {} }, { unites, systemctl, claude: '/opt/claude', projets: [{ id: 'holarch:project:demo', nom: 'demo', location: path.join(racine, 'demo') }], accueil: '/a', holarch: '/opt/holarch.js', node: '/opt/node/bin/node' });
  d.activer('demo'); d.desactiver('demo');
  assert.ok(!fs.existsSync(path.join(unites, 'holarch-reveil.timer')), 'le réveil part avec le dernier accès distant');
  assert.ok(fs.existsSync(g) && actifs.has('holarch-veille.service'), 'le gardien reste : la règle s’applique toujours');
  // La règle retirée : le gardien part avec elle.
  assert.equal(reveil.gardien({ veille: false }).etat, 'règle veille-retardee non appliquée : retiré'); assert.ok(!fs.existsSync(g));
  d.activer('demo'); assert.ok(!fs.existsSync(g), 'un accès distant ne le pose pas');
});

test('veille : la pose du gardien ne lève jamais : un systemctl en échec ou une règle illisible se disent, après ce qui est écrit', () => {
  const unites = tmp();
  const enPanne = (args) => (args[0] === 'is-active' || args[0] === 'is-enabled' ? { status: 3, stdout: 'inactive\n', stderr: '' } : { status: 1, stdout: '', stderr: 'Failed to connect to bus: No medium found' });
  const reveil = creerReveil({ holarch: '/opt/holarch.js', accueil: '/a' }, { unites, systemctl: enPanne, node: '/opt/node/bin/node' });
  const r = reveil.gardien({ veille: true, relancer: false });
  assert.deepEqual([r.etat, r.message], ['erreur', 'systemctl --user daemon-reload : Failed to connect to bus: No medium found']);
  // La règle se lit au moment de poser : une lecture qui échoue se dit de même.
  const lue = reveil.gardien({ veille: () => { throw new Error('arbre du profil illisible'); } });
  assert.deepEqual([lue.etat, lue.message], ['erreur', 'arbre du profil illisible']);
  const neuf = creerReveil({ holarch: '/opt/holarch.js', accueil: '/a' }, { unites: tmp(), systemctl: enPanne, node: '/opt/node/bin/node' });
  assert.equal(neuf.gardien({ veille: () => false }).etat, 'règle veille-retardee non appliquée : non posé', 'une fonction qui lit la règle');
});

test('veille : un profil absent ou en double rend la règle indéterminée, pas retirée', () => {
  const sans = regleDuCompte([]);
  assert.equal(sans.indetermine, true); assert.deepEqual(sans.illisibles, []);
  assert.equal(veilleVoulue(sans), null, 'un dépôt de profil absent ou déplacé ne retire pas le gardien');
  const noeud = (arbre, type) => ({ kind: 'node', id: `${arbre}:${type}`, node: type === 'racine' ? '/index.md' : '/contextes/c.md', attributes: { arbre, ...(type === 'racine' ? { racine: true } : { type: 'context' }) } });
  const deux = regleDuCompte(['p1', 'p2'].flatMap((a) => [noeud(a, 'racine'), noeud(a, 'contexte')]));
  assert.match(deux.signaux[0], /plusieurs profils/); assert.equal(veilleVoulue(deux), null);
  const un = regleDuCompte([noeud('p1', 'racine'), noeud('p1', 'contexte')]);
  assert.equal(un.indetermine, undefined); assert.equal(veilleVoulue(un), false, 'un profil sans la règle : non voulue');
  assert.equal(veilleVoulue({ regles: [{ id: 'veille-retardee', applicable: true, controles: ['veille-retardee'] }] }), true);
});

test('veille : un chemin de transcription noté ne se lit que s’il désigne un fichier .jsonl sous projects/ (une FIFO bloquerait le gardien)', () => {
  const accueil = tmp(); const d = path.join(tmp(), 'projects', '-x'); fs.mkdirSync(d, { recursive: true });
  const fifo = path.join(d, 'fifo.jsonl');
  const r = spawnSync('mkfifo', [fifo]); assert.equal(r.status, 0, 'mkfifo disponible');
  note(accueil, 'UserPromptSubmit', 'f', { transcription: fifo });
  const e = evaluer({ accueil, maintenant: T0, enVie });
  assert.deepEqual(e.sessions.map((s) => [s.session, s.etat]), [['f', 'travaille']], 'lue sans bloquer, bornée par sa note');
  assert.equal(transcriptionLisible(fifo), false);
  assert.equal(transcriptionLisible('/etc/passwd'), false); assert.equal(transcriptionLisible('relatif/projects/s.jsonl'), false);
  const vraie = path.join(d, 's.jsonl'); ecrire(vraie, '{}\n'); assert.equal(transcriptionLisible(vraie), true);
});

test('veille : une note réécrite par un crochet entre sa lecture et son effacement n’est pas effacée', () => {
  const accueil = tmp(); const f = path.join(dossierVeille(accueil), 'r.json');
  note(accueil, 'UserPromptSubmit', 'r', { session: () => ({ pid: 999, debut: '1' }) });
  // Le processus noté est mort ; pendant l'évaluation, la session reprend sous un nouveau processus et réécrit sa note.
  const reprise = ({ pid }) => { if (pid === 999) note(accueil, 'UserPromptSubmit', 'r', { session }); return enVie({ pid, debut: pid === 999 ? '1' : '777' }); };
  evaluer({ accueil, maintenant: T0, enVie: reprise, nettoyer: true });
  assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).pid, 4242, 'la note réécrite reste');
  evaluer({ accueil, maintenant: T0, enVie, nettoyer: true });
  assert.ok(fs.existsSync(f), 'la session vit');
});

// Demande d'éveil témoin : dit « tenue », tient jusqu'à la fin de son entrée standard.
const TEMOIN = [process.execPath, '-e', "process.stdout.write('tenue\\n'); process.stdin.resume(); process.stdin.on('end', () => process.exit(0));"];

test('veille : le gardien tient la demande d’éveil tant qu’une session l’interdit, la relâche ensuite, et le dit au journal', async () => {
  const accueil = tmp(); const journal = new Journal(accueil, 'local'); const horloge = { t: T0 };
  const kinds = () => [...journal.lire()].map((e) => e.kind);
  const g = creerGardien({ accueil, journal, commande: TEMOIN, maintenant: () => horloge.t });
  await g.passer(); assert.equal(g.tenue(), false); assert.deepEqual(kinds(), [], 'sans session, rien n’est tenu');
  note(accueil, 'UserPromptSubmit', 'a', { session: () => processusSession(process.pid) });
  await g.passer(); assert.equal(g.tenue(), true);
  const tenue = [...journal.lire()][0];
  assert.deepEqual([tenue.kind, tenue.actor, tenue.data.sessions], ['power.held', 'system:veille', [{ session: 'a', etat: 'travaille', projet: 'projet-a' }]]);
  await g.passer(); assert.deepEqual(kinds(), ['power.held'], 'un passage de plus ne relance rien');
  // Une session arrive puis part pendant la tenue : la tenue se redit avec ses sessions ; un changement d'état, non.
  note(accueil, 'UserPromptSubmit', 'b', { session: () => processusSession(process.pid), t: horloge.t });
  await g.passer(); assert.deepEqual([...journal.lire()].at(-1).data.sessions.map((x) => x.session), ['a', 'b']);
  note(accueil, 'SessionEnd', 'b'); await g.passer();
  assert.deepEqual([...journal.lire()].at(-1).data.sessions.map((x) => x.session), ['a']);
  assert.deepEqual(kinds(), ['power.held', 'power.held', 'power.held']);
  note(accueil, 'Stop', 'a', { session: () => processusSession(process.pid) });
  horloge.t += 29 * min; await g.passer(); assert.equal(g.tenue(), true, 'attente de moins de 30 min');
  horloge.t += 2 * min; await g.passer(); assert.equal(g.tenue(), false);
  assert.deepEqual(kinds(), ['power.held', 'power.held', 'power.held', 'power.released'], 'passer en attente ne redit pas la tenue');
  assert.equal([...journal.lire()].at(-1).data.raison, 'aucune-session');
  // À l'arrêt du service, la demande tenue est relâchée et dite.
  note(accueil, 'UserPromptSubmit', 'a', { session: () => processusSession(process.pid), t: horloge.t });
  await g.passer(); assert.equal(g.tenue(), true); await g.arreter(); assert.equal(g.tenue(), false);
  assert.equal([...journal.lire()].at(-1).data.raison, 'arret');
});

test('veille : une demande refusée ou absente se dit une fois ; morte hors du gardien, elle est reprise au passage suivant', async () => {
  const accueil = tmp(); const journal = new Journal(accueil, 'local');
  const evs = () => [...journal.lire()];
  note(accueil, 'UserPromptSubmit', 'a', { session: () => processusSession(process.pid), t: Date.now() });
  const refusee = creerGardien({ accueil, journal, commande: [process.execPath, '-e', "console.log('refusee : PowerSetRequest'); process.exit(3)"] });
  await refusee.passer(); await refusee.passer();
  assert.deepEqual(evs().map((e) => e.kind), ['power.failed'], 'la même panne n’est pas répétée à chaque passage');
  assert.deepEqual(evs()[0].data, { motif: 'refusee', code: 3 }, 'ni la sortie de PowerShell ni un chemin au journal');
  const sans = creerGardien({ accueil, journal, commande: null }); await sans.passer(); await sans.passer();
  assert.deepEqual(evs().at(-1).data, { motif: 'sans-mecanisme' }); assert.equal(evs().length, 2);
  const traces = []; const nonLancee = creerGardien({ accueil, journal, commande: ['/nulle/part/powershell.exe'], log: (m) => traces.push(m) });
  await nonLancee.passer();
  assert.deepEqual(evs().at(-1).data, { motif: 'non-lancee' }); assert.match(traces.at(-1), /non lancée : .*\/nulle\/part/, 'le détail va au log du gardien');
  // Le mécanisme absent au démarrage du service, présent ensuite : cherché à chaque besoin, la demande vient.
  const monte = { c: null }; const tardif = creerGardien({ accueil, commande: () => monte.c });
  await tardif.passer(); assert.equal(tardif.tenue(), false);
  monte.c = TEMOIN; await tardif.passer(); assert.equal(tardif.tenue(), true, 'Windows monté après le démarrage'); await tardif.arreter();
  // Sans réponse dans le délai : arrêtée et dite.
  await assert.rejects(lancerDemande([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { delai: 300 }), /sans réponse/);
  await assert.rejects(lancerDemande(['/nulle/part/powershell.exe']), /non lancée/);
  const horloge = { t: Date.now() };
  const g = creerGardien({ accueil, journal, commande: TEMOIN, maintenant: () => horloge.t });
  await g.passer(); assert.equal(g.tenue(), true);
  // La demande meurt hors du gardien (processus Windows tué) : panne dite, demande reprise 30 s plus tard.
  const avant = evs().length;
  process.kill(g.pid(), 'SIGKILL');
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(g.tenue(), false); assert.deepEqual(evs()[avant].data, { motif: 'arretee' }, 'tuée par un signal : pas de code');
  await g.passer(); assert.equal(g.tenue(), false, 'morte aussitôt tenue : pas relancée au passage suivant');
  horloge.t += 31e3; await g.passer(); assert.equal(g.tenue(), true, 'reprise 30 s plus tard'); await g.arreter();
});

test('veille : une demande qui meurt aussitôt tenue n’est pas relancée à chaque passage, ni redite au journal ; une tenue durable remet à zéro et se dit', async () => {
  const accueil = tmp(); const journal = new Journal(accueil, 'local'); const horloge = { t: Date.now() };
  const kinds = () => [...journal.lire()].map((e) => e.kind);
  const pause = () => new Promise((ok) => setTimeout(ok, 300));
  const MEURT = [process.execPath, '-e', "process.stdout.write('tenue\\n')"];
  const cmd = { c: MEURT }; let lancements = 0;
  const g = creerGardien({ accueil, journal, commande: () => { lancements += 1; return cmd.c; }, maintenant: () => horloge.t });
  note(accueil, 'UserPromptSubmit', 'a', { session: () => processusSession(process.pid), t: horloge.t });
  await g.passer(); await pause();
  assert.deepEqual(kinds(), ['power.held', 'power.failed']); assert.equal(lancements, 1);
  horloge.t += 10e3; await g.passer(); assert.equal(lancements, 1, 'pas avant 30 s');
  horloge.t += 25e3; await g.passer(); await pause(); assert.equal(lancements, 2);
  horloge.t += 40e3; await g.passer(); assert.equal(lancements, 2, 'puis pas avant 60 s');
  horloge.t += 30e3; await g.passer(); await pause(); assert.equal(lancements, 3);
  assert.deepEqual(kinds(), ['power.held', 'power.failed'], 'ni la tenue ni la panne redites');
  // La demande tient de nouveau, plus d'une minute : tout est remis à zéro, la tenue tue jusque-là se dit (le poste est
  // tenu) ; la panne suivante se dit.
  cmd.c = TEMOIN; horloge.t += 130e3; await g.passer(); assert.equal(g.tenue(), true);
  assert.deepEqual(kinds(), ['power.held', 'power.failed'], 'pas avant d’être durable');
  horloge.t += 61e3; await g.passer();
  assert.deepEqual(kinds(), ['power.held', 'power.failed', 'power.held']);
  horloge.t += 30e3; await g.passer();
  process.kill(g.pid(), 'SIGKILL'); await pause();
  assert.deepEqual(kinds(), ['power.held', 'power.failed', 'power.held', 'power.failed']);
  await g.passer(); assert.equal(g.tenue(), true, 'après une tenue durable, reprise au passage suivant'); await g.arreter();
});

test('veille : le script de la demande échappe sa raison, passe encodé et laisse l’entrée standard libre', () => {
  const s = scriptDemande("l'auteur");
  assert.match(s, /SimpleReasonString = 'l''auteur'/);
  assert.match(s, /PowerSetRequest\(\$h, 1\)/, 'PowerRequestSystemRequired : la veille, pas l’écran');
  assert.match(s, /while \(\$null -ne \[Console\]::In\.ReadLine\(\)\)/);
  const c = commandeWindows({ powershell: '/mnt/c/ps.exe', raison: 'r' });
  assert.deepEqual(c.slice(0, 4), ['/mnt/c/ps.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.equal(Buffer.from(c[4], 'base64').toString('utf16le'), scriptDemande('r'));
  assert.equal(commandeWindows({ powershell: null }), null);
});

test('veille : la copie de service pose le gardien, le réécrit ou le relance ; coupé à la main, jamais rallumé ; une unité de la main jamais touchée', () => {
  const unites = tmp();
  const appels = []; const actifs = new Set(); const coupees = new Set();
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'enable') { actifs.add(args.at(-1)); coupees.delete(args.at(-1)); }
    if (args[0] === 'disable') { actifs.delete(args.at(-1)); coupees.add(args.at(-1)); }
    const out = args[0] === 'is-active' ? (actifs.has(args[1]) ? 'active\n' : 'inactive\n') : args[0] === 'is-enabled' ? (coupees.has(args[1]) ? 'disabled\n' : 'enabled\n') : '';
    return { status: 0, stdout: out, stderr: '' };
  };
  const pose = (holarch, o = { node: '/opt/node/bin/node' }) => creerReveil({ holarch, accueil: '/a' }, { unites, systemctl, ...o });
  assert.deepEqual(etatVeille({ unites, systemctl }), { unite: 'holarch-veille.service', gardien: 'absent' });
  assert.deepEqual(pose('/opt/holarch.js').gardien({ veille: true }), { unite: 'holarch-veille.service', etat: 'posée' });
  const texte = fs.readFileSync(path.join(unites, 'holarch-veille.service'), 'utf8');
  assert.match(texte, /^ExecStart="\/opt\/node\/bin\/node" --no-warnings "\/opt\/holarch.js" veille tenir$/m);
  assert.match(texte, /^Restart=on-failure$/m); assert.match(texte, /^StandardError=journal$/m);
  assert.ok(appels.includes('enable --now holarch-veille.service'));
  assert.match(texte, /Posée et retirée avec la règle veille-retardee/);
  assert.deepEqual(etatVeille({ unites, systemctl }), { unite: 'holarch-veille.service', gardien: 'actif' });
  assert.deepEqual(etatRoutines({ unites, systemctl }).at(-1), { unite: 'holarch-veille.service', etat: 'activée' });
  // La copie posée : le gardien suit la copie et redémarre (il relâche puis reprend la demande).
  appels.length = 0;
  assert.deepEqual(pose('/v2/holarch.js').gardien({ veille: true }), { unite: 'holarch-veille.service', etat: 'réécrite' }); assert.ok(appels.includes('restart holarch-veille.service'));
  // Le cas réel : le binaire est le lien `courant`, dont le chemin ne change pas ; le gardien est relancé quand même.
  appels.length = 0;
  assert.deepEqual(pose('/v2/holarch.js').gardien({ veille: true }), { unite: 'holarch-veille.service', etat: 'relancée' }); assert.ok(appels.includes('restart holarch-veille.service'));
  // Coupé à la main : réécrit, jamais rallumé (décision routines-posees).
  systemctl(['disable', '--now', 'holarch-veille.service']); appels.length = 0;
  assert.equal(pose('/v3/holarch.js').gardien({ veille: true }).etat, 'coupée à la main : laissée');
  assert.deepEqual(appels.filter((a) => /^(enable|restart|start)/.test(a)), []);
  assert.match(fs.readFileSync(path.join(unites, 'holarch-veille.service'), 'utf8'), /"\/v3\/holarch.js" veille tenir/);
  assert.equal(etatVeille({ unites, systemctl }).gardien, 'coupé');
  // Une unité de la main n'est jamais touchée.
  ecrire(path.join(unites, 'holarch-veille.service'), '[Service]\nExecStart=/bin/true\n');
  assert.equal(pose('/v4/holarch.js', {}).gardien({ veille: true }).etat, 'non écrite par HOLARCH : laissée');
  assert.equal(pose('/v4/holarch.js', {}).gardien({ veille: false }).etat, 'non écrite par HOLARCH : laissée');
  assert.equal(fs.readFileSync(path.join(unites, 'holarch-veille.service'), 'utf8'), '[Service]\nExecStart=/bin/true\n');
});

test('veille : une règle applicable qui désigne le contrôle pose les crochets ; une règle brouillon n’en pose aucun ; leur absence se dit', () => {
  const o = { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv/a' };
  const v = reglagesVoulus({}, { ...o, veille: true });
  assert.deepEqual(v.crochets.map((c) => c.evenement), ['UserPromptSubmit', 'Stop', 'StopFailure', 'PermissionRequest', 'Elicitation', 'SessionEnd']);
  assert.equal(v.crochets[1].command, `{ [ -n "$CLAUDE_CODE_BRIDGE_SESSION_ID" ] || [ "$CLAUDE_CODE_ENVIRONMENT_KIND" = bridge ]; } && HOLARCH_HOME='/srv/a' '/opt/node' --no-warnings '/opt/holarch.js' veille noter Stop 2>/dev/null || true`);
  // Lancée par le shell comme Claude Code lance un crochet : une session locale ne démarre pas node ; une distante, si.
  const temoin = path.join(tmp(), 'lance'); const faux = path.join(tmp(), 'node'); fs.writeFileSync(faux, `#!/bin/sh\ntouch '${temoin}'\n`, { mode: 0o755 });
  const commande = reglagesVoulus({}, { ...o, node: faux, veille: true }).crochets[0].command;
  const lancer = (env) => { fs.rmSync(temoin, { force: true }); const r = spawnSync('/bin/sh', ['-c', commande], { env: { PATH: process.env.PATH, ...env } }); return [r.status, fs.existsSync(temoin)]; };
  assert.deepEqual(lancer({}), [0, false], 'session locale : rien de lancé, le tour continue');
  assert.deepEqual(lancer({ CLAUDE_CODE_ENVIRONMENT_KIND: 'bridge' }), [0, true]);
  assert.deepEqual(lancer({ CLAUDE_CODE_BRIDGE_SESSION_ID: 'cse_1' }), [0, true]);
  assert.deepEqual(lancer({ CLAUDE_CODE_ENVIRONMENT_KIND: 'local' }), [0, false]);
  assert.deepEqual(crochetVoulu(v.crochets[5].command), { regle: 'veille-retardee', cle: 'crochet:veille:SessionEnd', message: 'crochet de veille non posé (SessionEnd)' });
  // Une règle d'un autre nom qui désigne le contrôle : le crochet absent lui revient.
  assert.equal(crochetVoulu(v.crochets[5].command, [{ id: 'garder-eveil', applicable: true, controles: ['veille-retardee'] }]).regle, 'garder-eveil');
  assert.equal(crochetVoulu(v.crochets[5].command, [{ id: 'garder-eveil', applicable: false, controles: ['veille-retardee'] }]).regle, 'veille-retardee');
  // Les crochets de passation gardent leur commande (rien à reposer après ce changement).
  assert.equal(reglagesVoulus({ claude_code: { passation: { reprise: true } } }, o).crochets[0].command, "HOLARCH_HOME='/srv/a' '/opt/node' --no-warnings '/opt/holarch.js' contexte debut 2>/dev/null || true");
  const regle = (statut) => ({ id: 'veille-retardee', fiche: 'f', niveau: 'blocking', controles: ['veille-retardee'], statut, origine: 'profil', applicable: statut === 'stable', provenance: { arbre: 'p', noeud: 'n' } });
  const home = tmp();
  const [brouillon] = materialiserCompte({ regles: [regle('draft')], config: {} }, [{ home }], { ...o, ecrire: false });
  assert.deepEqual(brouillon.reglages.crochets.poses, []);
  const [m] = materialiserCompte({ regles: [regle('stable')], config: {} }, [{ home }], o);
  assert.equal(m.reglages.crochets.poses.length, 6); assert.deepEqual(m.plan.fichiers, [], 'aucune consigne dans le contexte');
  const s = JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8'));
  assert.deepEqual(Object.keys(s.hooks).sort(), ['Elicitation', 'PermissionRequest', 'SessionEnd', 'Stop', 'StopFailure', 'UserPromptSubmit']);
  assert.equal(appliquerReglages(home, reglagesVoulus({}, { holarch: o.holarch, accueil: o.accueil, veille: true })).crochets.inchanges.length, 6, 'idempotent');
  const [retire] = materialiserCompte({ regles: [regle('deprecated')], config: {} }, [{ home }], o);
  assert.equal(retire.reglages.crochets.retires.length, 6, 'retirés avec la règle');
  assert.equal(JSON.parse(fs.readFileSync(path.join(home, 'settings.json'), 'utf8')).hooks, undefined);
});

test('veille : le contrôle veut le gardien actif dès que la règle s’applique, accès distant ou non ; non disponible sans mécanisme', () => {
  const c = (veille) => executer('veille-retardee', { veille }, 'audit');
  assert.match(c({ mecanisme: null, gardien: 'absent' }).indisponible, /aucun mécanisme/);
  assert.deepEqual(c({ mecanisme: '/ps', gardien: 'actif' }), { ecarts: [] });
  const absent = c({ mecanisme: '/ps', gardien: 'absent' }).ecarts;
  assert.deepEqual(absent.map((x) => x.cle), ['gardien'], 'sans accès distant aussi : une session reliée par /remote-control');
  assert.match(absent[0].message, /gardien de veille absent : la veille n'est pas retardée \(holarch regles appliquer le pose\)/);
  const coupe = c({ mecanisme: '/ps', gardien: 'coupé' }).ecarts;
  assert.equal(coupe[0].message, 'gardien de veille coupé : la veille n\'est pas retardée', 'coupé à la main : la pose ne le rallume pas, rien à conseiller');
});

test('veille : une erreur du crochet, configuration illisible comprise, ne fait pas échouer le tour ; gardée datée, le contrôle la dit une semaine', () => {
  const accueil = tmp(); fs.writeFileSync(path.join(accueil, 'config.yaml'), 'site: [illisible\n');
  const bin = path.join(import.meta.dirname, '..', 'bin', 'holarch.js');
  const r = spawnSync(process.execPath, ['--no-warnings', bin, 'veille', 'noter', 'Stop'], { input: '{"session_id":"s1"}', encoding: 'utf8', env: { ...process.env, HOLARCH_HOME: accueil, CLAUDE_CODE_ENVIRONMENT_KIND: 'bridge' } });
  assert.equal(r.status, 0, 'un crochet ne fait jamais échouer un tour');
  const erreur = JSON.parse(fs.readFileSync(fichierErreur(accueil), 'utf8'));
  assert.equal(erreur.evenement, 'Stop'); assert.ok(erreur.message.length > 0);
  const c = () => executer('veille-retardee', { veille: { mecanisme: '/ps', gardien: 'actif', besoin: false }, accueil }, 'audit').ecarts;
  const e = c();
  assert.deepEqual(e.map((x) => x.cle), ['crochet']); assert.match(e[0].message, /^crochet de veille en erreur le \d{4}-\d\d-\d\d \d\d:\d\d \(Stop\)/, 'à l’heure locale, comme holarch veille');
  assert.ok(!e[0].message.includes(accueil), 'ni chemin ni message dans l’écart');
  ecrire(fichierErreur(accueil), JSON.stringify({ ...erreur, at: new Date(Date.now() - 8 * 864e5).toISOString() }));
  assert.deepEqual(c(), [], 'plus d’une semaine : plus dite');
});

test('veille : le contrôle compare ce que le gardien dit tenir à ce que demandent les sessions, accès distant ou /remote-control', async () => {
  const lu = tmp();
  // `ecrit` : ce que le gardien a écrit à son dernier passage (absent : aucun passage).
  const c = (veille, ecrit) => {
    if (ecrit) ecrire(fichierGardien(lu), JSON.stringify(ecrit)); else fs.rmSync(fichierGardien(lu), { force: true });
    return executer('veille-retardee', { veille: { mecanisme: '/ps', ...veille }, accueil: lu }, 'audit').ecarts.map((x) => x.cle);
  };
  const frais = { maj: new Date().toISOString(), besoin: true, tenue: true }; const vieux = new Date(Date.now() - 5 * min).toISOString();
  assert.deepEqual(c({ gardien: 'actif', besoin: true }, frais), []);
  assert.deepEqual(c({ gardien: 'actif', besoin: true }, { ...frais, tenue: false }), ['retenue'], 'le gardien tourne mais ne tient rien');
  assert.deepEqual(c({ gardien: 'actif', besoin: true }, { ...frais, maj: vieux }), ['retenue'], 'gardien bloqué : plus de passage');
  assert.deepEqual(c({ gardien: 'absent', besoin: true }, null), ['gardien', 'retenue'], 'session reliée par /remote-control, sans gardien');
  assert.deepEqual(c({ gardien: 'actif', besoin: false }, null), []);
  // Une demande tenue sans besoin : relâchée au prochain passage d'un gardien qui passe ; dite quand il ne passe plus.
  assert.deepEqual(c({ gardien: 'actif', besoin: false }, frais), [], 'relâchée au passage suivant');
  assert.deepEqual(c({ gardien: 'actif', besoin: false }, { ...frais, maj: vieux }), ['sans-besoin'], 'gardien bloqué qui tenait la demande');
  assert.deepEqual(c({ gardien: 'arrêté', besoin: false }, { ...frais, maj: vieux }), ['gardien'], 'arrêté, sa demande est morte avec lui');
  // Le gardien écrit à chaque passage ce qu'il tient ; le contrôle le lit sur le poste (accueil du site).
  const accueil = tmp();
  const g = creerGardien({ accueil, commande: TEMOIN });
  note(accueil, 'UserPromptSubmit', 'a', { session: () => processusSession(process.pid), t: Date.now() });
  await g.passer();
  const ecrit = JSON.parse(fs.readFileSync(fichierGardien(accueil), 'utf8'));
  assert.deepEqual([ecrit.besoin, ecrit.tenue], [true, true]);
  assert.ok(!fs.readdirSync(dossierVeille(accueil)).includes('veille-gardien.json'), 'hors du dossier des notes que le gardien surveille');
  await g.arreter();
  assert.equal(JSON.parse(fs.readFileSync(fichierGardien(accueil), 'utf8')).tenue, false, 'arrêté, il ne tient plus rien');
});

test('veille : holarch veille et le contrôle disent la même chose de la demande d’éveil (une seule lecture, l’heure locale)', () => {
  // Le cas de la contre-épreuve : un état du gardien vieux de 3 h qui disait tenir la demande, le gardien arrêté, une
  // session qui travaille.
  const accueil = tmp();
  ecrire(fichierGardien(accueil), JSON.stringify({ maj: new Date(Date.now() - 3 * 60 * min).toISOString(), besoin: true, tenue: true }));
  const etat = etatGardien({ accueil, gardien: 'arrêté', besoin: true });
  assert.deepEqual([etat.tenue, etat.frais], [false, false]);
  const vue = affichage.veille({ sessions: [], finies: [], mecanisme: '/ps', unite: 'holarch-veille.service', ...etat });
  assert.match(vue, /une session retient la veille ; demande d’éveil non tenue/);
  const ecarts = executer('veille-retardee', { veille: { mecanisme: '/ps', gardien: 'arrêté', besoin: true }, accueil }, 'audit').ecarts;
  const retenue = ecarts.find((x) => x.cle === 'retenue').message;
  assert.ok(vue.includes(`à voir : ${retenue}`), 'le même constat, mot pour mot');
  assert.match(retenue, /dernier passage du gardien le \d{4}-\d\d-\d\d \d\d:\d\d\)/);
  // L'erreur d'un crochet se voit aussi dans la vue.
  ecrire(fichierErreur(accueil), JSON.stringify({ at: new Date().toISOString(), evenement: 'Stop', message: 'x' }));
  const avecErreur = affichage.veille({ sessions: [], finies: [], mecanisme: '/ps', unite: 'holarch-veille.service', ...etatGardien({ accueil, gardien: 'actif', besoin: false }) });
  assert.match(avecErreur, /à voir : crochet de veille en erreur le .* \(Stop\)/);
});
