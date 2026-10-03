// Inventaire : exécute les adaptateurs actifs dans l'ordre (les dépôts d'abord, que les suivants réutilisent), puis
// remplace l'instantané du catalogue du site et journalise ce qui est apparu ou a disparu.
import depotsGit from './depots-git.js';
import claudeCode from './claude-code.js';
import arbre from './arbre.js';
import { ulid } from '../ulid.js';

export const ADAPTATEURS = { 'depots-git': depotsGit, 'claude-code': claudeCode, arbre };

export function inventorier(config, { catalogue, journal }) {
  const ctx = { site: config.site, depots: [] };
  const fiches = []; const erreurs = [];
  for (const [nom, adaptateur] of Object.entries(ADAPTATEURS)) {
    const opts = config.inventaire[nom];
    if (!opts || opts.actif === false) continue;
    try { fiches.push(...adaptateur(opts, ctx)); } catch (e) { erreurs.push(`${nom} : ${e.message}`); }
  }
  const r = catalogue.remplacer(fiches);
  const maintenant = Date.now(); const at = new Date(maintenant).toISOString();
  const ev = (kind, subject) => ({ id: ulid(maintenant), at, kind, actor: 'system:inventaire', subject, data: {}, classification: 'internal' });
  journal.ajouter([
    ...r.apparues.map((s) => ev('element.created', s)),
    ...r.disparues.map((s) => ev('element.retired', s)),
    { ...ev('inventory.finished', null), data: { fiches: r.fiches, apparues: r.apparues.length, disparues: r.disparues.length, refusees: r.refusees.length, erreurs } },
  ]);
  return { ...r, erreurs };
}
