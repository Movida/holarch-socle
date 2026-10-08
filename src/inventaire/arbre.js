// Adaptateur d'inventaire de l'arbre HOLARCH : chaque nœud (fichier Markdown à en-tête sous arbre/) devient une fiche
// `node`, avec son type, son statut et ses liens. Dépôts lus : ceux de la configuration, plus tout dépôt connu qui porte
// un arbre (contrat nœud §1 : `arbre/index.md`, sinon l'`index.md` d'un bundle OKF à la racine ; d'un bundle, seule la
// racine est lue, ses documents suivent leur propre vocabulaire). Un nœud appartient au projet de son dépôt : son
// identifiant se fonde sur celui du projet (deux clones de même nom ne se confondent plus) et il porte le lien `project`
// (décision rattachement-projet). Pour la vue Projets : une spécification d'étape porte les entrées de sa section
// « Avancement », la racine porte les questions ouvertes de `arbre/questions.md` et les idées de `arbre/idees.md`. Les
// règles d'un nœud (contrat règle) deviennent des fiches `rule` (décision arbre-des-regles).
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
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

// Boîte à idées : lignes `| In | idée | source | phase visée | gain attendu | statut |`.
export function idees(texte) {
  return texte.split(/\r?\n/).filter((l) => /^\|\s*I\d+\s*\|/.test(l)).map((l) => {
    const c = l.split('|').slice(1, -1).map((x) => x.trim());
    return { id: c[0], idee: net(c[1] || '', 240), source: c[2] || null, phase: c[3] || null, gain: net(c[4] || '', 160) || null, statut: c[5] || null };
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

/** Racine de l'arbre d'un dépôt (contrat nœud §1) : `arbre/index.md`, sinon l'`index.md` d'un bundle OKF à la racine. */
export function racineArbre(depot) {
  const a = path.join(depot, 'arbre', 'index.md');
  if (fs.existsSync(a)) return { fichier: a, dossier: path.dirname(a), okf: false };
  const o = path.join(depot, 'index.md');
  return fs.existsSync(o) && enTete(o).okf_version != null ? { fichier: o, dossier: depot, okf: true } : null;
}

/** L'arbre d'un dépôt a-t-il changé après `ms` (fichier modifié, ajouté ou retiré) ? Dates seules, rien n'est parsé. */
export function arbreModifieDepuis(depot, ms) {
  const racine = racineArbre(depot);
  if (!racine) return false;
  const recent = (p) => { try { return fs.statSync(p).mtimeMs > ms; } catch { return true; } };
  const parcourir = (d) => {
    if (recent(d)) return true;
    try { return fs.readdirSync(d, { withFileTypes: true }).some((e) => (e.isDirectory() ? parcourir(path.join(d, e.name)) : recent(path.join(d, e.name)))); } catch { return true; }
  };
  return racine.okf ? recent(racine.fichier) : parcourir(racine.dossier);
}

// Règles d'un nœud (contrat règle §1) : celles de son en-tête (`rules:`) et, pour l'`index.md` d'un dossier, celles du
// `rules.yaml` de ce dossier. Un fichier illisible ne fait pas échouer l'inventaire : il est signalé sur le nœud.
function reglesDe(f, h) {
  const r = (Array.isArray(h.rules) ? h.rules : []).map((x) => ({ x, fichier: f }));
  const y = path.join(path.dirname(f), 'rules.yaml');
  if (path.basename(f) !== 'index.md' || !fs.existsSync(y)) return { regles: r, erreur: null };
  try {
    const l = YAML.parse(lire(y));
    if (l != null && !Array.isArray(l)) return { regles: r, erreur: 'rules.yaml : une liste de règles est attendue' };
    return { regles: [...r, ...(l || []).map((x) => ({ x, fichier: y }))], erreur: null };
  } catch (e) { return { regles: r, erreur: `rules.yaml illisible : ${e.message.split('\n')[0]}` }; }
}

const statutFiche = (s) => (s === 'deprecated' ? 'retired' : s === 'stable' ? 'active' : 'proposed');

export default function inventaireArbre(options, ctx) {
  const depots = new Set(options.depots || []);
  for (const d of ctx.depots || []) if (racineArbre(d)) depots.add(d);
  const out = [];
  for (const depot of depots) {
    const racine = racineArbre(depot);
    if (!racine) continue;
    // Dépôt configuré hors des racines inventoriées : pas de projet connu, l'identifiant garde le nom du dossier.
    const projet = ctx.projetDe?.(depot);
    const cle = projet ? projet.id.slice('holarch:project:'.length) : path.basename(depot);
    // Identité de l'arbre (liens entre arbres, identifiants des règles) : l'`id` de sa racine, sinon celle du projet.
    const arbre = String(enTete(racine.fichier).id || cle);
    for (const f of racine.okf ? [racine.fichier] : noeuds(racine.dossier, racine.dossier, [])) {
      const h = enTete(f);
      const estRacine = f === racine.fichier;
      if (!h.type && !estRacine) continue;
      const rel = '/' + path.relative(depot, f);
      const etape = rel.match(/^\/arbre\/conception\/etape-(\d+)-[^/]*\.md$/);
      const suivi = etape ? { etape: +etape[1], avancement: avancement(lire(f)) }
        : rel === '/arbre/index.md' ? { questions_ouvertes: questionsOuvertes(lire(path.join(racine.dossier, 'questions.md'))),
          idees: idees(lire(path.join(racine.dossier, 'idees.md'))) } : {};
      const { regles, erreur } = reglesDe(f, h);
      const noeud = {
        id: `holarch:node:${slug(cle + rel)}`, kind: 'node', name: h.title || path.basename(f, '.md'),
        description: h.description || null, version: h.version || null, node: rel,
        status: statutFiche(h.status), provenance: { source: 'inventaire:arbre' }, classification: h.classification || 'internal', location: f,
        links: { ...(h.links || {}), ...(projet && { project: [projet.id] }) },
        attributes: { type: h.type || null, statut: h.status || null, approuve: h.approved || null, revue: h.review || null, arbre, ...(estRacine && { racine: true }),
          ...(h.id && { id: String(h.id) }), ...(h.types && { types: [].concat(h.types).map(String) }), ...(h.projects && { projects: [].concat(h.projects).map(String) }),
          ...(h.derogations && { derogations: h.derogations }), ...(h.config && typeof h.config === 'object' && { config: h.config }), ...(regles.length && { regles: regles.length }), ...(erreur && { erreur_regles: erreur }), ...suivi },
      };
      out.push(noeud);
      // Une règle se désigne par son arbre, son nœud (rien pour la racine, l'`id` du nœud s'il en a un) et son `id`.
      const place = estRacine ? '' : `${h.id || rel.replace(/^\/arbre\//, '').replace(/(\/index)?\.md$/, '')}/`;
      for (const { x: r, fichier } of regles) {
        if (!r || !r.id || !r.statement) continue;
        out.push({
          id: `holarch:rule:${slug(`${arbre}/${place}${r.id}`)}`, kind: 'rule', name: String(r.id), description: premiereLigne(r.statement, 300),
          node: rel, status: statutFiche(r.status), provenance: { source: 'inventaire:arbre' }, classification: noeud.classification, location: fichier,
          links: { ...(projet && { project: [projet.id] }) },
          attributes: { arbre, noeud_id: noeud.id, porteur: h.type || null, enonce: String(r.statement).trim(), pourquoi: r.why ? String(r.why).trim() : null,
            niveau: r.level || 'reminder', declencheur: r.trigger || null, match: r.match || null, derogeable: r.derogable !== false, applique_a: r.applies_to || null,
            statut: r.status || 'draft', approuve: r.approved || null, source: r.source || null, revue_le: r.review_after || null, remplace: r.replaces || null,
            controles: r.check ? [].concat(r.check).map(String) : null, ...(r.harvest && { recolte: r.harvest }), ...(r.deprecated && { retrait: r.deprecated }) },
        });
      }
    }
  }
  return out;
}
