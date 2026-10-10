// Adaptateur d'inventaire des dépôts Git sous des racines configurées : un projet par dépôt, avec ses remotes (sans
// identifiants), sa branche, son dernier commit, le nombre de fichiers modifiés, son écart à la branche amont et son
// intégration continue.
// N'interroge jamais le réseau : le retard sur l'amont est celui du dernier `fetch`, dont la date est gardée.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gitInventaire, liste, mtimeIso, slug, urlSure } from './outils.js';
import { projetsDe, localiserProjet } from '../projets.js';

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
  return [...trouves].sort();
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

function identifiants(depots) {
  const r = depots.map((d) => ({ d, racine: racine(d) }));
  const n = {}; for (const x of r) if (x.racine) n[x.racine] = (n[x.racine] || 0) + 1;
  return new Map(r.map((x) => [x.d, `holarch:project:${!x.racine ? slug(x.d) : n[x.racine] > 1 ? `${x.racine}:${slug(x.d)}` : x.racine}`]));
}

export default function inventaireDepots(options, ctx) {
  const depots = trouverDepots(options);
  ctx.depots = depots;
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
  // Les adaptateurs suivants rattachent leurs éléments à ces projets (lien `project`).
  ctx.projets = projetsDe(fiches);
  ctx.projetDe = localiserProjet(ctx.projets);
  return fiches;
}
