// Import des transcriptions Claude Code (~/.claude/projects/<projet>/<session>.jsonl, sous-agents compris) vers le
// journal : session.started, session.finished, cost.recorded (tokens par modèle, en deltas depuis le dernier import).
// Idempotent : identifiants déterministes et état d'import par fichier. Ne copie aucun contenu de conversation.
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from '../ulid.js';

const IGNORER_MODELES = new Set(['<synthetic>']);

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
  const r = { session: null, debut: null, fin: null, cwd: null, branche: null, tours: 0, invites: 0, modeles: {}, sousAgent: f.includes(`${path.sep}subagents${path.sep}`) };
  const vus = new Set();
  for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!ligne) continue;
    let e; try { e = JSON.parse(ligne); } catch { continue; }
    if (e.timestamp) { if (!r.debut || e.timestamp < r.debut) r.debut = e.timestamp; if (!r.fin || e.timestamp > r.fin) r.fin = e.timestamp; }
    if (e.sessionId && !r.session) r.session = e.sessionId;
    if (e.cwd && !r.cwd) r.cwd = e.cwd;
    if (e.gitBranch && !r.branche) r.branche = e.gitBranch;
    if (e.type === 'user' && typeof e.message?.content === 'string') r.invites++;
    if (e.type !== 'assistant' || !e.message?.usage) continue;
    const cle = `${e.message.id || ''}:${e.requestId || ''}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const m = e.message.model || 'inconnu';
    if (IGNORER_MODELES.has(m)) continue;
    r.tours++;
    const u = e.message.usage; const t = (r.modeles[m] ||= { in: 0, cache_write: 0, cache_read: 0, out: 0 });
    t.in += u.input_tokens || 0; t.cache_write += u.cache_creation_input_tokens || 0; t.cache_read += u.cache_read_input_tokens || 0; t.out += u.output_tokens || 0;
  }
  return r;
}

const usd = (tarifs, modele, t) => {
  const p = tarifs?.[modele];
  if (!p) return null;
  return Math.round(((t.in * (p.entree || 0)) + (t.cache_write * (p.cache_ecrit || 0)) + (t.cache_read * (p.cache_lu || 0)) + (t.out * (p.sortie || 0))) / 1e4) / 100;
};

export default function importerTranscriptions(options, { journal, donnees, tarifs }) {
  const etatF = path.join(donnees, 'import', 'claude-code-transcriptions.json');
  let etat = {}; try { etat = JSON.parse(fs.readFileSync(etatF, 'utf8')); } catch { /* premier import */ }
  const calme = (options.calme_minutes ?? 10) * 60e3;
  const evenements = []; let lus = 0; let enCours = 0;
  for (const f of fichiers(options.home)) {
    const st = fs.statSync(f);
    const prec = etat[f];
    if (prec && prec.taille === st.size) continue;
    if (Date.now() - st.mtimeMs < calme) { enCours++; continue; }
    const a = analyser(f); lus++;
    if (!a.session || !a.debut) { etat[f] = { taille: st.size, cumuls: {}, session: false }; continue; }
    const principal = Object.entries(a.modeles).sort((x, y) => y[1].out - x[1].out)[0]?.[0] || 'inconnu';
    const actor = `agent:claude-code/${principal}`;
    const projet = a.cwd ? path.basename(a.cwd) : null;
    const corr = a.sousAgent ? `${a.session}:${path.basename(f, '.jsonl')}` : a.session;
    const base = { actor, correlation: corr, classification: 'internal' };
    if (!prec?.session) evenements.push({ ...base, id: ulid(Date.parse(a.debut), `${f}:start`), at: a.debut, kind: 'session.started', data: { projet, cwd: a.cwd, branche: a.branche, sous_agent: a.sousAgent, parent: a.sousAgent ? a.session : null } });
    for (const [m, t] of Object.entries(a.modeles)) {
      const avant = prec?.cumuls?.[m] || { in: 0, cache_write: 0, cache_read: 0, out: 0 };
      const delta = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v - (avant[k] || 0)]));
      if (Object.values(delta).every((v) => v <= 0)) continue;
      evenements.push({ ...base, id: ulid(Date.parse(a.fin), `${f}:${m}:${t.out}:${t.cache_read}`), at: a.fin, kind: 'cost.recorded',
        data: { projet, sous_agent: a.sousAgent }, cost: { provider: 'anthropic', model: m, usd_list: usd(tarifs, m, delta), tokens: delta } });
    }
    const duree = Math.round((Date.parse(a.fin) - Date.parse(a.debut)) / 1000);
    evenements.push({ ...base, id: ulid(Date.parse(a.fin), `${f}:end:${a.fin}`), at: a.fin, kind: 'session.finished',
      data: { projet, cwd: a.cwd, branche: a.branche, sous_agent: a.sousAgent, parent: a.sousAgent ? a.session : null, tours: a.tours, invites: a.invites, duree_s: duree, modeles: Object.keys(a.modeles) } });
    etat[f] = { taille: st.size, cumuls: a.modeles, session: true };
  }
  const r = journal.ajouter(evenements);
  fs.mkdirSync(path.dirname(etatF), { recursive: true });
  fs.writeFileSync(etatF, JSON.stringify(etat));
  return { fichiers_lus: lus, en_cours_ignores: enCours, ...r, refuses: r.refuses.length, premiers_refus: r.refuses.slice(0, 3).map((x) => x.erreur) };
}
