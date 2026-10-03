// Adaptateur d'inventaire des dépôts Git sous des racines configurées : un projet par dépôt, avec ses remotes (sans
// identifiants), sa branche, son dernier commit et le nombre de fichiers modifiés.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, liste, slug, urlSure } from './outils.js';

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

export default function inventaireDepots(options, ctx) {
  const depots = trouverDepots(options);
  ctx.depots = depots;
  return depots.map((d) => {
    const remotes = (git(d, ['remote', '-v']) || '').split('\n').filter((l) => l.endsWith('(fetch)'))
      .map((l) => { const [nom, url] = l.split(/\s+/); return { nom, url: urlSure(url) }; });
    const dernier = git(d, ['log', '-1', '--format=%cI%x09%s']);
    const [date, sujet] = dernier ? dernier.split('\t') : [null, null];
    const modifies = (git(d, ['status', '--porcelain']) || '').split('\n').filter(Boolean).length;
    return {
      id: `holarch:project:${slug(d)}`, kind: 'project', name: path.basename(d),
      description: sujet ? `dernier commit : ${sujet.slice(0, 120)}` : null, status: 'active',
      provenance: { source: 'inventaire:depots-git' }, classification: 'internal', site: ctx.site, location: d,
      usage: { count: 0, last_used: date || null, cost_usd: null },
      attributes: { branche: git(d, ['rev-parse', '--abbrev-ref', 'HEAD']), remotes, fichiers_modifies: modifies, dernier_commit: date },
    };
  });
}
