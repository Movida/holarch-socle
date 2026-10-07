// Règle effective (décision arbre-des-regles, contrat règle) : pour un projet, l'ensemble calculé de ses règles, chacune
// avec sa provenance. Couches, de la plus générale à la plus spécifique : le profil (racine de l'arbre qui déclare le
// projet dans un contexte), les nœuds qui mènent de cette racine au contexte, les types du projet dans l'ordre déclaré
// (un type cité plus loin l'emporte), puis la racine de l'arbre du projet. Lecture pure, sur les fiches du catalogue.
const ORDRE = ['profil', 'contexte', 'type', 'projet'];
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'sensitive'];

/** Structure des arbres connus, tirée des fiches `node` et `rule`. */
export function arbresDe(fiches) {
  const noeuds = fiches.filter((f) => f.kind === 'node');
  const regles = new Map();
  for (const r of fiches.filter((f) => f.kind === 'rule')) {
    const k = r.attributes?.noeud_id; if (!regles.has(k)) regles.set(k, []); regles.get(k).push(r);
  }
  const parChemin = new Map(noeuds.map((n) => [`${n.attributes?.arbre}:${n.node}`, n]));
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  const racines = noeuds.filter((n) => n.attributes?.racine);
  // Un lien `derives_from` (contrat nœud §3) : chemin dans le même arbre, `<id de l'arbre>:<chemin>` vers un autre, ou
  // identifiant du catalogue.
  const parent = (n) => {
    const l = String((n.links?.derives_from || [])[0] || '');
    if (!l) return null;
    const m = l.match(/^([a-z0-9][a-z0-9._-]*):(\/.*)$/i);
    return (m ? parChemin.get(`${m[1]}:${m[2]}`) : parId.get(l) || parChemin.get(`${n.attributes?.arbre}:${l}`)) || null;
  };
  const templates = new Map(noeuds.filter((n) => n.attributes?.type === 'template' && n.attributes?.id).map((n) => [n.attributes.id, n]));
  // Les profils : les arbres qui portent des contextes. Sur un site, on en attend un.
  const contextes = noeuds.filter((n) => n.attributes?.type === 'context');
  const profils = [...new Set(contextes.map((n) => n.attributes.arbre))].map((a) => racines.find((r) => r.attributes.arbre === a)).filter(Boolean);
  return { noeuds, regles, racines, parent, templates, contextes, profils };
}

// Les nœuds d'un nœud jusqu'à sa racine, racine d'abord.
function chaine(a, n) {
  const c = [];
  for (let x = n, i = 0; x && i < 50; x = a.parent(x), i++) c.unshift(x);
  return c;
}

// Fusion des couches : même `id`, le plus spécifique l'emporte, sauf règle non dérogeable plus haut.
function fusionner(couches, signaux) {
  const r = new Map();
  for (const { origine, noeud, regles } of couches) {
    for (const f of regles) {
      const a = f.attributes;
      const e = { id: f.name, fiche: f.id, enonce: a.enonce, pourquoi: a.pourquoi, niveau: a.niveau, statut: a.statut, derogeable: a.derogeable,
        applique_a: a.applique_a, match: a.match || null, controles: a.controles || null, remplace: a.remplace || null, classification: f.classification, origine, provenance: { arbre: a.arbre, noeud: noeud.node, titre: noeud.name, fichier: f.location, ...(origine === 'type' && { type_id: noeud.attributes.id }) }, recouvre: [] };
      const avant = r.get(e.id);
      if (avant && avant.derogeable === false) { signaux.push(`règle non dérogeable redéfinie : ${e.id} (${avant.provenance.arbre}:${avant.provenance.noeud}, redéfinie par ${e.provenance.arbre}:${e.provenance.noeud}) ; la première tient`); continue; }
      if (avant) e.recouvre = [...avant.recouvre, { ...avant.provenance, origine: avant.origine }];
      r.set(e.id, e);
    }
  }
  return [...r.values()];
}

// Les couches du profil et du contexte d'un nœud déclarant (contexte ou activité qui cite le projet).
function couchesDeclarant(a, declarant) {
  return chaine(a, declarant).map((n) => ({ origine: n.attributes.racine ? 'profil' : 'contexte', noeud: n, regles: a.regles.get(n.id) || [] }));
}

// Réglages (`config`) des couches, de la plus générale à la plus spécifique : un objet se fusionne clé à clé, une liste
// s'allonge (une exception posée par le projet s'ajoute à celles du profil), une valeur simple posée plus bas l'emporte.
export function fusionnerConfig(...couches) {
  const objet = (x) => x && typeof x === 'object' && !Array.isArray(x);
  const fusion = (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (objet(a) && objet(b)) { const r = { ...a }; for (const [k, v] of Object.entries(b)) r[k] = k in r ? fusion(r[k], v) : v; return r; }
    return b === undefined ? a : b;
  };
  return couches.filter(objet).reduce(fusion, {});
}

const applicable = (e) => e.statut === 'stable' && !e.derogee;
const taille = (l) => l.filter((e) => e.niveau === 'reminder').reduce((t, e) => t + e.enonce.length + (e.pourquoi?.length || 0), 0);
const tailleRappels = (l) => taille(l.filter(applicable));
// Ce que les règles proposées ajouteraient à chaque tour si elles étaient approuvées : à savoir avant d'approuver.
const tailleProposes = (l) => taille(l.filter((e) => e.statut === 'draft' && !e.derogee));

/**
 * Règle effective d'un projet : { regles, signaux, rappels } ; `rappels` compte les caractères chargés à chaque tour.
 * Seules les règles `stable` et non dérogées s'appliquent ; les autres restent visibles, avec la raison.
 */
export function regleEffective(fiches, projetId) {
  const a = arbresDe(fiches); const signaux = [];
  const racine = a.racines.find((n) => n.links?.project?.includes(projetId) && !a.profils.includes(n));
  const declarants = a.noeuds.filter((n) => n.attributes?.projects?.includes(projetId));
  if (declarants.length > 1) signaux.push(`projet déclaré par plusieurs contextes : ${declarants.map((n) => `${n.attributes.arbre}:${n.node}`).join(', ')} ; le premier compte`);
  if (!declarants.length) signaux.push(a.profils.length ? 'aucun contexte ne déclare ce projet : seules les règles du profil s’appliquent' : 'aucun profil connu sur ce site');
  const couches = [];
  if (declarants[0]) couches.push(...couchesDeclarant(a, declarants[0]));
  else if (a.profils.length === 1) couches.push({ origine: 'profil', noeud: a.profils[0], regles: a.regles.get(a.profils[0].id) || [] });
  for (const t of racine?.attributes?.types || []) {
    const n = a.templates.get(t);
    if (!n) { signaux.push(`type inconnu : ${t} (aucun nœud template ne porte cet id)`); continue; }
    couches.push({ origine: 'type', noeud: n, regles: a.regles.get(n.id) || [] });
  }
  if (racine) couches.push({ origine: 'projet', noeud: racine, regles: a.regles.get(racine.id) || [] });
  const regles = fusionner(couches, signaux);
  const config = fusionnerConfig(...couches.map((c) => c.noeud.attributes?.config));
  for (const d of racine?.attributes?.derogations || []) {
    const e = regles.find((x) => x.id === d?.rule);
    if (!e) { signaux.push(`dérogation à une règle absente : ${d?.rule}`); continue; }
    if (e.derogeable === false) { signaux.push(`dérogation refusée : ${e.id} n’est pas dérogeable`); continue; }
    e.derogee = { pourquoi: d.why ?? null, par: d.by ?? null, le: d.at ?? null };
  }
  for (const n of [racine, ...couches.map((c) => c.noeud)].filter(Boolean)) if (n.attributes?.erreur_regles) signaux.push(`${n.attributes.arbre}:${n.node} : ${n.attributes.erreur_regles}`);
  regles.sort((x, y) => ORDRE.indexOf(x.origine) - ORDRE.indexOf(y.origine) || x.id.localeCompare(y.id));
  return { projet: projetId, arbre: racine ? { id: racine.attributes.arbre, racine: racine.id, types: racine.attributes.types || [], classification: racine.classification } : null,
    regles: regles.map((e) => ({ ...e, applicable: applicable(e) })), config, signaux: [...new Set(signaux)], rappels: tailleRappels(regles), rappels_proposes: tailleProposes(regles) };
}

/**
 * Ce qui vaut pour tous les projets du site, à la portée du compte : la racine du profil et, s'il n'y a qu'un contexte,
 * les nœuds jusqu'à lui. Plusieurs profils, ou plusieurs contextes : seules les règles qui ne dépendent d'aucun choix.
 */
export function regleDuCompte(fiches) {
  const a = arbresDe(fiches); const signaux = [];
  if (!a.profils.length) return { regles: [], signaux: ['aucun profil connu sur ce site (un arbre qui porte des nœuds context)'], rappels: 0, rappels_proposes: 0 };
  if (a.profils.length > 1) return { regles: [], signaux: [`plusieurs profils sur ce site : ${a.profils.map((p) => p.attributes.arbre).join(', ')} ; rien n’est posé au compte`], rappels: 0, rappels_proposes: 0 };
  const ctx = a.contextes.filter((n) => n.attributes.arbre === a.profils[0].attributes.arbre);
  if (ctx.length > 1) signaux.push(`plusieurs contextes dans le profil : leurs règles propres ne vont pas au compte (portée locale par projet : à venir)`);
  const couches = ctx.length === 1 ? couchesDeclarant(a, ctx[0]) : [{ origine: 'profil', noeud: a.profils[0], regles: a.regles.get(a.profils[0].id) || [] }];
  const regles = fusionner(couches, signaux);
  const config = fusionnerConfig(...couches.map((c) => c.noeud.attributes?.config));
  return { regles: regles.map((e) => ({ ...e, applicable: applicable(e) })), config, signaux, rappels: tailleRappels(regles), rappels_proposes: tailleProposes(regles) };
}

/** Les projets qu'un contexte (ou une activité) déclare. */
export const projetsDeclares = (fiches) => new Set(fiches.filter((f) => f.kind === 'node').flatMap((n) => n.attributes?.projects || []));
