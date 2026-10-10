// Inventaire : exécute les adaptateurs actifs dans l'ordre (les dépôts d'abord, que les suivants réutilisent), puis
// remplace l'instantané du catalogue du site et journalise ce qui est apparu ou a disparu. Une source absente de cette
// machine se signale à part (`absentes`) : ce n'est pas une erreur, mais l'inventaire ne la tait pas.
import depotsGit from './depots-git.js';
import claudeCode from './claude-code.js';
import arbre from './arbre.js';
import docker from './docker.js';
import claudeDesktop from './claude-desktop.js';
import { SourceAbsente } from './source.js';
import { ulid } from '../ulid.js';
import { comptesClaudeCode, comptesNonLus, profilDuSite } from '../config.js';

export const ADAPTATEURS = { 'depots-git': depotsGit, 'claude-code': claudeCode, arbre, docker, 'claude-desktop': claudeDesktop };

export async function inventorier(config, { catalogue, journal }) {
  // Usage des serveurs MCP, tiré des appels au journal : les adaptateurs le portent sur les fiches des connecteurs.
  const appelsMcp = new Map();
  for (const e of journal.lire()) {
    if (e.kind !== 'tool.called' || !e.data?.serveur) continue;
    const u = appelsMcp.get(e.data.serveur) || { count: 0, last_used: null };
    u.count++; if (!u.last_used || e.at > u.last_used) u.last_used = e.at;
    appelsMcp.set(e.data.serveur, u);
  }
  const cc = config.inventaire['claude-code'];
  const comptes = comptesClaudeCode(config, cc || {});
  const ctx = { site: config.site, depots: [], projets: [], projetDe: () => null, appelsMcp, comptes, profil: profilDuSite(config) };
  const fiches = []; const erreurs = []; const absentes = [];
  // Un compte Claude Code présent sur le poste mais non lu rend l'inventaire et l'import incomplets, sans erreur : le dire.
  const nonLus = cc && cc.actif !== false ? comptesNonLus(comptes) : [];
  for (const [nom, adaptateur] of Object.entries(ADAPTATEURS)) {
    const opts = config.inventaire[nom];
    if (!opts || opts.actif === false) continue;
    try { fiches.push(...await adaptateur(opts, ctx)); } catch (e) { (e instanceof SourceAbsente ? absentes : erreurs).push(`${nom} : ${e.message}`); }
  }
  const r = catalogue.remplacer(fiches);
  const maintenant = Date.now(); const at = new Date(maintenant).toISOString();
  const ev = (kind, subject) => ({ id: ulid(maintenant), at, kind, actor: 'system:inventaire', subject, data: {}, classification: 'internal' });
  journal.ajouter([
    ...r.apparues.map((s) => ev('element.created', s)),
    ...r.disparues.map((s) => ev('element.retired', s)),
    ...r.deplacees.map((d) => ({ ...ev('element.moved', d.id), data: { de: d.de, vers: d.vers } })),
    { ...ev('inventory.finished', null), data: { fiches: r.fiches, apparues: r.apparues.length, disparues: r.disparues.length, deplacees: r.deplacees.length, refusees: r.refusees.length, erreurs, absentes, comptes: comptes.map((c) => c.nom).filter(Boolean), comptes_non_lus: nonLus } },
  ]);
  return { ...r, erreurs, absentes, comptes_non_lus: nonLus };
}
