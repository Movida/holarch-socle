// Import des transcriptions Claude Code (~/.claude/projects/<projet>/<session>.jsonl, sous-agents compris) vers le
// journal : session.started, session.finished, cost.recorded (tokens par modèle, en deltas depuis le dernier import),
// tool.denied (refus d'outil : origine et outil, jamais le contenu), tool.called (appel d'un outil MCP : serveur, outil,
// issue ; jamais les arguments ni la réponse), tool.failed (erreur d'outil qui n'est pas un refus : motif d'une liste
// fixe, code de sortie et nom du programme d'une commande shell ; jamais la commande ni la sortie), et en fin de session
// les tests lancés et rouges (décision echecs-au-journal). Une session se rattache aux projets du catalogue dont ses appels d'outils
// ont touché le dépôt (`data.projets` : identifiant et nombre d'appels ; jamais les chemins ni les commandes).
// Idempotent : identifiants déterministes et état d'import par fichier. Ne copie aucun contenu de conversation.
import { cleServeur, lireJson, ecrireJson } from '../commun.js';
// Un fichier se repère par son chemin relatif au répertoire du compte (`projects/…`), pas par son chemin absolu : le
// même répertoire lu depuis deux points de montage (un conteneur et l'hôte) ne compte qu'une fois.
// Le coût en USD ne se calcule pas ici mais à la lecture, depuis la grille de tarifs configurée (src/tarifs.js).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ulid } from '../ulid.js';
import { localiserProjet, projetDuDossierConteneur } from '../projets.js';

const IGNORER_MODELES = new Set(['<synthetic>']);
// Version de l'état d'import : un fichier lu par une version antérieure est relu une fois, et l'écart des cumuls devient
// un événement complémentaire (v2 : part de l'écriture de cache à une heure, `cache_write_1h` ; v3 : refus d'outil ;
// v4 : appels MCP ; v5 : projets touchés, en complément pour une transcription inchangée ; v6 : échecs d'outil, tests,
// refus d'approbation).
const VERSION_ETAT = 6;

// Refus d'outil : un résultat en erreur dont le texte COMMENCE par l'un de ces messages (décision refus). Un texte qui
// les cite ailleurs, une recherche par exemple, n'est pas un refus. Le troisième terme est la version de l'état d'import
// qui a ajouté le motif : une transcription déjà lue n'en reçoit, en complément, que les refus nouveaux.
// `approbation` : une commande qui demandait une approbation, refusée faute de réponse (décision echecs-au-journal).
const REFUS = [
  ['classifieur', /^Permission for this action was denied by the Claude Code auto mode classifier\.(?: Reason: \[([^\]]{1,60})\])?/, 3],
  ['classifieur', /^The server-side auto mode classifier gave no verdict/, 6, 'sans verdict'],
  ['regle', /^Permission to use \w+ /, 3],
  ['regle', /^<tool_use_error>File is in a directory that is denied by your permission settings/, 3],
  ['humain', /^The user doesn't want to proceed with this tool use/, 3],
  ['securite', /^Permission for this command was denied by a built-in Claude Code safety check/, 3],
  ['hook', /^\w+:\w+ hook error:/, 3],
  ['hook', /^\[[A-Z]+ · garde-fou [\w-]+\]/, 6],
  ['approbation', /^(?:This (?:Bash )?command (?:contains multiple operations|requires approval|changes directory before)|Contains (?:[a-z]+_[a-z_]+|expansion\b|shell syntax|brace with quote)|\w+ command requires approval|Newline followed by # inside a quoted argument|Parser skipped input between top-level statements|Accesses \/proc\/|Claude requested permissions to \w+ |Commands that change directories and |\w+ in '[^'\n]*' (?:was blocked|needs approval)|Heredoc with unquoted delimiter|Glob patterns are not allowed in write operations|\w+ with '-\w+' executes commands|backtick substitution scan could not be trusted)/, 6],
];
export function origineRefus(texte) {
  const t = String(texte || '').trimStart();
  for (const [origine, motif, v, categorie] of REFUS) { const m = t.match(motif); if (m) return { origine, categorie: m[1] || categorie || null, v }; }
  return null;
}

// Échec d'outil (décision echecs-au-journal) : motif tiré d'une liste fixe, reconnu au début du message ; le reste est
// `autre`. Une commande de test est rouge à sa sortie non nulle OU au résumé de son lanceur : derrière un tube
// (`npm test | tail`), la sortie est celle du dernier programme.
const MOTIFS = [
  ['edition-perimee', /^<tool_use_error>File has been modified since read/],
  ['edition-introuvable', /^<tool_use_error>String to replace not found/],
  ['edition-ambigue', /^<tool_use_error>Found \d+ matches of the string to replace/],
  ['edition-non-lue', /^<tool_use_error>File has not been read yet/],
  ['fichier-absent', /^(?:<tool_use_error>)?File does not exist/],
  ['validation', /^(?:<tool_use_error>)?InputValidationError/],
  ['delai', /^(?:<tool_use_error>)?[^\n]{0,80}\btimed out\b/i],
];
const TEST = /\b(?:npm|pnpm|yarn)\s+(?:run\s+)?test\b|\bnode\s+(?:--[\w-]+\s+)*--test\b/;
const TEST_ROUGE = /^(?:#|ℹ) fail [1-9]/m;
const COMMIT = /\bgit\b[^|;&\n]*\bcommit\b/;
const REFUS_GARDE = /^HOLARCH : commit refusé par la règle /m;
// Nom du premier programme d'une commande, après les `cd` et les affectations ; un nom seul, jamais un chemin ni un
// argument (null s'il n'a pas la forme d'un nom).
export function programmeDe(commande) {
  for (const segment of String(commande || '').split(/&&|\|\||[;|\n]/)) {
    const mots = segment.trim().split(/\s+/).filter((m) => m && !/^\w+=/.test(m));
    if (!mots.length || mots[0] === 'cd') continue;
    const nom = path.basename(mots[0]);
    return /^[A-Za-z0-9._+-]{1,32}$/.test(nom) ? nom : null;
  }
  return null;
}
export function echecOutil(outil, texte, entree) {
  const t = String(texte || '').trimStart();
  const commande = typeof entree?.command === 'string' ? entree.command : null;
  if (commande == null) return { motif: (MOTIFS.find(([, m]) => m.test(t)) || ['autre'])[0] };
  const code = t.match(/^Exit code (\d+)/)?.[1];
  const shell = { code: code == null ? null : Number(code), programme: programmeDe(commande) };
  if (TEST.test(commande)) return { motif: 'tests', ...shell };
  if (COMMIT.test(commande) && REFUS_GARDE.test(t)) return { motif: 'garde', ...shell };
  const m = MOTIFS.find(([, x]) => x.test(t));
  return { motif: m ? m[0] : code != null ? 'sortie' : 'autre', ...shell };
}
const texteDe = (c) => (Array.isArray(c) ? c.map((x) => x?.text || '').join(' ') : c);

/** Les transcriptions d'un compte (`<home>/projects/…/*.jsonl`, sous-agents compris, mémoires exclues) ; un dossier illisible est passé. */
export function fichiers(home) {
  const projets = path.join(home, 'projects');
  if (!fs.existsSync(projets)) return [];
  const out = [];
  const marcher = (d, profondeur) => {
    let entrees; try { entrees = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entrees) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && profondeur < 3 && e.name !== 'memory') marcher(p, profondeur + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  marcher(projets, 0);
  return out;
}

// Chemins qu'un appel d'outil désigne : arguments de fichier, et, dans une commande shell, les chemins absolus (ou `~/…`)
// et les cibles de `cd` et de `git -C`, résolus depuis le répertoire courant de la ligne.
const CLES_CHEMIN = ['file_path', 'notebook_path', 'path'];
function resoudre(p, cwd) {
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  if (path.isAbsolute(p)) return path.normalize(p);
  return cwd ? path.resolve(cwd, p) : null;
}
export function cheminsAppel(entree, cwd) {
  const i = entree && typeof entree === 'object' ? entree : {};
  const bruts = CLES_CHEMIN.map((k) => i[k]).filter((v) => typeof v === 'string' && v);
  if (typeof i.command === 'string') {
    const mots = i.command.split(/[\s;&|()<>"'`=]+/).filter(Boolean);
    mots.forEach((m, k) => { if (m.startsWith('/') || m.startsWith('~/') || ((mots[k - 1] === 'cd' || mots[k - 1] === '-C') && !m.startsWith('-'))) bruts.push(m); });
  }
  return bruts.map((p) => resoudre(p, cwd)).filter(Boolean);
}

// Textes venus d'une transcription et gardés au journal, bornés : un conteneur écrit librement les siennes.
const borne = (t, n) => (typeof t === 'string' ? t.slice(0, n) : t ?? null);
// Plafond d'une transcription lue d'un bloc (mesure du 2026-10-09 : 152 Mo au plus sur 805 fichiers, médiane 0,75 Mo).
export const TAILLE_MAX_MO = 400;

function analyser(f, projetDe = () => null) {
  const r = { session: null, debut: null, fin: null, cwd: null, branche: null, tours: 0, invites: 0, modeles: {}, refus: [], echecs: [], tests: { lances: 0, rouges: 0 }, appels: new Map(), projets: new Map(), sousAgent: f.includes(`${path.sep}subagents${path.sep}`) };
  const outils = {}; const entrees = {};
  const vus = new Set();
  for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!ligne) continue;
    let e; try { e = JSON.parse(ligne); } catch { continue; }
    if (e.timestamp) { if (!r.debut || e.timestamp < r.debut) r.debut = e.timestamp; if (!r.fin || e.timestamp > r.fin) r.fin = e.timestamp; }
    if (typeof e.sessionId === 'string' && /^[\w.:-]{1,128}$/.test(e.sessionId) && !r.session) r.session = e.sessionId;
    if (typeof e.cwd === 'string' && !r.cwd) r.cwd = borne(e.cwd, 300);
    if (typeof e.gitBranch === 'string' && !r.branche) r.branche = borne(e.gitBranch, 100);
    if (e.type === 'user' && typeof e.message?.content === 'string') r.invites++;
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const x of e.message.content) {
        if (x?.type !== 'tool_result') continue;
        const texte = texteDe(x.content);
        const o = x.is_error ? origineRefus(texte) : null;
        if (o) r.refus.push({ ...o, at: e.timestamp, cle: x.tool_use_id, outil: borne(outils[x.tool_use_id], 100) });
        const commande = entrees[x.tool_use_id]?.command;
        const test = typeof commande === 'string' && TEST.test(commande) && !o;
        const rouge = test && (x.is_error || TEST_ROUGE.test(String(texte || '')));
        if (test) { r.tests.lances++; if (rouge) r.tests.rouges++; }
        if (!o && (x.is_error || rouge)) r.echecs.push({ ...echecOutil(outils[x.tool_use_id], texte, entrees[x.tool_use_id]), at: e.timestamp, cle: x.tool_use_id, outil: borne(outils[x.tool_use_id], 100) });
        const appel = r.appels.get(x.tool_use_id);
        if (appel) appel.statut = o ? 'refuse' : x.is_error ? 'erreur' : 'ok';
      }
    }
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const x of e.message.content) {
        if (x?.type !== 'tool_use') continue;
        outils[x.id] = x.name; entrees[x.id] = x.input;
        // Un appel touche les projets dont ses chemins désignent le dépôt ; à défaut, celui de son répertoire courant.
        let touches = new Set(cheminsAppel(x.input, e.cwd).map(projetDe).filter(Boolean));
        if (!touches.size && e.cwd) touches = new Set([projetDe(e.cwd)].filter(Boolean));
        for (const p of touches) r.projets.set(p.id, (r.projets.get(p.id) || 0) + 1);
        // Un outil MCP se nomme mcp__<serveur>__<outil> : seuls le serveur et l'outil sont gardés.
        const [pre, serveur, ...reste] = String(x.name || '').split('__');
        if (pre === 'mcp' && serveur && reste.length && !r.appels.has(x.id)) r.appels.set(x.id, { at: e.timestamp, cle: x.id, serveur: borne(serveur, 100), outil: borne(reste.join('__'), 100), statut: null });
      }
    }
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    const cle = `${e.message.id || ''}:${e.requestId || ''}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const u = e.message.usage;
    if (IGNORER_MODELES.has(e.message.model)) continue;
    // Le mode rapide est facturé à part : ses tokens se comptent sous « <modèle>:rapide », qui a sa propre ligne de tarif.
    const m = borne(String(e.message.model || 'inconnu'), 80) + (u.speed === 'fast' ? ':rapide' : '');
    r.tours++;
    const t = (r.modeles[m] ||= { in: 0, cache_write: 0, cache_write_1h: 0, cache_read: 0, out: 0 });
    t.in += u.input_tokens || 0; t.cache_write += u.cache_creation_input_tokens || 0; t.cache_read += u.cache_read_input_tokens || 0; t.out += u.output_tokens || 0;
    t.cache_write_1h += u.cache_creation?.ephemeral_1h_input_tokens || 0;
  }
  return r;
}

// Clé d'un fichier dans l'état d'import et dans la graine des identifiants : chemin relatif au répertoire du compte,
// préfixé du nom du compte s'il en a un.
const cleDe = (home, f, nomCompte) => (nomCompte ? `${nomCompte}:` : '') + path.relative(home, f).split(path.sep).join('/');

// Un état écrit avant ces clés relatives portait des chemins absolus, peut-être vus d'un autre point de montage :
// la partie à partir du dernier `/projects/` les rattache au même fichier. Le plus avancé l'emporte.
function migrerEtat(etat) {
  const anciens = new Map();
  for (const [k, v] of Object.entries(etat)) {
    if (!k.startsWith('/')) continue;
    const i = k.lastIndexOf('/projects/');
    if (i >= 0) { const r = k.slice(i + 1); if (!anciens.has(r) || (v.taille || 0) > (anciens.get(r).taille || 0)) anciens.set(r, v); }
    delete etat[k];
  }
  return anciens;
}

export default function importerTranscriptions(options, { journal, donnees, passerelles = [], comptes = null, projets = [] }) {
  const projetDe = localiserProjet(projets);
  const viaPasserelle = new Set(passerelles.map(cleServeur));
  const etatF = path.join(donnees, 'import', 'claude-code-transcriptions.json');
  const etat = lireJson(etatF, {}); // premier import : vide
  const anciens = migrerEtat(etat);
  const calme = (options.calme_minutes ?? 10) * 60e3;
  const evenements = []; let lus = 0; let enCours = 0; let illisibles = 0; let tropGrands = 0;
  const plafond = (options.taille_max_mo ?? TAILLE_MAX_MO) * 2 ** 20;
  // Plusieurs comptes (un répertoire chacun) : chaque événement porte le compte qui a produit la session.
  const sources = (comptes || [{ nom: null, home: options.home }]).flatMap((c) => fichiers(c.home).map((f) => [f, c.nom, c.home]));
  for (const [f, nomCompte, home] of sources) {
    const cle = cleDe(home, f, nomCompte);
    if (!etat[cle] && anciens.has(cleDe(home, f, null))) etat[cle] = anciens.get(cleDe(home, f, null));
    const prec = etat[cle];
    // Le dossier `-workspaces-<dépôt>` est écrit par le conteneur du projet (monté depuis l'hôte) : ce qu'il contient ne
    // se rattache qu'à ce projet, et se marque `environnement: conteneur` (pas `origine`, qui dit d'où vient un refus
    // d'outil et l'écraserait sur `tool.denied`). Un fichier illisible ou trop grand est passé et
    // compté, sans arrêter l'import des autres ; il sera relu au passage suivant.
    const dossier = path.relative(path.join(home, 'projects'), f).split(path.sep)[0];
    const conteneur = dossier.startsWith('-workspaces-');
    const permis = conteneur ? projetDuDossierConteneur(projets, dossier) : null;
    let st; let a;
    try {
      st = fs.statSync(f);
      if (prec && prec.taille === st.size && prec.v === VERSION_ETAT) continue;
      if (Date.now() - st.mtimeMs < calme) { enCours++; continue; }
      if (st.size > plafond) { tropGrands++; continue; }
      a = analyser(f, conteneur ? (c) => { const p = projetDe(c); return p && p.id === permis?.id ? p : null; } : projetDe); lus++;
    } catch { illisibles++; continue; }
    if (!a.session || !a.debut) { etat[cle] = { v: VERSION_ETAT, taille: st.size, cumuls: {}, session: false }; continue; }
    const principal = Object.entries(a.modeles).sort((x, y) => y[1].out - x[1].out)[0]?.[0] || 'inconnu';
    const actor = `agent:claude-code/${principal}`;
    const projet = conteneur ? (permis ? path.basename(permis.location) : null) : a.cwd ? path.basename(a.cwd) : null;
    const corr = a.sousAgent ? `${a.session}:${path.basename(f, '.jsonl')}` : a.session;
    const base = { actor, correlation: corr, classification: 'internal' };
    const cpt = { ...(nomCompte && { compte: nomCompte }), ...(conteneur && { environnement: 'conteneur' }) };
    const touches = [...a.projets].map(([id, n]) => ({ id, n })).sort((x, y) => y.n - x.n).slice(0, 20);
    const duree = Math.round((Date.parse(a.fin) - Date.parse(a.debut)) / 1000);
    const fin = { projet, ...cpt, cwd: a.cwd, branche: a.branche, sous_agent: a.sousAgent, parent: a.sousAgent ? a.session : null, tours: a.tours, invites: a.invites, duree_s: duree, modeles: Object.keys(a.modeles), ...(a.tests.lances && { tests: a.tests }) };
    // Transcription déjà importée, inchangée, relue pour une version antérieure : seuls ses compléments s'ajoutent (coûts
    // ventilés, refus et appels s'ils n'existaient pas, projets touchés par un `session.finished` complémentaire). Rien de
    // ce qui existait déjà n'est réémis : la graine des identifiants a pu changer depuis (clé relative au compte).
    const relu = prec?.session && prec.taille === st.size;
    const v = prec?.v ?? 0;
    if (!prec?.session) evenements.push({ ...base, id: ulid(Date.parse(a.debut), `${cle}:start`), at: a.debut, kind: 'session.started', data: { projet, ...cpt, cwd: a.cwd, branche: a.branche, sous_agent: a.sousAgent, parent: a.sousAgent ? a.session : null } });
    for (const [m, t] of Object.entries(a.modeles)) {
      const avant = prec?.cumuls?.[m] || {};
      const delta = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v - (avant[k] || 0)]));
      if (Object.values(delta).every((v) => v <= 0)) continue;
      evenements.push({ ...base, id: ulid(Date.parse(a.fin), `${cle}:${m}:${t.out}:${t.cache_read}:${t.cache_write_1h}`), at: a.fin, kind: 'cost.recorded',
        // Un identifiant préfixé (`fournisseur/modèle`) est passé par un intermédiaire, qui facture lui-même.
        data: { projet, ...cpt, sous_agent: a.sousAgent, ...(m.includes('/') && { via: 'intermediaire' }) },
        cost: { provider: m.includes('/') ? m.split('/')[0] : 'anthropic', model: m, usd_list: null, tokens: delta } });
    }
    for (const x of relu ? a.refus.filter((x) => x.v > v) : a.refus) {
      evenements.push({ ...base, id: ulid(Date.parse(x.at || a.fin), `${cle}:refus:${x.cle}`), at: x.at || a.fin, kind: 'tool.denied',
        data: { projet, ...cpt, sous_agent: a.sousAgent, outil: x.outil, origine: x.origine, categorie: x.categorie } });
    }
    for (const x of relu && v >= 6 ? [] : a.echecs) {
      evenements.push({ ...base, id: ulid(Date.parse(x.at || a.fin), `${cle}:echec:${x.cle}`), at: x.at || a.fin, kind: 'tool.failed',
        data: { projet, ...cpt, sous_agent: a.sousAgent, outil: x.outil, motif: x.motif, ...(x.programme !== undefined && { code: x.code, programme: x.programme }) } });
    }
    for (const x of relu && v >= 4 ? [] : a.appels.values()) {
      if (viaPasserelle.has(x.serveur)) continue; // la passerelle le journalise elle-même, avec le vrai serveur et le vrai outil
      evenements.push({ ...base, id: ulid(Date.parse(x.at || a.fin), `${cle}:appel:${x.cle}`), at: x.at || a.fin, kind: 'tool.called',
        data: { projet, ...cpt, sous_agent: a.sousAgent, serveur: x.serveur, outil: x.outil, statut: x.statut } });
    }
    if (!relu) evenements.push({ ...base, id: ulid(Date.parse(a.fin), `${cle}:end:${a.fin}`), at: a.fin, kind: 'session.finished', data: { ...fin, projets: touches } });
    else if (v < 5 && touches.length) evenements.push({ ...base, id: ulid(Date.parse(a.fin), `${cle}:projets:${a.fin}`), at: a.fin, kind: 'session.finished', data: { ...fin, projets: touches, complement: 'projets' } });
    // Les tests d'une session lue avant la version 6 s'ajoutent par un complément qui reprend toute la fin (les lectures
    // prennent la dernière fin d'une session pour son répertoire et ses projets).
    else if (v < 6 && a.tests.lances) evenements.push({ ...base, id: ulid(Date.parse(a.fin), `${cle}:tests:${a.fin}`), at: a.fin, kind: 'session.finished', data: { ...fin, projets: touches, complement: 'tests' } });
    etat[cle] = { v: VERSION_ETAT, taille: st.size, cumuls: a.modeles, session: true };
  }
  const r = journal.ajouter(evenements);
  ecrireJson(etatF, etat, { indent: 0 });
  return { fichiers_lus: lus, en_cours_ignores: enCours, ...(illisibles && { illisibles }), ...(tropGrands && { trop_grands: tropGrands }), ...r, refuses: r.refuses.length, premiers_refus: r.refuses.slice(0, 3).map((x) => x.erreur) };
}
