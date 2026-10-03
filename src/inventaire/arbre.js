// Adaptateur d'inventaire de l'arbre HOLARCH : chaque nœud (fichier Markdown à en-tête sous arbre/) devient une fiche
// `node`, avec son type, son statut et ses liens. Dépôts lus : ceux de la configuration, plus tout dépôt connu qui porte
// un `arbre/index.md`.
import fs from 'node:fs';
import path from 'node:path';
import { enTete, slug } from './outils.js';

function noeuds(dossier, base, out) {
  for (const d of fs.readdirSync(dossier, { withFileTypes: true })) {
    const p = path.join(dossier, d.name);
    if (d.isDirectory()) noeuds(p, base, out);
    else if (d.name.endsWith('.md')) out.push(p);
  }
  return out;
}

export default function inventaireArbre(options, ctx) {
  const depots = new Set(options.depots || []);
  for (const d of ctx.depots || []) if (fs.existsSync(path.join(d, 'arbre', 'index.md'))) depots.add(d);
  const out = [];
  for (const depot of depots) {
    const racine = path.join(depot, 'arbre');
    if (!fs.existsSync(racine)) continue;
    const nomDepot = path.basename(depot);
    for (const f of noeuds(racine, racine, [])) {
      const h = enTete(f);
      if (!h.type) continue;
      const rel = '/' + path.relative(depot, f);
      out.push({
        id: `holarch:node:${slug(nomDepot + rel)}`, kind: 'node', name: h.title || path.basename(f, '.md'),
        description: h.description || null, version: h.version || null, node: rel,
        status: h.status === 'deprecated' ? 'retired' : h.status === 'stable' ? 'active' : 'proposed',
        provenance: { source: 'inventaire:arbre' }, classification: h.classification || 'internal', location: f,
        links: h.links || {}, attributes: { depot: nomDepot, type: h.type, statut: h.status || null, approuve: h.approved || null, revue: h.review || null },
      });
    }
  }
  return out;
}
