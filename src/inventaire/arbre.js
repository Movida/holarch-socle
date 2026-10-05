// Adaptateur d'inventaire de l'arbre HOLARCH : chaque nœud (fichier Markdown à en-tête sous arbre/) devient une fiche
// `node`, avec son type, son statut et ses liens. Dépôts lus : ceux de la configuration, plus tout dépôt connu qui porte
// un `arbre/index.md`. Pour la vue Projets : une spécification d'étape porte les entrées de sa section « Avancement »,
// la racine porte les questions ouvertes de `arbre/questions.md`.
import fs from 'node:fs';
import path from 'node:path';
import { enTete, premiereLigne, slug } from './outils.js';

const lire = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const net = (t, n) => premiereLigne(String(t).replace(/\*\*/g, ''), n);

// Section « Avancement » d'une spécification : `- **Étiquette (date)** : texte`, suite et sous-points compris.
export function avancement(texte) {
  const section = texte.split(/\r?\n## Avancement[ \t]*\r?\n/)[1]?.split(/\r?\n## /)[0];
  if (!section) return null;
  const entrees = [];
  for (const ligne of section.split(/\r?\n/)) {
    const e = ligne.match(/^- \*\*([^*]+?)\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s*\*\*\s*:?\s*(.*)$/);
    if (e) { entrees.push({ etiquette: e[1].trim(), date: e[2] || null, texte: e[3], sous: [] }); continue; }
    const der = entrees.at(-1);
    if (!der || !ligne.trim()) continue;
    const s = ligne.match(/^\s+(?:\d+\.|-)\s+(.*)$/);
    if (s) der.sous.push(s[1]);
    else if (der.sous.length) der.sous[der.sous.length - 1] += ` ${ligne.trim()}`;
    else der.texte += ` ${ligne.trim()}`;
  }
  return entrees.map((x) => ({ ...x, texte: net(x.texte, 300), sous: x.sous.map((t) => net(t, 200)) }));
}

// Questions ouvertes : lignes `| Qn | nœud | question | niveau |` avant la section « Résolues ».
export function questionsOuvertes(texte) {
  return texte.split(/\r?\n## /)[0].split(/\r?\n/).filter((l) => /^\|\s*Q\d+\s*\|/.test(l)).map((l) => {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    return { id: c[0], noeud: (c[1] || '').replace(/`/g, '') || null, question: net(c[2] || '', 240), niveau: c[3] || null };
  });
}

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
      const etape = rel.match(/^\/arbre\/conception\/etape-(\d+)-[^/]*\.md$/);
      const suivi = etape ? { etape: +etape[1], avancement: avancement(lire(f)) }
        : rel === '/arbre/index.md' ? { questions_ouvertes: questionsOuvertes(lire(path.join(racine, 'questions.md'))) } : {};
      out.push({
        id: `holarch:node:${slug(nomDepot + rel)}`, kind: 'node', name: h.title || path.basename(f, '.md'),
        description: h.description || null, version: h.version || null, node: rel,
        status: h.status === 'deprecated' ? 'retired' : h.status === 'stable' ? 'active' : 'proposed',
        provenance: { source: 'inventaire:arbre' }, classification: h.classification || 'internal', location: f,
        links: h.links || {}, attributes: { depot: nomDepot, type: h.type, statut: h.status || null, approuve: h.approved || null, revue: h.review || null, ...suivi },
      });
    }
  }
  return out;
}
