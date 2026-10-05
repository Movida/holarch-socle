// Import des transcriptions Claude Code (~/.claude/projects/<projet>/<session>.jsonl, sous-agents compris) vers le
// journal : session.started, session.finished, cost.recorded (tokens par modèle, en deltas depuis le dernier import),
// tool.denied (refus d'outil : origine et outil, jamais le contenu), tool.called (appel d'un outil MCP : serveur, outil,
// issue ; jamais les arguments ni la réponse).
// Idempotent : identifiants déterministes et état d'import par fichier. Ne copie aucun contenu de conversation.
// Un fichier se repère par son chemin relatif au répertoire du compte (`projects/…`), pas par son chemin absolu : le
// même répertoire lu depuis deux points de montage (un conteneur et l'hôte) ne compte qu'une fois.
// Le coût en USD ne se calcule pas ici mais à la lecture, depuis la grille de tarifs configurée (src/tarifs.js).
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from '../ulid.js';

const IGNORER_MODELES = new Set(['<synthetic>']);
// Version de l'état d'import : un fichier lu par une version antérieure est relu une fois, et l'écart des cumuls devient
// un événement complémentaire (v2 : part de l'écriture de cache à une heure, `cache_write_1h` ; v3 : refus d'outil ;
// v4 : appels MCP).
const VERSION_ETAT = 4;

// Refus d'outil : un résultat en erreur dont le texte COMMENCE par l'un de ces messages (décision refus). Un texte qui
// les cite ailleurs, une recherche par exemple, n'est pas un refus.
const REFUS = [
  ['classifieur', /^Permission for this action was denied by the Claude Code auto mode classifier\.(?: Reason: \[([^\]]{1,60})\])?/],
  ['regle', /^Permission to use \w+ /],
  ['regle', /^<tool_use_error>File is in a directory that is denied by your permission settings/],
  ['humain', /^The user doesn't want to proceed with this tool use/],
  ['securite', /^Permission for this command was denied by a built-in Claude Code safety check/],
  ['hook', /^\w+:\w+ hook error:/],
];
export function origineRefus(texte) {
  const t = String(texte || '').trimStart();
  for (const [origine, motif] of REFUS) { const m = t.match(motif); if (m) return { origine, categorie: m[1] || null }; }
  return null;
}
const texteDe = (c) => (Array.isArray(c) ? c.map((x) => x?.text || '').join(' ') : c);

function fichiers(home) {
  const projets = path.join(home, 'projects');
  if (!fs.existsSync(projets)) return [];
  const out = [];
  const marcher = (d, profondeur) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && profondeur < 3 && e.name !== 'memory') marcher(p, profondeur + 1);
      else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p);
    }
  };
  marcher(projets, 0);
  return out;
}

function analyser(f) {
  const r = { session: null, debut: null, fin: null, cwd: null, branche: null, tours: 0, invites: 0, modeles: {}, refus: [], appels: new Map(), sousAgent: f.includes(`${path.sep}subagents${path.sep}`) };
  const outils = {};
  const vus = new Set();
  for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!ligne) continue;
    let e; try { e = JSON.parse(ligne); } catch { continue; }
    if (e.timestamp) { if (!r.debut || e.timestamp < r.debut) r.debut = e.timestamp; if (!r.fin || e.timestamp > r.fin) r.fin = e.timestamp; }
    if (e.sessionId && !r.session) r.session = e.sessionId;
    if (e.cwd && !r.cwd) r.cwd = e.cwd;
    if (e.gitBranch && !r.branche) r.branche = e.gitBranch;
    if (e.type === 'user' && typeof e.message?.content === 'string') r.invites++;
    if (e.type === 'user' && Array.isArray(e.message?.content)) {
      for (const x of e.message.content) {
        if (x?.type !== 'tool_result') continue;
        const o = x.is_error ? origineRefus(texteDe(x.content)) : null;
        if (o) r.refus.push({ ...o, at: e.timestamp, cle: x.tool_use_id, outil: outils[x.tool_use_id] || null });
        const appel = r.appels.get(x.tool_use_id);
        if (appel) appel.statut = o ? 'refuse' : x.is_error ? 'erreur' : 'ok';
      }
    }
    if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const x of e.message.content) {
        if (x?.type !== 'tool_use') continue;
        outils[x.id] = x.name;
        // Un outil MCP se nomme mcp__<serveur>__<outil> : seuls le serveur et l'outil sont gardés.
        const [pre, serveur, ...reste] = String(x.name || '').split('__');
        if (pre === 'mcp' && serveur && reste.length && !r.appels.has(x.id)) r.appels.set(x.id, { at: e.timestamp, cle: x.id, serveur, outil: reste.join('__'), statut: null });
      }
    }
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    const cle = `${e.message.id || ''}:${e.requestId || ''}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const u = e.message.usage;
    if (IGNORER_MODELES.has(e.message.model)) continue;
    // Le mode rapide est facturé à part : ses tokens se comptent sous « <modèle>:rapide », qui a sa propre ligne de tarif.
    const m = (e.message.model || 'inconnu') + (u.speed === 'fast' ? ':rapide' : '');
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

export default function importerTranscriptions(options, { journal, donnees, passerelles = [], comptes = null }) {
  const viaPasserelle = new Set(passerelles.map((n) => String(n).replace(/[^A-Za-z0-9_-]/g, '_')));
  const etatF = path.join(donnees, 'import', 'claude-code-transcriptions.json');
  let etat = {}; try { etat = JSON.parse(fs.readFileSync(etatF, 'utf8')); } catch { /* premier import */ }
  const anciens = migrerEtat(etat);
  const calme = (options.calme_minutes ?? 10) * 60e3;
  const evenements = []; let lus = 0; let enCours = 0;
  // Plusieurs comptes (un répertoire chacun) : chaque événement porte le compte qui a produit la session.
  const sources = (comptes || [{ nom: null, home: options.home }]).flatMap((c) => fichiers(c.home).map((f) => [f, c.nom, c.home]));
  for (const [f, nomCompte, home] of sources) {
    const st = fs.statSync(f);
    const cle = cleDe(home, f, nomCompte);
    if (!etat[cle] && anciens.has(cleDe(home, f, null))) etat[cle] = anciens.get(cleDe(home, f, null));
    const prec = etat[cle];
    if (prec && prec.taille === st.size && prec.v === VERSION_ETAT) continue;
    if (Date.now() - st.mtimeMs < calme) { enCours++; continue; }
    const a = analyser(f); lus++;
    if (!a.session || !a.debut) { etat[cle] = { v: VERSION_ETAT, taille: st.size, cumuls: {}, session: false }; continue; }
    const principal = Object.entries(a.modeles).sort((x, y) => y[1].out - x[1].out)[0]?.[0] || 'inconnu';
    const actor = `agent:claude-code/${principal}`;
    const projet = a.cwd ? path.basename(a.cwd) : null;
    const corr = a.sousAgent ? `${a.session}:${path.basename(f, '.jsonl')}` : a.session;
    const base = { actor, correlation: corr, classification: 'internal' };
    const cpt = nomCompte ? { compte: nomCompte } : {};
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
    for (const x of a.refus) {
      evenements.push({ ...base, id: ulid(Date.parse(x.at || a.fin), `${cle}:refus:${x.cle}`), at: x.at || a.fin, kind: 'tool.denied',
        data: { projet, ...cpt, sous_agent: a.sousAgent, outil: x.outil, origine: x.origine, categorie: x.categorie } });
    }
    for (const x of a.appels.values()) {
      if (viaPasserelle.has(x.serveur)) continue; // la passerelle le journalise elle-même, avec le vrai serveur et le vrai outil
      evenements.push({ ...base, id: ulid(Date.parse(x.at || a.fin), `${cle}:appel:${x.cle}`), at: x.at || a.fin, kind: 'tool.called',
        data: { projet, ...cpt, sous_agent: a.sousAgent, serveur: x.serveur, outil: x.outil, statut: x.statut } });
    }
    const duree = Math.round((Date.parse(a.fin) - Date.parse(a.debut)) / 1000);
    evenements.push({ ...base, id: ulid(Date.parse(a.fin), `${cle}:end:${a.fin}`), at: a.fin, kind: 'session.finished',
      data: { projet, ...cpt, cwd: a.cwd, branche: a.branche, sous_agent: a.sousAgent, parent: a.sousAgent ? a.session : null, tours: a.tours, invites: a.invites, duree_s: duree, modeles: Object.keys(a.modeles) } });
    etat[cle] = { v: VERSION_ETAT, taille: st.size, cumuls: a.modeles, session: true };
  }
  const r = journal.ajouter(evenements);
  fs.mkdirSync(path.dirname(etatF), { recursive: true });
  fs.writeFileSync(etatF, JSON.stringify(etat));
  return { fichiers_lus: lus, en_cours_ignores: enCours, ...r, refuses: r.refuses.length, premiers_refus: r.refuses.slice(0, 3).map((x) => x.erreur) };
}
