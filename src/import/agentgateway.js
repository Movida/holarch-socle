// Import du journal JSON d'une passerelle agentgateway (étape 2, décision passerelle-par-site) vers le journal :
// `tool.called` pour chaque appel d'outil qui la traverse, quel que soit le client (Claude Code, Claude Desktop…).
// Garde le serveur, l'outil, le code HTTP, la durée et la session ; jamais les arguments (la passerelle ne les écrit
// pas). Idempotent : identifiants tirés de la ligne, lecture reprise là où la précédente s'est arrêtée, ou à la première
// ligne dont un événement a été refusé par le journal.
//
// Limite constatée (essai du 2026-10-03) : la passerelle répond 200 même quand l'outil échoue ; elle ne voit que les
// échecs HTTP (refus, authentification, serveur injoignable). Le statut d'un appel transmis reste donc inconnu (null).
//
// `system.degraded` pour chaque cible que la passerelle ignore (`failOpen`) : sans cela, un serveur qui ne démarre pas
// disparaît des clients sans aucune erreur (essai du site de travail, Q9). Seuls le serveur et la phase sont gardés,
// jamais le détail de l'erreur.
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from '../ulid.js';
import { lireJson, ecrireJson } from '../commun.js';

const duree = (d) => { const m = /^([\d.]+)(ms|s|µs|us)$/.exec(String(d || '')); return m ? Math.round(+m[1] * { ms: 1, s: 1000, µs: 1e-3, us: 1e-3 }[m[2]]) : null; };
const statut = (http) => (http === 401 || http === 403 ? 'refuse' : http >= 400 ? 'erreur' : null);

const CIBLE_IGNOREE = [
  [/^failed to initialize target '([^']+)'/, 'demarrage'],
  [/^upstream '([^']+)' failed during fanout/, 'requete'],
  [/^upstream '([^']+)' failed during notification/, 'notification'],
  [/^upstream '([^']+)' failed for GET stream/, 'flux'],
];
export function cibleIgnoree(message) {
  for (const [motif, phase] of CIBLE_IGNOREE) { const m = String(message || '').match(motif); if (m) return { serveur: m[1], phase }; }
  return null;
}

export function evenementsDe(lignes, nom) {
  const out = [];
  for (const ligne of lignes) {
    let e; try { e = JSON.parse(ligne); } catch { continue; }
    const c = e.level === 'warn' && e.time ? cibleIgnoree(e.message) : null;
    if (c) {
      out.push({ id: ulid(Date.parse(String(e.time)), `${nom}:${ligne}`), at: String(e.time), kind: 'system.degraded', actor: 'system:passerelle',
        correlation: null, classification: 'internal', data: { composant: 'passerelle', serveur: c.serveur, phase: c.phase, via: nom } });
      continue;
    }
    if (e['mcp.method.name'] !== 'tools/call' || !e['mcp.target'] || !e.time) continue;
    const at = String(e.time);
    out.push({
      id: ulid(Date.parse(at), `${nom}:${ligne}`), at, kind: 'tool.called', actor: 'system:passerelle',
      correlation: e['mcp.session.id'] ? `passerelle:${e['mcp.session.id']}` : null, classification: 'internal',
      data: { serveur: e['mcp.target'], outil: e['gen_ai.tool.name'] || null, statut: statut(e['http.status']), http: e['http.status'] ?? null, duree_ms: duree(e.duration), via: nom },
    });
  }
  return out;
}

export default function importerPasserelle(options, { journal, donnees }) {
  const f = options.fichier;
  if (!f || !fs.existsSync(f)) return { fichiers_lus: 0, ajoutes: 0, ignores: 0, refuses: 0, absent: f || null };
  const etatF = path.join(donnees, 'import', 'agentgateway.json');
  const etat = lireJson(etatF, {}); // premier import : vide
  const st = fs.statSync(f); const prec = etat[f];
  // Même fichier, qui a grandi : on reprend après la dernière ligne lue ; sinon (rotation, troncature) depuis le début.
  const debut = prec && prec.ino === st.ino && st.size >= prec.position ? prec.position : 0;
  const fd = fs.openSync(f, 'r');
  const tampon = Buffer.alloc(Math.max(0, st.size - debut));
  fs.readSync(fd, tampon, 0, tampon.length, debut); fs.closeSync(fd);
  const texte = tampon.toString('utf8'); const complet = texte.slice(0, texte.lastIndexOf('\n') + 1); // seulement les lignes complètes
  // Chaque événement, avec l'octet où commence sa ligne.
  const evenements = []; const ligneDe = new Map(); let o = 0;
  for (const l of complet.split('\n')) {
    if (l) for (const e of evenementsDe([l], options.nom || 'passerelle')) { evenements.push(e); ligneDe.set(e.id, o); }
    o += Buffer.byteLength(l) + 1;
  }
  const r = journal.ajouter(evenements);
  // Un événement refusé par le journal n'est pas perdu : la position s'arrête au début de sa ligne, relue au passage
  // suivant (les événements acceptés qui la suivent reviennent avec le même identifiant et sont ignorés).
  const refus = r.refuses.map((x) => ligneDe.get(x.evenement?.id)).filter((x) => x !== undefined);
  etat[f] = { ino: st.ino, position: debut + (refus.length ? Math.min(...refus) : Buffer.byteLength(complet)) };
  ecrireJson(etatF, etat, { indent: 0 });
  return { fichiers_lus: 1, ...r, refuses: r.refuses.length };
}
