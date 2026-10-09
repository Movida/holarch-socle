// Veille retardée (étape 3, tranche 12, livraison B ; décision environnement-d-execution, règle `veille-retardee` du
// profil) : le poste ne se met pas en veille d'inactivité tant qu'une session distante travaille, ou attend une réponse
// depuis moins de ATTENTE_MIN. Les crochets de Claude Code notent l'état de chaque session distante, un fichier par
// session (`<accueil>/veille/`) ; un service de l'hôte (`holarch veille tenir`) les lit et tient une demande d'éveil de
// Windows tant qu'une session l'interdit. Le socle n'éteint jamais le poste : la demande meurt avec le service (son
// entrée standard se ferme), Windows reprend alors la main ; une veille demandée à la main n'est pas retenue (Windows
// lève les demandes d'éveil à une veille demandée). B couvre les sessions de l'hôte : une session en conteneur n'a pas
// ces crochets (son `~/.claude` est un volume) ; son signe de vie se conçoit avec la livraison D.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ecrireJson, lireJson } from './commun.js';
import { finDeTranscription, evenements } from './transcription.js';
import { ulid } from './ulid.js';

// Décision environnement-d-execution : 98 % des réponses de l'auteur arrivent sous 15 min ; marge du double.
export const ATTENTE_MIN = 30;
export const dossierVeille = (accueil) => path.join(accueil, 'veille');
// Ce que le gardien tient, écrit à chaque passage hors du dossier des notes (qu'il surveille) : le contrôle et
// `holarch veille` le comparent à ce que demandent les sessions.
export const fichierGardien = (accueil) => path.join(accueil, 'veille-gardien.json');
export const GARDIEN_FRAIS = 2 * 60e3;
// Dernière erreur d'un crochet de veille : `2>/dev/null` du crochet (un tour ne doit jamais échouer) la cacherait ;
// gardée datée, le contrôle la signale une semaine.
export const fichierErreur = (accueil) => path.join(accueil, 'veille-erreur.json');
export const ERREUR_VUE_JOURS = 7;
export function noterErreur(accueil, evenement, e, maintenant = Date.now()) {
  try { ecrireJson(fichierErreur(accueil), { at: new Date(maintenant).toISOString(), evenement: String(evenement || ''), message: String(e?.message || e).split('\n')[0].slice(0, 300) }); } catch { /* accueil illisible : rien de plus à faire */ }
}
// Une note réussie efface l'erreur précédente : une erreur corrigée ne reste pas un écart une semaine.
export const effacerErreur = (accueil) => fs.rmSync(fichierErreur(accueil), { force: true });

// État qu'un crochet note ; `SessionEnd` efface la note. `Stop` ne vient pas après une interruption : la transcription
// la dit (`attenteDansTranscription`). Une demande de permission ou une élicitation MCP attend l'auteur au milieu d'un tour.
const ETATS = { UserPromptSubmit: 'travaille', Stop: 'attend', StopFailure: 'attend', PermissionRequest: 'attend', Elicitation: 'attend' };
export const EVENEMENTS = [...Object.keys(ETATS), 'SessionEnd'];
// Outils qui attendent l'auteur : la session a fini de travailler, elle attend sa réponse.
const ATTENDENT = new Set(['AskUserQuestion', 'ExitPlanMode']);
const SHELLS = new Set(['sh', 'bash', 'dash', 'zsh', 'env']);
const NOTE = /^[A-Za-z0-9_-]{1,128}$/;
// Marque d'un tour interrompu, en tête d'un texte de l'auteur : dans un résultat d'outil (fichier lu, sortie), ce n'en est pas une.
const INTERRUPTION = '[Request interrupted by user';
const interrompu = (c) => (typeof c === 'string' ? c.startsWith(INTERRUPTION) : Array.isArray(c) && c.some((x) => x?.type === 'text' && String(x.text || '').startsWith(INTERRUPTION)));

/**
 * Une session distante (Remote Control) : `CLAUDE_CODE_BRIDGE_SESSION_ID` (documenté, session interactive reliée), sinon
 * le type d'environnement que pose le serveur à ses sessions (`bridge`, lu en Claude Code 2.1.295). Une session locale
 * a l'auteur devant le poste : rien à retenir.
 */
export const distante = (env = process.env) => Boolean(env.CLAUDE_CODE_BRIDGE_SESSION_ID) || env.CLAUDE_CODE_ENVIRONMENT_KIND === 'bridge';
// Le même test en shell, en tête de la commande du crochet : une session locale ne lance pas node à chaque invite.
export const DISTANTE_SHELL = '{ [ -n "$CLAUDE_CODE_BRIDGE_SESSION_ID" ] || [ "$CLAUDE_CODE_ENVIRONMENT_KIND" = bridge ]; }';

/** `/proc/<pid>/stat` : { comm, ppid, debut } (début en tops d'horloge depuis l'amorçage), ou null. */
export function stat(pid) {
  try {
    const t = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const i = t.lastIndexOf(')');
    const champs = t.slice(i + 2).split(' '); // champ 3 (état) en tête : ppid est le champ 4, le début le champ 22
    return { comm: t.slice(t.indexOf('(') + 1, i), ppid: +champs[1], debut: champs[19] };
  } catch { return null; }
}

/** Le processus de la session qui lance un crochet : son premier ancêtre qui n'est pas un shell. */
export function processusSession(depart = process.ppid, lire = stat) {
  let pid = depart;
  for (let i = 0; i < 8 && pid > 1; i++) {
    const s = lire(pid); if (!s) return null;
    if (!SHELLS.has(s.comm)) return { pid, debut: s.debut };
    pid = s.ppid;
  }
  return null;
}

/** Le processus noté vit encore : même numéro et même début (un numéro réattribué n'est pas la session). */
export const vivant = ({ pid, debut }, lire = stat) => { const s = lire(pid); return Boolean(s) && s.debut === debut; };

/**
 * Crochet de Claude Code : note l'état d'une session distante. Ne lève jamais : un crochet ne fait pas échouer un tour.
 * Le processus de la session est noté pour reconnaître une session morte sans `SessionEnd` (veille, redémarrage).
 */
export function noter({ evenement, entree = {}, accueil, env = process.env, maintenant = Date.now(), session = processusSession }) {
  if (!distante(env)) return { note: false, raison: 'session locale' };
  const id = String(entree.session_id || '');
  if (!NOTE.test(id)) return { note: false, raison: 'identifiant de session absent ou illisible' };
  const f = path.join(dossierVeille(accueil), `${id}.json`);
  if (evenement === 'SessionEnd') { fs.rmSync(f, { force: true }); return { note: true, etat: 'finie' }; }
  const etat = ETATS[evenement];
  if (!etat) return { note: false, raison: `événement non suivi : ${evenement}` };
  const p = session();
  ecrireJson(f, { session: id, etat, depuis: new Date(maintenant).toISOString(), ...(p && { pid: p.pid, debut_pid: p.debut }),
    transcription: entree.transcript_path || null, dossier: entree.cwd || null });
  return { note: true, etat };
}

/**
 * Un chemin de transcription venu d'une note se lit seulement s'il en a la forme (`.jsonl` absolu, sous un dossier
 * `projects/` de Claude Code) et désigne un fichier : une FIFO ou un périphérique bloqueraient le gardien à l'ouverture.
 */
export function transcriptionLisible(f) {
  if (typeof f !== 'string' || !path.isAbsolute(f) || !f.endsWith('.jsonl') || !f.split(path.sep).includes('projects')) return false;
  try { return fs.statSync(f).isFile(); } catch { return false; }
}

/**
 * Date (ms) à laquelle la conversation principale s'est mise à attendre l'auteur, d'après la fin de la transcription :
 * tour interrompu (aucun `Stop` ne vient), ou appel d'un outil qui attend sa réponse (question, plan). Null sinon.
 */
export function attenteDansTranscription(transcription, octets = 256 * 1024) {
  if (!transcriptionLisible(transcription)) return null;
  for (const e of evenements(finDeTranscription(transcription, octets))) {
    if ((e.type !== 'user' && e.type !== 'assistant') || e.isSidechain) continue;
    const c = e.message?.content; const t = Date.parse(e.timestamp);
    if (e.type === 'user' && interrompu(c)) return t;
    if (e.type === 'assistant' && Array.isArray(c) && c.some((x) => x.type === 'tool_use' && ATTENDENT.has(x.name))) return t;
    return null;
  }
  return null;
}

// Date d'une transcription : sa dernière entrée datée, lue à la fin du fichier ; à défaut (aucune dans la fin lue), sa
// date de modification. Des entrées sans date (`bridge-session`, `last-prompt`, `cost-state`, `mode`) s'écrivent après
// la fin d'un tour, jusqu'à 33 min plus tard (contre-épreuve de B : 46 transcriptions distantes sur 63) : la date de
// modification ferait travailler une session qui attend.
function dateDe(f, octets = 64 * 1024) {
  for (const e of evenements(finDeTranscription(f, octets))) { const t = Date.parse(e?.timestamp); if (Number.isFinite(t)) return t; }
  try { return fs.statSync(f).mtimeMs; } catch { return null; }
}

/**
 * Dernière écriture (ms) d'une session, `derniere` : sa transcription et celles de ses sous-agents
 * (`<session>/subagents/*.jsonl`), qui bougent encore après `Stop` quand un sous-agent de fond travaille ; `sous_agents`,
 * la leur seule (null sans sous-agent) ; null si rien ne se lit. Un shell de fond n'écrit dans aucune transcription : il
 * ne retient rien (un serveur permanent tiendrait le poste sans fin).
 */
export function activite(transcription) {
  if (!transcriptionLisible(transcription)) return null;
  const d = path.join(transcription.replace(/\.jsonl$/, ''), 'subagents'); let sous = [];
  try { sous = fs.readdirSync(d).filter((n) => n.endsWith('.jsonl') && transcriptionLisible(path.join(d, n))).map((n) => dateDe(path.join(d, n))).filter(Number.isFinite); } catch { /* aucun sous-agent */ }
  const sousAgents = sous.length ? Math.max(...sous) : null;
  const toutes = [dateDe(transcription), sousAgents].filter(Number.isFinite);
  return toutes.length ? { derniere: Math.max(...toutes), sous_agents: sousAgents } : null;
}

// Une session « travaille » tant que sa transcription bouge : immobile depuis l'attente permise, elle attend quelque
// chose (permission, élicitation, `Stop` manqué) et compte comme une attente depuis sa dernière écriture (contre-épreuve
// de B : aucun silence de plus de 11 min pendant un tour, sur 301 tours de 67 sessions distantes). Une attente suivie
// d'écritures (permission accordée, réponse) travaille de nouveau ; BOUGE laisse passer ce qu'écrit la fin du tour (au
// plus 4,7 s après la dernière réponse, sur 89 cas mesurés ; la marge ne coûte rien, une attente retient 30 min).
const BOUGE = 30e3;

/**
 * Les sessions notées et ce qu'elles demandent : `besoin` si l'une travaille, ou attend depuis moins de `attente`
 * minutes. Une session dont le processus est mort est finie ; `nettoyer` efface sa note (le gardien, pas une lecture),
 * comme celle d'une session sans processus connu, échue depuis un jour.
 */
export function evaluer({ accueil, maintenant = Date.now(), attente = ATTENTE_MIN, enVie = vivant, nettoyer = false }) {
  const d = dossierVeille(accueil); let noms = [];
  try { noms = fs.readdirSync(d).filter((n) => n.endsWith('.json')).sort(); } catch { /* aucune note */ }
  const sessions = []; const finies = [];
  const lire = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
  // Effacée seulement si elle n'a pas changé depuis sa lecture : un crochet a pu la réécrire entre-temps (session reprise).
  const effacer = (f, lu) => { if (nettoyer && lire(f) === lu) fs.rmSync(f, { force: true }); };
  for (const n of noms) {
    const f = path.join(d, n); const lu = lire(f); let s = null;
    try { s = JSON.parse(lu); } catch { /* illisible */ }
    // Illisible (en cours d'écriture, abîmée) : ni comptée ni effacée.
    if (!s?.session || !['travaille', 'attend'].includes(s.etat) || !Number.isFinite(Date.parse(s.depuis))) continue;
    if (s.pid && !enVie({ pid: s.pid, debut: s.debut_pid })) { effacer(f, lu); finies.push(s.session); continue; }
    let etat = s.etat; let depuis = Date.parse(s.depuis);
    // Sans processus connu, une session qui « travaille » ne se vérifie pas : bornée comme une attente.
    if (etat === 'travaille' && !s.pid) etat = 'attend';
    const act = s.pid ? activite(s.transcription) : null; const ecrite = act?.derniere ?? null;
    if (etat === 'attend' && ecrite !== null && ecrite > depuis + BOUGE) etat = 'travaille';
    if (etat === 'travaille') {
      const t = attenteDansTranscription(s.transcription);
      const derniere = Math.max(depuis, ecrite ?? depuis);
      // Un sous-agent de fond qui écrit après la question ou l'interruption : la session travaille encore.
      if (Number.isFinite(t) && t >= depuis && !(act?.sous_agents > t)) { etat = 'attend'; depuis = t; }
      else if (maintenant - derniere >= attente * 60e3) { etat = 'attend'; depuis = derniere; }
    }
    const reste = etat === 'travaille' ? null : depuis + attente * 60e3 - maintenant;
    if (!s.pid && reste !== null && reste < -864e5) { effacer(f, lu); continue; }
    sessions.push({ session: s.session, etat, depuis: new Date(depuis).toISOString(), retient: reste === null || reste > 0,
      ...(reste !== null && reste > 0 && { reste_min: Math.ceil(reste / 60e3) }), dossier: s.dossier || null });
  }
  return { besoin: sessions.some((x) => x.retient), sessions, finies };
}

// Heure locale du poste (celle que lit l'auteur), à la minute.
const quand = (iso) => new Date(iso).toLocaleString('sv-SE').slice(0, 16);

/**
 * L'état de la veille retardée, dit d'une seule façon pour le contrôle `veille-retardee` et `holarch veille` : ce que
 * demandent les sessions (`besoin`), ce que le gardien tient (`tenue` : unité active, passage depuis moins de
 * GARDIEN_FRAIS et demande tenue à ce passage), son dernier passage, l'erreur d'un crochet de moins de ERREUR_VUE_JOURS.
 * `constats`, ce qui ne va pas : une session retenue sans demande tenue ; une demande peut-être encore tenue sans
 * besoin (gardien actif sans passage récent : arrêté, sa demande meurt avec lui) ; un crochet en erreur. `gardien` :
 * l'état de son unité (module distant, `etatVeille`).
 */
export function etatGardien({ accueil, gardien, besoin = evaluer({ accueil }).besoin, maintenant = Date.now() }) {
  const ecrit = lireJson(fichierGardien(accueil), null); const maj = Date.parse(ecrit?.maj);
  const passage = Number.isFinite(maj) ? new Date(maj).toISOString() : null;
  const frais = passage !== null && maintenant - maj < GARDIEN_FRAIS;
  const tenue = gardien === 'actif' && frais && ecrit.tenue === true;
  const err = lireJson(fichierErreur(accueil), null); const t = Date.parse(err?.at);
  const erreur = Number.isFinite(t) && maintenant - t < ERREUR_VUE_JOURS * 864e5 ? { at: new Date(t).toISOString(), evenement: String(err.evenement || '?') } : null;
  const vu = passage ? `dernier passage du gardien le ${quand(passage)}` : 'aucun passage du gardien';
  const constats = [];
  if (besoin && !tenue) constats.push({ cle: 'retenue', message: `une session distante retient la veille, mais la demande d'éveil n'est pas tenue (gardien ${gardien}${frais ? '' : `, ${vu}`})` });
  if (!besoin && gardien === 'actif' && !frais && ecrit?.tenue === true) constats.push({ cle: 'sans-besoin', message: `demande d'éveil peut-être encore tenue sans session qui la retienne (${vu})` });
  // Daté et nommé par son événement ; le message, qui peut citer un chemin, reste dans le fichier.
  if (erreur) constats.push({ cle: 'crochet', message: `crochet de veille en erreur le ${quand(erreur.at)} (${erreur.evenement}) : des sessions peuvent ne pas être notées ; détail dans veille-erreur.json de l'accueil HOLARCH` });
  return { gardien, besoin, tenue, frais, passage, erreur, constats };
}

// ---------- demande d'éveil de Windows ----------

// PowerShell de Windows, vu de WSL ; un poste sans lui n'a pas de mécanisme (le contrôle le dit non disponible).
export const POWERSHELL = '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
export const mecanisme = (powershell = POWERSHELL) => (fs.existsSync(powershell) ? powershell : null);
export const RAISON = 'HOLARCH : une session distante travaille ou attend une réponse';

/**
 * Script de la demande : `PowerCreateRequest` avec sa raison (lisible dans `powercfg /requests`), puis
 * `PowerSetRequest(PowerRequestSystemRequired)` : pas de veille d'inactivité, l'écran s'éteint comme avant. Il dit
 * « tenue », puis la tient jusqu'à la fin de son entrée standard, qui vient aussi avec la mort de son lanceur.
 */
export function scriptDemande(raison = RAISON) {
  return `$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
Add-Type -Namespace Holarch -Name Veille -MemberDefinition @'
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
public struct REASON_CONTEXT { public uint Version; public uint Flags; [MarshalAs(UnmanagedType.LPWStr)] public string SimpleReasonString; }
[DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr PowerCreateRequest(ref REASON_CONTEXT Context);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool PowerSetRequest(IntPtr PowerRequest, int RequestType);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool PowerClearRequest(IntPtr PowerRequest, int RequestType);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr Handle);
'@
$c = New-Object Holarch.Veille+REASON_CONTEXT
$c.Version = 0; $c.Flags = 1; $c.SimpleReasonString = '${String(raison).replace(/'/g, "''")}'
$h = [Holarch.Veille]::PowerCreateRequest([ref]$c)
if ($h -eq [IntPtr]::Zero -or $h -eq [IntPtr](-1)) { [Console]::Out.WriteLine('refusee : PowerCreateRequest'); exit 2 }
if (-not [Holarch.Veille]::PowerSetRequest($h, 1)) { [Console]::Out.WriteLine('refusee : PowerSetRequest'); exit 3 }
[Console]::Out.WriteLine('tenue'); [Console]::Out.Flush()
while ($null -ne [Console]::In.ReadLine()) { }
[void][Holarch.Veille]::PowerClearRequest($h, 1); [void][Holarch.Veille]::CloseHandle($h)
`;
}

/** Commande qui tient la demande, ou null sans mécanisme ; le script passe encodé, l'entrée standard reste libre. */
export function commandeWindows({ powershell = mecanisme(), raison = RAISON } = {}) {
  if (!powershell) return null;
  return [powershell, '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(scriptDemande(raison), 'utf16le').toString('base64')];
}

// Un échec de la demande : `motif` (et `code`) vont au journal ; le message, qui peut citer la sortie de PowerShell ou un
// chemin, au seul log du gardien.
const panneDe = (motif, message, code = null) => Object.assign(new Error(message), { motif, ...(code !== null && { code }) });

/** Lance la commande et attend « tenue » : rend le processus, ou lève s'il s'arrête, se tait ou ne se lance pas. */
export function lancerDemande([bin, ...args], { delai = 60e3 } = {}) {
  return new Promise((ok, ko) => {
    let fini = false; let sortie = '';
    const finir = (f) => { if (fini) return; fini = true; clearTimeout(minuteur); f(); };
    const enfant = spawn(bin, args, { cwd: path.dirname(bin), stdio: ['pipe', 'pipe', 'pipe'] });
    const minuteur = setTimeout(() => finir(() => { enfant.kill(); ko(panneDe('sans-reponse', `demande d'éveil sans réponse après ${delai / 1e3} s`)); }), delai);
    enfant.on('error', (e) => finir(() => ko(panneDe('non-lancee', `demande d'éveil non lancée : ${e.message}`))));
    enfant.stdin.on('error', () => { /* processus déjà parti : sa sortie le dit */ });
    enfant.stdout.on('data', (d) => { sortie += d; if (/^tenue\r?$/m.test(sortie)) finir(() => ok(enfant)); });
    enfant.stderr.on('data', (d) => { sortie += d; });
    enfant.on('exit', (code) => finir(() => ko(panneDe('refusee', `demande d'éveil refusée (code ${code})${sortie.trim() ? ` : ${sortie.trim().slice(0, 200)}` : ''}`, code))));
  });
}

const attendreFin = (enfant, delai) => new Promise((ok) => {
  if (enfant.exitCode !== null || enfant.signalCode !== null) return ok();
  const m = setTimeout(() => { enfant.kill('SIGKILL'); ok(); }, delai);
  enfant.once('exit', () => { clearTimeout(m); ok(); });
});

/**
 * Le gardien : à chaque passage, évalue les sessions ; tient la demande quand il en faut une, la relâche sinon. Ses
 * changements vont au journal (P4) : `power.held` (sessions qui la retiennent), `power.released` (raison),
 * `power.failed` (`{motif, code}`, une fois par panne : un passage toutes les 30 s ne la répète pas ; le détail au log).
 */
export function creerGardien({ accueil, journal = null, commande = () => commandeWindows(), attente = ATTENTE_MIN, maintenant = Date.now, log = () => {}, delai = 60e3 }) {
  // Le mécanisme se cherche à chaque besoin : absent au démarrage du service (Windows pas encore monté), il peut venir.
  const commandeDuMoment = () => (typeof commande === 'function' ? commande() : commande);
  let demande = null; let panne = null; let file = Promise.resolve();
  // Une demande qui échoue ou meurt peu après avoir été tenue n'est pas relancée à chaque passage : l'essai suivant
  // s'espace (30 s, puis le double, au plus 30 min), et ni la même panne ni la même tenue ne se redisent avant une tenue
  // durable (plus de COURTE).
  const COURTE = 60e3; const ESPACE_MAX = 30 * 60e3;
  // `tue` : la tenue d'une demande reprise après une panne courte, pas encore dite ; dite si elle devient durable.
  let tenueDepuis = 0; let ratees = 0; let prochain = 0; let annonce = null; let tue = null;
  const espacer = () => { ratees += 1; prochain = maintenant() + Math.min(ESPACE_MAX, 30e3 * 2 ** (ratees - 1)); };
  const ecrire = (kind, data) => {
    if (!journal) return;
    try {
      const t = maintenant(); const r = journal.ajouter([{ id: ulid(t), at: new Date(t).toISOString(), kind, actor: 'system:veille', data, classification: 'internal' }]);
      if (r.refuses?.length) log(`événement refusé par le journal : ${r.refuses[0].erreur}`);
    } catch (e) { log(`journal injoignable : ${e.message}`); }
  };
  const echec = (err) => {
    const cle = `${err.motif}|${err.code ?? ''}`;
    if (cle !== panne) { panne = cle; ecrire('power.failed', { motif: err.motif, ...(err.code != null && { code: err.code }) }); }
    log(err.message);
  };
  const retenues = (e) => e.sessions.filter((x) => x.retient).map((x) => ({ session: x.session, etat: x.etat, ...(x.dossier && { projet: path.basename(x.dossier) }) }));
  async function relacher(raison) {
    const enfant = demande; demande = null; if (!enfant) return;
    annonce = null; tue = null;
    try { enfant.stdin.end(); } catch { /* déjà fermé */ }
    await attendreFin(enfant, 10e3);
    ecrire('power.released', { raison }); log(`demande d'éveil relâchée (${raison})`);
  }
  async function passer() {
    const e = evaluer({ accueil, maintenant: maintenant(), attente, nettoyer: true });
    try { await suite(e); } finally { etat(e.besoin); }
    return e;
  }
  function etat(besoin) {
    try { ecrireJson(fichierGardien(accueil), { maj: new Date(maintenant()).toISOString(), besoin, tenue: Boolean(demande) }); } catch (err) { log(`état du gardien non écrit : ${err.message}`); }
  }
  async function suite(e) {
    if (demande && maintenant() - tenueDepuis >= COURTE) {
      ratees = 0; prochain = 0; panne = null;
      if (tue) { ecrire('power.held', { sessions: tue }); tue = null; }
    }
    if (e.besoin && !demande) {
      if (maintenant() < prochain) return;
      const c = commandeDuMoment();
      if (!c) { echec(panneDe('sans-mecanisme', 'aucun mécanisme pour retarder la veille sur ce site (Windows, vu de WSL)')); return; }
      try {
        const enfant = await lancerDemande(c, { delai });
        demande = enfant; tenueDepuis = maintenant();
        enfant.once('exit', (code) => {
          if (demande !== enfant) return;
          demande = null; if (maintenant() - tenueDepuis < COURTE) espacer();
          echec(panneDe('arretee', `demande d'éveil arrêtée hors du gardien (code ${code})`, code));
        });
        const s = retenues(e); const cle = JSON.stringify(s.map((x) => x.session));
        if (!(ratees && cle === annonce)) { annonce = cle; tue = null; ecrire('power.held', { sessions: s }); } else tue = s;
        log(`demande d'éveil tenue : ${s.map((x) => `${x.projet || x.session} (${x.etat})`).join(', ')}`);
      } catch (err) { espacer(); echec(err.motif ? err : panneDe('non-lancee', err.message)); }
    } else if (e.besoin && demande) {
      // Une session qui arrive ou part pendant la tenue : la tenue se redit avec les sessions qui la retiennent.
      const s = retenues(e); const cle = JSON.stringify(s.map((x) => x.session));
      if (cle !== annonce) { annonce = cle; ecrire('power.held', { sessions: s }); log(`demande d'éveil tenue : ${s.map((x) => `${x.projet || x.session} (${x.etat})`).join(', ')}`); }
    } else if (!e.besoin && demande) await relacher('aucune-session');
  }
  return {
    // Les passages s'enchaînent, jamais deux à la fois (minuteur et changement d'une note peuvent se croiser).
    passer() { const p = file.then(passer); file = p.catch((err) => log(`passage en échec : ${err.message}`)); return p; },
    async arreter() { await file; await relacher('arret'); etat(null); },
    tenue: () => Boolean(demande),
    pid: () => demande?.pid ?? null,
  };
}

/**
 * Service de l'hôte : un passage au démarrage, à chaque note changée (une seconde après), et toutes les `intervalle` ms
 * (fins d'attente, sessions mortes) ; à l'arrêt, la demande est relâchée et dite.
 */
export function surveiller(gardien, { accueil, intervalle = 30e3, log = () => {} }) {
  const d = dossierVeille(accueil); fs.mkdirSync(d, { recursive: true });
  let prevu = null;
  const bientot = () => { if (!prevu) prevu = setTimeout(() => { prevu = null; gardien.passer().catch(() => {}); }, 1000); };
  let veilleur = null;
  try { veilleur = fs.watch(d, bientot); } catch (e) { log(`notes non surveillées (${e.message}) : passage toutes les ${intervalle / 1e3} s seulement`); }
  const minuteur = setInterval(() => gardien.passer().catch(() => {}), intervalle);
  gardien.passer().catch(() => {});
  const fin = async () => { clearInterval(minuteur); veilleur?.close(); if (prevu) clearTimeout(prevu); await gardien.arreter(); process.exit(0); };
  process.once('SIGTERM', fin); process.once('SIGINT', fin);
}
