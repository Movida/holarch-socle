// Inventaire : exécute les adaptateurs actifs dans l'ordre (les dépôts d'abord, que les suivants réutilisent), puis
// remplace l'instantané du catalogue du site et journalise ce qui est apparu ou a disparu. Une source absente de cette
// machine se signale à part (`absentes`) : ce n'est pas une erreur, mais l'inventaire ne la tait pas. Un adaptateur qui
// n'a pas lu sa source (en erreur, ou sa source absente : Docker pas encore démarré) ne dit rien de ce qu'elle contient :
// ses fiches de l'inventaire précédent sont gardées, sans faux retrait, et ce qu'il passe aux suivants est refait depuis
// elles (`amorcer`). Une source vraiment retirée garde ainsi ses dernières fiches, et se dit absente à chaque inventaire.
// Un seul inventaire à la fois (`prendreVerrou`) : celui qui en trouve un autre en cours passe son tour (`passe`).
import path from 'node:path';
import depotsGit, { amorcer as amorcerDepots } from './depots-git.js';
import claudeCode from './claude-code.js';
import arbre from './arbre.js';
import docker from './docker.js';
import claudeDesktop from './claude-desktop.js';
import { SourceAbsente } from './source.js';
import { ulid } from '../ulid.js';
import { comptesDuSite, comptesNonLus, profilDuSite } from '../config.js';
import { prendreVerrou, tourPasse } from '../commun.js';

export const ADAPTATEURS = { 'depots-git': depotsGit, 'claude-code': claudeCode, arbre, docker, 'claude-desktop': claudeDesktop };
// Ce qu'un adaptateur passe aux suivants, refait depuis ses fiches gardées quand il est en erreur.
const AMORCES = { 'depots-git': amorcerDepots };

export async function inventorier(config, { catalogue, journal }) {
  const verrou = prendreVerrou(path.join(config.donnees, 'inventaire.verrou'));
  if (verrou.pris) return { passe: tourPasse('inventaire', verrou.pris) };
  try { return await inventaire(config, { catalogue, journal }); } finally { verrou.liberer(); }
}

async function inventaire(config, { catalogue, journal }) {
  // L'instantané est daté du début de l'inventaire : un fichier modifié pendant qu'il tourne, après sa lecture, est plus
  // récent que le catalogue, et une lecture qui compare les dates le relit (`arbreFrais`).
  const debut = new Date().toISOString();
  // Usage des serveurs MCP, tiré des appels au journal : les adaptateurs le portent sur les fiches des connecteurs.
  const appelsMcp = new Map();
  for (const e of journal.lire()) {
    if (e.kind !== 'tool.called' || !e.data?.serveur) continue;
    const u = appelsMcp.get(e.data.serveur) || { count: 0, last_used: null };
    u.count++; if (!u.last_used || e.at > u.last_used) u.last_used = e.at;
    appelsMcp.set(e.data.serveur, u);
  }
  const cc = config.inventaire['claude-code'];
  const comptes = comptesDuSite(config);
  const ctx = { site: config.site, depots: [], projets: [], projetDe: () => null, appelsMcp, comptes, profil: profilDuSite(config) };
  const fiches = []; const erreurs = []; const absentes = [];
  const precedentes = catalogue.lire({ site: config.site });
  // Un compte Claude Code présent sur le poste mais non lu rend l'inventaire et l'import incomplets, sans erreur : le dire.
  const nonLus = cc && cc.actif !== false ? comptesNonLus(comptes) : [];
  for (const [nom, adaptateur] of Object.entries(ADAPTATEURS)) {
    const opts = config.inventaire[nom];
    if (!opts || opts.actif === false) continue;
    try { fiches.push(...await adaptateur(opts, ctx)); } catch (e) {
      const gardees = precedentes.filter((f) => f.provenance?.source === `inventaire:${nom}`);
      fiches.push(...gardees); AMORCES[nom]?.(ctx, gardees);
      (e instanceof SourceAbsente ? absentes : erreurs).push(`${nom} : ${e.message}${gardees.length ? ` ; ${gardees.length} fiche(s) de l’inventaire précédent gardée(s)` : ''}`);
    }
  }
  const r = catalogue.remplacer(fiches, { at: debut });
  erreurs.push(...r.doublons.map((x) => `catalogue : fiche en double écartée, ${x.id} (gardée : ${x.garde ?? 'sans emplacement'} ; écartée : ${x.ecarte ?? 'sans emplacement'})`));
  const maintenant = Date.now(); const at = new Date(maintenant).toISOString();
  const ev = (kind, subject) => ({ id: ulid(maintenant), at, kind, actor: 'system:inventaire', subject, data: {}, classification: 'internal' });
  // Un retrait porte le nom et l'emplacement de la fiche retirée (contrat événement 0.11.0) : le catalogue ne la garde
  // pas, et le nom d'un projet retiré ne peut venir que de là (affichage seulement).
  const avant = new Map(precedentes.map((f) => [f.id, f]));
  const retrait = (id) => { const f = avant.get(id); return f ? { name: f.name, ...(f.location && { location: f.location }) } : {}; };
  journal.ajouter([
    ...r.apparues.map((s) => ev('element.created', s)),
    ...r.disparues.map((s) => ({ ...ev('element.retired', s), data: retrait(s) })),
    ...r.deplacees.map((d) => ({ ...ev('element.moved', d.id), data: { de: d.de, vers: d.vers } })),
    { ...ev('inventory.finished', null), data: { fiches: r.fiches, apparues: r.apparues.length, disparues: r.disparues.length, deplacees: r.deplacees.length, refusees: r.refusees.length, erreurs, absentes, comptes: comptes.map((c) => c.nom).filter(Boolean), comptes_non_lus: nonLus } },
  ]);
  return { ...r, erreurs, absentes, comptes_non_lus: nonLus };
}
