// Veille retardée (étape 3, tranche 12, livraison B ; décision environnement-d-execution, règle `veille-retardee` du
// profil) : le poste ne se met pas en veille d'inactivité tant qu'une session distante travaille, ou attend une réponse
// depuis moins de ATTENTE_MIN. Les crochets de Claude Code notent l'état de chaque session distante, un fichier par
// session (`<accueil>/veille/`) ; un service de l'hôte (`holarch veille tenir`) les lit et tient une demande d'éveil de
// Windows tant qu'une session l'interdit. Le socle n'éteint jamais le poste : la demande meurt avec le service (son
// entrée standard se ferme), Windows reprend alors la main ; une veille demandée à la main n'est pas retenue (Windows
// lève les demandes d'éveil à une veille demandée).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { lireJson, ecrireJson } from './commun.js';
import { finDeTranscription, evenements } from './transcription.js';
import { ulid } from './ulid.js';

// Décision environnement-d-execution : 98 % des réponses de l'auteur arrivent sous 15 min ; marge du double.
export const ATTENTE_MIN = 30;
export const dossierVeille = (accueil) => path.join(accueil, 'veille');

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
 * Date (ms) à laquelle la conversation principale s'est mise à attendre l'auteur, d'après la fin de la transcription :
 * tour interrompu (aucun `Stop` ne vient), ou appel d'un outil qui attend sa réponse (question, plan). Null sinon.
 */
export function attenteDansTranscription(transcription, octets = 256 * 1024) {
  if (!transcription) return null;
  for (const e of evenements(finDeTranscription(transcription, octets))) {
    if ((e.type !== 'user' && e.type !== 'assistant') || e.isSidechain) continue;
    const c = e.message?.content; const t = Date.parse(e.timestamp);
    if (e.type === 'user' && interrompu(c)) return t;
    if (e.type === 'assistant' && Array.isArray(c) && c.some((x) => x.type === 'tool_use' && ATTENDENT.has(x.name))) return t;
    return null;
  }
  return null;
}

/**
 * Dernière écriture (ms) d'une session : sa transcription et celles de ses sous-agents (`<session>/subagents/*.jsonl`),
 * qui bougent encore après `Stop` quand un sous-agent de fond travaille ; null si rien ne se lit. Un shell de fond
 * n'écrit dans aucune transcription : il ne retient rien (un serveur permanent tiendrait le poste sans fin).
 */
export function activite(transcription) {
  if (!transcription) return null;
  const dates = [];
  const lire = (f) => { try { dates.push(fs.statSync(f).mtimeMs); } catch { /* absente */ } };
  lire(transcription);
  const d = path.join(transcription.replace(/\.jsonl$/, ''), 'subagents');
  try { for (const n of fs.readdirSync(d)) if (n.endsWith('.jsonl')) lire(path.join(d, n)); } catch { /* aucun sous-agent */ }
  return dates.length ? Math.max(...dates) : null;
}

// Une session « travaille » tant que sa transcription bouge : immobile depuis l'attente permise, elle attend quelque
// chose (permission, élicitation, `Stop` manqué) et compte comme une attente depuis sa dernière écriture (contre-épreuve
// de B : aucun silence de plus de 11 min pendant un tour, sur 301 tours de 67 sessions distantes). Une attente suivie
// d'écritures (permission accordée, réponse) travaille de nouveau ; BOUGE laisse passer ce qu'écrit la fin du tour.
const BOUGE = 5e3;

/**
 * Les sessions notées et ce qu'elles demandent : `besoin` si l'une travaille, ou attend depuis moins de `attente`
 * minutes. Une session dont le processus est mort est finie ; `nettoyer` efface sa note (le gardien, pas une lecture),
 * comme celle d'une session sans processus connu, échue depuis un jour.
 */
export function evaluer({ accueil, maintenant = Date.now(), attente = ATTENTE_MIN, enVie = vivant, nettoyer = false }) {
  const d = dossierVeille(accueil); let noms = [];
  try { noms = fs.readdirSync(d).filter((n) => n.endsWith('.json')).sort(); } catch { /* aucune note */ }
  const sessions = []; const finies = [];
  const effacer = (f) => { if (nettoyer) fs.rmSync(f, { force: true }); };
  for (const n of noms) {
    const f = path.join(d, n); const s = lireJson(f, null);
    // Illisible (en cours d'écriture, abîmée) : ni comptée ni effacée.
    if (!s?.session || !['travaille', 'attend'].includes(s.etat) || !Number.isFinite(Date.parse(s.depuis))) continue;
    if (s.pid && !enVie({ pid: s.pid, debut: s.debut_pid })) { effacer(f); finies.push(s.session); continue; }
    let etat = s.etat; let depuis = Date.parse(s.depuis);
    // Sans processus connu, une session qui « travaille » ne se vérifie pas : bornée comme une attente.
    if (etat === 'travaille' && !s.pid) etat = 'attend';
    const ecrite = s.pid ? activite(s.transcription) : null;
    if (etat === 'attend' && ecrite !== null && ecrite > depuis + BOUGE) etat = 'travaille';
    if (etat === 'travaille') {
      const t = attenteDansTranscription(s.transcription);
      const derniere = Math.max(depuis, ecrite ?? depuis);
      if (Number.isFinite(t) && t >= depuis) { etat = 'attend'; depuis = t; }
      else if (maintenant - derniere >= attente * 60e3) { etat = 'attend'; depuis = derniere; }
    }
    const reste = etat === 'travaille' ? null : depuis + attente * 60e3 - maintenant;
    if (!s.pid && reste !== null && reste < -864e5) { effacer(f); continue; }
    sessions.push({ session: s.session, etat, depuis: new Date(depuis).toISOString(), retient: reste === null || reste > 0,
      ...(reste !== null && reste > 0 && { reste_min: Math.ceil(reste / 60e3) }), dossier: s.dossier || null });
  }
  return { besoin: sessions.some((x) => x.retient), sessions, finies };
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

/** Lance la commande et attend « tenue » : rend le processus, ou lève s'il s'arrête, se tait ou ne se lance pas. */
export function lancerDemande([bin, ...args], { delai = 60e3 } = {}) {
  return new Promise((ok, ko) => {
    let fini = false; let sortie = '';
    const finir = (f) => { if (fini) return; fini = true; clearTimeout(minuteur); f(); };
    const enfant = spawn(bin, args, { cwd: path.dirname(bin), stdio: ['pipe', 'pipe', 'pipe'] });
    const minuteur = setTimeout(() => finir(() => { enfant.kill(); ko(new Error(`demande d'éveil sans réponse après ${delai / 1e3} s`)); }), delai);
    enfant.on('error', (e) => finir(() => ko(new Error(`demande d'éveil non lancée : ${e.message}`))));
    enfant.stdin.on('error', () => { /* processus déjà parti : sa sortie le dit */ });
    enfant.stdout.on('data', (d) => { sortie += d; if (/^tenue\r?$/m.test(sortie)) finir(() => ok(enfant)); });
    enfant.stderr.on('data', (d) => { sortie += d; });
    enfant.on('exit', (code) => finir(() => ko(new Error(`demande d'éveil refusée (code ${code})${sortie.trim() ? ` : ${sortie.trim().slice(0, 200)}` : ''}`))));
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
 * `power.failed` (une fois par message : un passage toutes les 30 s ne répète pas la même panne).
 */
export function creerGardien({ accueil, journal = null, commande = commandeWindows(), attente = ATTENTE_MIN, maintenant = Date.now, log = () => {}, delai = 60e3 }) {
  let demande = null; let panne = null; let file = Promise.resolve();
  const ecrire = (kind, data) => {
    if (!journal) return;
    try {
      const t = maintenant(); const r = journal.ajouter([{ id: ulid(t), at: new Date(t).toISOString(), kind, actor: 'system:veille', data, classification: 'internal' }]);
      if (r.refuses?.length) log(`événement refusé par le journal : ${r.refuses[0].erreur}`);
    } catch (e) { log(`journal injoignable : ${e.message}`); }
  };
  const echec = (message) => { if (message !== panne) { panne = message; ecrire('power.failed', { message }); } log(message); };
  const retenues = (e) => e.sessions.filter((x) => x.retient).map((x) => ({ session: x.session, etat: x.etat, ...(x.dossier && { projet: path.basename(x.dossier) }) }));
  async function relacher(raison) {
    const enfant = demande; demande = null; if (!enfant) return;
    try { enfant.stdin.end(); } catch { /* déjà fermé */ }
    await attendreFin(enfant, 10e3);
    ecrire('power.released', { raison }); log(`demande d'éveil relâchée (${raison})`);
  }
  async function passer() {
    const e = evaluer({ accueil, maintenant: maintenant(), attente, nettoyer: true });
    if (e.besoin && !demande) {
      if (!commande) { echec("aucun mécanisme pour retarder la veille sur ce site (Windows, vu de WSL)"); return e; }
      try {
        const enfant = await lancerDemande(commande, { delai });
        demande = enfant; panne = null;
        enfant.once('exit', (code) => { if (demande === enfant) { demande = null; echec(`demande d'éveil arrêtée hors du gardien (code ${code})`); } });
        const s = retenues(e); ecrire('power.held', { sessions: s }); log(`demande d'éveil tenue : ${s.map((x) => `${x.projet || x.session} (${x.etat})`).join(', ')}`);
      } catch (err) { echec(err.message); }
    } else if (!e.besoin && demande) await relacher('aucune-session');
    return e;
  }
  return {
    // Les passages s'enchaînent, jamais deux à la fois (minuteur et changement d'une note peuvent se croiser).
    passer() { const p = file.then(passer); file = p.catch((err) => log(`passage en échec : ${err.message}`)); return p; },
    async arreter() { await file; await relacher('arret'); },
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
