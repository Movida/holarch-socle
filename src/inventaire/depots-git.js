// Adaptateur d'inventaire des dépôts Git sous des racines configurées : un projet par dépôt, avec ses remotes (sans
// identifiants), sa branche, son dernier commit, le nombre de fichiers modifiés, son écart à la branche amont et son
// intégration continue.
// N'interroge jamais le réseau : le retard sur l'amont est celui du dernier `fetch`, dont la date est gardée.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitInventaire, liste, mtimeIso, slug, urlSure } from './outils.js';
import { projetsDe, localiserProjet } from '../projets.js';
import { lireSansLien } from '../commun.js';

function chercher(racine, profondeur, ignorer, trouves) {
  if (profondeur < 0 || !fs.existsSync(racine)) return;
  if (fs.existsSync(path.join(racine, '.git'))) { trouves.add(racine); return; }
  for (const d of liste(racine, (x) => x.isDirectory() && !x.name.startsWith('.') && !ignorer.includes(x.name))) {
    chercher(path.join(racine, d.name), profondeur - 1, ignorer, trouves);
  }
}

export function trouverDepots({ racines = [], profondeur = 3, ignorer = [] }) {
  const trouves = new Set();
  // `~` non cité en YAML vaut null : on le comprend comme le répertoire personnel plutôt que de l'ignorer en silence.
  for (const r of racines) chercher(r === null || r === '~' ? os.homedir() : r, profondeur, ignorer, trouves);
  // Un worktree lié dont le worktree principal est trouvé aussi n'est pas un dépôt de plus : pris pour un projet, il
  // partageait le premier commit du principal, dont l'identifiant prenait un suffixe. Il se rattache au principal
  // (`projetDuDepot`). Sans principal trouvé (dépôt nu, ou hors des racines), il reste le seul à porter le dépôt.
  return [...trouves].filter((d) => !trouves.has(principalDe(d))).sort();
}

// Le worktree principal d'un worktree lié, lu dans son fichier `.git` (`gitdir: <principal>/.git/worktrees/<nom>`, chemin
// absolu ou relatif au worktree), sans suivre de lien ni attendre sur un FIFO ; null pour un dépôt (`.git` dossier), un
// sous-module ou un worktree de dépôt nu.
function principalDe(d) {
  let t; try { t = lireSansLien(d, '.git', { max: 4096 }); } catch { return null; }
  const m = t?.match(/^gitdir: (.+?)[\\/]\.git[\\/]worktrees[\\/][^\\/\n]+?[\\/]?[ \t\r]*$/m);
  return m ? path.resolve(d, m[1]) : null;
}

// Identité d'un dépôt : son premier commit (le plus ancien s'il y a plusieurs racines), qui ne change ni avec le
// chemin ni avec le remote. Sans commit, le chemin. Deux clones du même dépôt sur un site se départagent par leur chemin.
export function racine(d) {
  // Dates comparées en nombres : en texte, une date d'avant le 2001-09-09 (9 chiffres) passerait après les autres.
  const r = (gitInventaire(d, ['log', '--max-parents=0', '--format=%ct %H', 'HEAD']) || '').split('\n').filter(Boolean)
    .map((l) => l.split(' ')).sort(([t, h], [u, k]) => Number(t) - Number(u) || h.localeCompare(k));
  return r.length ? r[0][1].slice(0, 12) : null;
}

// État de travail d'un dépôt : fichiers modifiés ou non suivis, écart à la branche amont (« retard avance » ; sans
// branche amont, rien : la branche n'a jamais été poussée). Lu par l'inventaire et, en direct, par le résumé de reprise.
export function etatDepot(d) {
  const fichiers_modifies = (gitInventaire(d, ['status', '--porcelain']) || '').split('\n').filter(Boolean).length;
  const amont = gitInventaire(d, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  const [retard, avance] = amont ? (gitInventaire(d, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']) || '').split(/\s+/).map(Number) : [];
  return { fichiers_modifies, amont: amont || null, en_avance: Number.isFinite(avance) ? avance : null, en_retard: Number.isFinite(retard) ? retard : null };
}

// Intégration continue déclarée dans le dépôt : la configuration présente, pas la preuve qu'elle tourne (une
// configuration peut être désactivée chez l'hébergeur). Liste vide : aucune, rien à lire après un envoi.
export function integrationContinue(d) {
  const s = [];
  if (liste(path.join(d, '.github', 'workflows'), (x) => x.isFile() && /\.ya?ml$/.test(x.name)).length) s.push('GitHub Actions');
  if (fs.existsSync(path.join(d, '.gitlab-ci.yml'))) s.push('GitLab CI');
  return s;
}

const PREFIXE = 'holarch:project:';
function identifiants(depots) {
  const r = depots.map((d) => ({ d, racine: racine(d) }));
  const n = {}; for (const x of r) if (x.racine) n[x.racine] = (n[x.racine] || 0) + 1;
  return new Map(r.map((x) => [x.d, `${PREFIXE}${!x.racine ? slug(x.d) : n[x.racine] > 1 ? `${x.racine}:${slug(x.d)}` : x.racine}`]));
}

/** L'identifiant `id` est-il tiré du premier commit `r` (`identifiants`) : lui seul, ou suivi du chemin d'un des clones ? */
export const tireDuCommit = (id, r) => id === `${PREFIXE}${r}` || String(id).startsWith(`${PREFIXE}${r}:`);

/**
 * Le projet d'un dépôt pour une décision immédiate (garde avant commit), quand le catalogue date d'avant un déplacement
 * ou ne connaît pas ce worktree : par son chemin (`localiserProjet`) ; sinon par son worktree principal, le premier que
 * liste git ; sinon par son premier commit, s'il ne désigne qu'un projet (deux clones du même dépôt ne se départagent
 * que par leur chemin). null s'il reste inconnu. `projets` : ceux de `projetsDe`.
 */
export function projetDuDepot(projets, depot) {
  const lieu = localiserProjet(projets);
  const principal = () => lieu((gitInventaire(depot, ['worktree', 'list', '--porcelain', '-z']) || '').split('\0')[0].replace(/^worktree /, ''));
  const parCommit = () => { const r = racine(depot); const memes = projets.filter((p) => tireDuCommit(p.id, r)); return memes.length === 1 ? memes[0] : null; };
  return lieu(depot) || principal() || parCommit();
}

// Ce que les adaptateurs suivants reçoivent des dépôts pour y rattacher leurs éléments (lien `project`) : leurs chemins et
// leurs projets. Posé par l'adaptateur ; s'il est en erreur, par l'inventaire, depuis les fiches qu'il garde de lui.
export function amorcer(ctx, fiches) {
  ctx.depots = fiches.filter((f) => f.kind === 'project' && f.location).map((f) => f.location);
  ctx.projets = projetsDe(fiches);
  ctx.projetDe = localiserProjet(ctx.projets);
}

export default function inventaireDepots(options, ctx) {
  const depots = trouverDepots(options);
  const ids = identifiants(depots);
  const fiches = depots.map((d) => {
    const remotes = (gitInventaire(d, ['remote', '-v']) || '').split('\n').filter((l) => l.endsWith('(fetch)'))
      .map((l) => { const [nom, url] = l.split(/\s+/); return { nom, url: urlSure(url) }; });
    const dernier = gitInventaire(d, ['log', '-1', '--format=%cI%x09%s']);
    const [date, sujet] = dernier ? dernier.split('\t') : [null, null];
    const commun = gitInventaire(d, ['rev-parse', '--git-common-dir']);
    return {
      id: ids.get(d), kind: 'project', name: path.basename(d),
      description: sujet ? `dernier commit : ${sujet.slice(0, 120)}` : null, status: 'active',
      provenance: { source: 'inventaire:depots-git' }, classification: 'internal', site: ctx.site, location: d,
      usage: { count: 0, last_used: date || null, cost_usd: null },
      attributes: { branche: gitInventaire(d, ['rev-parse', '--abbrev-ref', 'HEAD']), remotes, ...etatDepot(d), integration_continue: integrationContinue(d), dernier_commit: date,
        dernier_sujet: sujet ? sujet.slice(0, 160) : null, dernier_fetch: commun ? mtimeIso(path.join(path.resolve(d, commun), 'FETCH_HEAD')) : null },
    };
  });
  amorcer(ctx, fiches);
  return fiches;
}
