// Tests de la veille retardée (étape 3, tranche 12, livraison B ; décision environnement-d-execution) : notes des
// crochets, évaluation des sessions, gardien de la demande d'éveil (remplacée par un processus témoin : Windows n'est
// jamais appelé), unités systemd (systemctl remplacé par un enregistreur), crochets générés, contrôle de l'audit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { noter, evaluer, processusSession, vivant, attenteDansTranscription, creerGardien, lancerDemande, scriptDemande, commandeWindows, dossierVeille, distante } from '../src/veille.js';
import { creerDistant, creerReveil, etatVeille, etatRoutines } from '../src/distant.js';
import { reglagesVoulus, appliquerReglages, crochetVoulu } from '../src/regles-claude-code.js';
import { materialiserCompte } from '../src/materialisation.js';
import { executer } from '../src/controles.js';
import { Journal } from '../src/stockage/journal.js';

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
  const accueil = tmp(); const t = path.join(tmp(), 's.jsonl');
  const prompt = { type: 'user', timestamp: '2026-10-09T09:00:00.000Z', message: { content: 'fais X' } };
  const appel = (nom, ts) => ({ type: 'assistant', timestamp: ts, message: { content: [{ type: 'tool_use', id: 'u1', name: nom, input: {} }] } });
  ecrire(t, ligne(prompt) + ligne(appel('Bash', '2026-10-09T09:01:00.000Z')));
  assert.equal(attenteDansTranscription(t), null, 'un outil en cours : la session travaille');
  ecrire(t, ligne(prompt) + ligne(appel('Bash', '2026-10-09T09:01:00.000Z')) + ligne({ type: 'user', timestamp: '2026-10-09T09:02:00.000Z', message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }));
  assert.equal(attenteDansTranscription(t), Date.parse('2026-10-09T09:02:00.000Z'));
  note(accueil, 'UserPromptSubmit', 's', { t: Date.parse('2026-10-09T09:00:00.000Z'), transcription: t });
  const e = (m) => evaluer({ accueil, maintenant: Date.parse(m), enVie }).sessions[0];
  assert.deepEqual([e('2026-10-09T09:20:00Z').etat, e('2026-10-09T09:20:00Z').retient], ['attend', true]);
  assert.equal(e('2026-10-09T09:40:00Z').retient, false, '30 min après l’interruption');
  ecrire(t, ligne(prompt) + ligne(appel('AskUserQuestion', '2026-10-09T09:05:00.000Z')) + ligne({ type: 'assistant', isSidechain: true, timestamp: '2026-10-09T09:06:00.000Z', message: { content: [] } }));
  assert.equal(attenteDansTranscription(t), Date.parse('2026-10-09T09:05:00.000Z'), 'un sous-agent ne masque pas la question');
  assert.equal(e('2026-10-09T09:40:00Z').retient, false, 'une question restée sans réponse ne tient pas le poste éveillé toute la nuit');
  // Une interruption plus ancienne que le message en cours ne compte pas (transcription écrite en différé).
  note(accueil, 'UserPromptSubmit', 's', { t: Date.parse('2026-10-09T10:00:00.000Z'), transcription: t });
  assert.equal(e('2026-10-09T11:00:00Z').etat, 'travaille');
});

test('veille : une session qui « travaille » sans que sa transcription bouge depuis 30 min attend (permission, élicitation, Stop manqué) ; une attente suivie d’écritures travaille de nouveau', () => {
  const accueil = tmp(); const t = path.join(tmp(), 's.jsonl'); ecrire(t, ligne({ type: 'user', timestamp: '2026-10-09T09:00:00.000Z', message: { content: 'fais X' } }));
  const ecrite = (ms) => fs.utimesSync(t, new Date(ms), new Date(ms));
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

test('veille : après Stop, un sous-agent de fond qui écrit retient le poste tant que sa transcription bouge ; un shell de fond, non', () => {
  const accueil = tmp(); const t = path.join(tmp(), 'sess.jsonl'); ecrire(t, ligne({ type: 'assistant', timestamp: '2026-10-09T10:00:00.000Z', message: { content: [] } }));
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
  note(accueil, 'Stop', 'a', { session: () => processusSession(process.pid) });
  horloge.t += 29 * min; await g.passer(); assert.equal(g.tenue(), true, 'attente de moins de 30 min');
  horloge.t += 2 * min; await g.passer(); assert.equal(g.tenue(), false);
  assert.deepEqual(kinds(), ['power.held', 'power.released']);
  assert.equal([...journal.lire()][1].data.raison, 'aucune-session');
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
  assert.match(evs()[0].data.message, /refusée \(code 3\) : refusee : PowerSetRequest/);
  const sans = creerGardien({ accueil, journal, commande: null }); await sans.passer(); await sans.passer();
  assert.match(evs().at(-1).data.message, /aucun mécanisme/); assert.equal(evs().length, 2);
  // Sans réponse dans le délai : arrêtée et dite.
  await assert.rejects(lancerDemande([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { delai: 300 }), /sans réponse/);
  await assert.rejects(lancerDemande(['/nulle/part/powershell.exe']), /non lancée/);
  const g = creerGardien({ accueil, journal, commande: TEMOIN });
  await g.passer(); assert.equal(g.tenue(), true);
  // La demande meurt hors du gardien (processus Windows tué) : panne dite, demande reprise au passage suivant.
  const avant = evs().length;
  process.kill(g.pid(), 'SIGKILL');
  await new Promise((ok) => setTimeout(ok, 200));
  assert.equal(g.tenue(), false); assert.match(evs()[avant].data.message, /arrêtée hors du gardien/);
  await g.passer(); assert.equal(g.tenue(), true, 'reprise au passage suivant'); await g.arreter();
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

test('veille : le gardien est posé et retiré avec le premier et le dernier accès distant ; la copie de service le pose ou le réécrit', () => {
  const unites = tmp(); const racine = tmp(); fs.mkdirSync(path.join(racine, 'demo'));
  const appels = []; const actifs = new Set(); const coupees = new Set();
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'enable') { actifs.add(args.at(-1)); coupees.delete(args.at(-1)); }
    if (args[0] === 'disable') { actifs.delete(args.at(-1)); coupees.add(args.at(-1)); }
    const out = args[0] === 'is-active' ? (actifs.has(args[1]) ? 'active\n' : 'inactive\n') : args[0] === 'is-enabled' ? (coupees.has(args[1]) ? 'disabled\n' : 'enabled\n') : '';
    return { status: 0, stdout: out, stderr: '' };
  };
  const cfg = path.join(tmp(), '.claude.json'); fs.writeFileSync(cfg, '{}');
  const d = creerDistant({ inventaire: { 'claude-code': { config: cfg } }, acces_distant: {} }, { unites, systemctl, claude: '/opt/claude', projets: [{ id: 'holarch:project:demo', nom: 'demo', location: path.join(racine, 'demo') }], accueil: '/a', holarch: '/opt/holarch.js', node: '/opt/node/bin/node' });
  assert.deepEqual(etatVeille({ unites, systemctl }), { unite: 'holarch-veille.service', gardien: 'absent', distants: 0 });
  d.activer('demo');
  const texte = fs.readFileSync(path.join(unites, 'holarch-veille.service'), 'utf8');
  assert.match(texte, /^ExecStart="\/opt\/node\/bin\/node" --no-warnings "\/opt\/holarch.js" veille tenir$/m);
  assert.match(texte, /^Restart=on-failure$/m); assert.match(texte, /^StandardError=journal$/m);
  assert.ok(appels.includes('enable --now holarch-veille.service'));
  assert.deepEqual(etatVeille({ unites, systemctl }), { unite: 'holarch-veille.service', gardien: 'actif', distants: 1 });
  assert.deepEqual(etatRoutines({ unites, systemctl }).at(-1), { unite: 'holarch-veille.service', etat: 'activée' });
  // La copie posée : le gardien suit la copie et redémarre (il relâche puis reprend la demande).
  appels.length = 0;
  const pose = (holarch, o = { node: '/opt/node/bin/node' }) => creerReveil({ holarch, accueil: '/a' }, { unites, systemctl, ...o });
  assert.deepEqual(pose('/v2/holarch.js').gardien(), { unite: 'holarch-veille.service', etat: 'réécrite' }); assert.ok(appels.includes('restart holarch-veille.service'));
  // Le cas réel : le binaire est le lien `courant`, dont le chemin ne change pas ; le gardien est relancé quand même.
  appels.length = 0;
  assert.deepEqual(pose('/v2/holarch.js').gardien(), { unite: 'holarch-veille.service', etat: 'relancée' }); assert.ok(appels.includes('restart holarch-veille.service'));
  // Coupé à la main : réécrit, jamais rallumé (décision routines-posees).
  systemctl(['disable', '--now', 'holarch-veille.service']); appels.length = 0;
  assert.equal(pose('/v3/holarch.js').gardien().etat, 'coupée à la main : laissée');
  assert.deepEqual(appels.filter((a) => /^(enable|restart|start)/.test(a)), []);
  assert.match(fs.readFileSync(path.join(unites, 'holarch-veille.service'), 'utf8'), /"\/v3\/holarch.js" veille tenir/);
  assert.equal(etatVeille({ unites, systemctl }).gardien, 'coupé');
  d.desactiver('demo');
  assert.ok(!fs.existsSync(path.join(unites, 'holarch-veille.service')), 'retiré avec le dernier accès distant');
  assert.equal(pose('/v3/holarch.js').gardien().etat, 'sans accès distant : non posé');
  // Une unité de la main n'est jamais touchée.
  ecrire(path.join(unites, 'holarch-veille.service'), '[Service]\nExecStart=/bin/true\n'); ecrire(path.join(unites, 'holarch-reveil.service'), '# Écrit par HOLARCH (holarch distant) : x\n');
  assert.equal(pose('/v4/holarch.js', {}).gardien().etat, 'non écrite par HOLARCH : laissée');
  assert.equal(fs.readFileSync(path.join(unites, 'holarch-veille.service'), 'utf8'), '[Service]\nExecStart=/bin/true\n');
});

test('veille : une règle applicable qui désigne le contrôle pose les crochets ; une règle brouillon n’en pose aucun ; leur absence se dit', () => {
  const o = { node: '/opt/node', holarch: '/opt/holarch.js', accueil: '/srv/a' };
  const v = reglagesVoulus({}, { ...o, veille: true });
  assert.deepEqual(v.crochets.map((c) => c.evenement), ['UserPromptSubmit', 'Stop', 'StopFailure', 'PermissionRequest', 'Elicitation', 'SessionEnd']);
  assert.equal(v.crochets[1].command, "HOLARCH_HOME='/srv/a' '/opt/node' --no-warnings '/opt/holarch.js' veille noter Stop 2>/dev/null || true");
  assert.deepEqual(crochetVoulu(v.crochets[5].command), { regle: 'veille-retardee', cle: 'crochet:veille:SessionEnd', message: 'crochet de veille non posé (SessionEnd)' });
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

test('veille : le contrôle dit un gardien arrêté sous un accès distant, rien sans accès, non disponible sans mécanisme', () => {
  const c = (veille) => executer('veille-retardee', { veille }, 'audit');
  assert.match(c({ mecanisme: null, gardien: 'absent', distants: 1 }).indisponible, /aucun mécanisme/);
  assert.deepEqual(c({ mecanisme: '/ps', gardien: 'absent', distants: 0 }), { ecarts: [] });
  assert.deepEqual(c({ mecanisme: '/ps', gardien: 'actif', distants: 2 }), { ecarts: [] });
  const e = c({ mecanisme: '/ps', gardien: 'arrêté', distants: 1 }).ecarts;
  assert.deepEqual([e.length, e[0].cle], [1, 'gardien']); assert.match(e[0].message, /gardien de veille arrêté avec 1 accès distant/);
});
