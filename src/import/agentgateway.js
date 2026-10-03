// Import du journal JSON d'une passerelle agentgateway (étape 2, décision passerelle-par-site) vers le journal :
// `tool.called` pour chaque appel d'outil qui la traverse, quel que soit le client (Claude Code, Claude Desktop…).
// Garde le serveur, l'outil, le code HTTP, la durée et la session ; jamais les arguments (la passerelle ne les écrit
// pas). Idempotent : identifiants tirés de la ligne, lecture reprise là où la précédente s'est arrêtée.
//
// Limite constatée (essai du 2026-10-03) : la passerelle répond 200 même quand l'outil échoue ; elle ne voit que les
// échecs HTTP (refus, authentification, serveur injoignable). Le statut d'un appel transmis reste donc inconnu (null).
import fs from 'node:fs';
import path from 'node:path';
import { ulid } from '../ulid.js';

const duree = (d) => { const m = /^([\d.]+)(ms|s|µs|us)$/.exec(String(d || '')); return m ? Math.round(+m[1] * { ms: 1, s: 1000, µs: 1e-3, us: 1e-3 }[m[2]]) : null; };
const statut = (http) => (http === 401 || http === 403 ? 'refuse' : http >= 400 ? 'erreur' : null);

export function evenementsDe(lignes, nom) {
  const out = [];
  for (const ligne of lignes) {
    let e; try { e = JSON.parse(ligne); } catch { continue; }
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
  let etat = {}; try { etat = JSON.parse(fs.readFileSync(etatF, 'utf8')); } catch { /* premier import */ }
  const st = fs.statSync(f); const prec = etat[f];
  // Même fichier, qui a grandi : on reprend après la dernière ligne lue ; sinon (rotation, troncature) depuis le début.
  const debut = prec && prec.ino === st.ino && st.size >= prec.position ? prec.position : 0;
  const fd = fs.openSync(f, 'r');
  const tampon = Buffer.alloc(Math.max(0, st.size - debut));
  fs.readSync(fd, tampon, 0, tampon.length, debut); fs.closeSync(fd);
  const texte = tampon.toString('utf8'); const fin = texte.lastIndexOf('\n') + 1; // seulement les lignes complètes
  const r = journal.ajouter(evenementsDe(texte.slice(0, fin).split('\n').filter(Boolean), options.nom || 'passerelle'));
  etat[f] = { ino: st.ino, position: debut + Buffer.byteLength(texte.slice(0, fin)) };
  fs.mkdirSync(path.dirname(etatF), { recursive: true });
  fs.writeFileSync(etatF, JSON.stringify(etat));
  return { fichiers_lus: 1, ...r, refuses: r.refuses.length };
}
