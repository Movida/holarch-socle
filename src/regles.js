// Règle effective (décision arbre-des-regles, contrat règle) : pour un projet, l'ensemble calculé de ses règles, chacune
// avec sa provenance. Couches, de la plus générale à la plus spécifique : le profil (racine de l'arbre qui déclare le
// projet dans un contexte), les nœuds qui mènent de cette racine au contexte, les types du projet dans l'ordre déclaré
// (un type cité plus loin l'emporte), puis la racine de l'arbre du projet. Lecture pure, sur les fiches du catalogue.
import path from 'node:path';
import { dedans } from './commun.js';

const ORDRE = ['profil', 'contexte', 'type', 'projet'];
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'sensitive'];
// Un nœud désigné comme le fait un lien vers un autre arbre (contrat nœud §3) : `<id de l'arbre>:<chemin>`.
export const designation = (n) => `${n?.attributes?.arbre}:${n?.node}`;

/** Structure des arbres connus, tirée des fiches `node` et `rule`. */
export function arbresDe(fiches) {
  const noeuds = fiches.filter((f) => f.kind === 'node');
  const regles = new Map();
  for (const r of fiches.filter((f) => f.kind === 'rule')) {
    const k = r.attributes?.noeud_id; if (!regles.has(k)) regles.set(k, []); regles.get(k).push(r);
  }
  const parChemin = new Map(noeuds.map((n) => [`${designation(n)}`, n]));
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
      // Un brouillon (une redite récoltée, par exemple) ne retire pas une règle approuvée, ni son crochet ni son audit :
      // l'approuvée tient, le brouillon reste visible à côté d'elle jusqu'à son approbation.
      if (avant?.statut === 'stable' && e.statut !== 'stable') {
        signaux.push(`brouillon sur une règle approuvée : ${e.id} (${e.provenance.arbre}:${e.provenance.noeud}) ; l’approuvée tient jusqu’à approbation`);
        avant.proposee = { enonce: e.enonce, pourquoi: e.pourquoi, statut: e.statut, fiche: e.fiche, provenance: e.provenance }; continue;
      }
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

// Portée d'un réglage qui ne se lit pas partout (décision exceptions-hors-du-depot) : les couches qui peuvent le porter,
// et s'il se lit hors du dépôt contrôlé. `montage_sensible` fait taire un écart du conteneur : il ne se lit pas dans
// les fichiers que ce conteneur écrit (types et racine du projet), ni dans le dépôt contrôlé s'il est celui du profil.
// Une clé absente de cette table se lit à toutes les couches.
// Une `Map` : une clé écrite dans l'arbre (`constructor`, `toString`…) ne se confond pas avec une propriété d'objet.
const PORTEE = new Map([['montage_sensible', { couches: ['profil', 'contexte'], horsDepot: true }]]);

// Les réglages d'une couche dans leur portée (`config`) ; une clé posée hors de sa portée n'est pas lue (`ecartee`), et
// se dit.
function dansPortee(c, signaux) {
  const config = c.noeud.attributes?.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { config: config ?? null, ecartee: null };
  const hors = Object.keys(config).filter((k) => PORTEE.has(k) && !PORTEE.get(k).couches.includes(c.origine));
  for (const k of hors) signaux.push(`${k} porté par ${designation(c.noeud)} (${c.origine}) : non lu, il se lit au ${PORTEE.get(k).couches.join(' et au ')} (décision exceptions-hors-du-depot)`);
  if (!hors.length) return { config, ecartee: null };
  const garde = (oui) => Object.fromEntries(Object.entries(config).filter(([k]) => hors.includes(k) === oui));
  return { config: garde(false), ecartee: garde(true) };
}

// Les couches telles que les lisent la configuration fusionnée et les contrôles : origine, nœud qui la porte
// (`provenance`, sa désignation) et son fichier, ses réglages dans leur portée, et ceux qui en sont écartés.
const couchesLues = (couches, signaux) => couches.map((c) => ({ origine: c.origine, provenance: designation(c.noeud), fichier: c.noeud.location ?? null,
  ...dansPortee(c, signaux) }));

/**
 * Les exceptions d'un réglage (`<cle>.exceptions`), lues d'une seule façon par tous les contrôles : couche par couche,
 * chacune avec sa raison et sa provenance. Sans sa valeur (`champ` : `terme`, `fichier`, `ecart`) ou sans raison, une
 * exception ne vaut pas. Une clé qui se lit hors du dépôt contrôlé (`PORTEE`) ignore les couches dont le fichier est
 * dans `depot`. { lues, ignorees } : celles qui ne valent pas, avec ce qui les écarte.
 */
export function lireExceptions(couches = [], cle, champ, { depot = null } = {}) {
  const texte = (x) => (x === null || x === undefined || typeof x === 'object' ? '' : String(x).trim());
  const dansDepot = (f) => Boolean(PORTEE.get(cle)?.horsDepot && depot && f) && dedans(path.resolve(f), path.resolve(depot));
  const lues = []; const ignorees = [];
  for (const c of couches) {
    const de = { origine: c.origine, provenance: c.provenance, fichier: c.fichier };
    const ecartee = [].concat(c.ecartee?.[cle]?.exceptions || []);
    for (const x of [].concat(c.config?.[cle]?.exceptions || []).concat(ecartee)) {
      const valeur = x && typeof x === 'object' ? texte(x[champ]) : ''; const pourquoi = x && typeof x === 'object' ? texte(x.pourquoi) : '';
      const raison = ecartee.includes(x) ? `porté par un ${c.origine}, il se lit au ${PORTEE.get(cle).couches.join(' et au ')}`
        : dansDepot(c.fichier) ? 'écrite dans le dépôt contrôlé' : !valeur ? `sans ${champ}` : !pourquoi ? 'sans raison' : null;
      (raison ? ignorees : lues).push({ valeur, ...(raison ? { raison } : { pourquoi }), ...de });
    }
  }
  return { lues, ignorees };
}
export const exceptions = (...a) => lireExceptions(...a).lues;

const applicable = (e) => e.statut === 'stable' && !e.derogee;
// Sources de règles illisibles (un `rules.yaml` ou un en-tête en cours d'édition, un conflit de fusion) : la règle
// effective est alors incomplète. Ce qui en décide (garde, matérialisation, audit) ne la dit pas conforme pour autant.
// Comptent les couches elles-mêmes, tout en-tête illisible de l'arbre du profil (ce pouvait être un contexte ou un nœud
// de sa chaîne) et, quand un type déclaré ou le contexte déclarant est introuvable, tout en-tête illisible qui pouvait
// être lui : d'après ce qui s'en lit ligne à ligne (`indices_entete`), un `template` de cet `id`, un `context`, ou un
// nœud dont le type ne se lit pas. Une décision illisible d'un projet sans rapport ne compte pas.
function illisibles(a, couches, { types = [], contexte = false } = {}) {
  const profil = new Set(couches.filter((c) => c.origine === 'profil' || c.origine === 'contexte').map((c) => c.noeud.attributes?.arbre));
  const pouvaitEtre = ({ type, id } = {}) => !type || (type === 'template' && types.length > 0 && (!id || types.includes(id))) || (type === 'context' && contexte);
  const enTetes = a.noeuds.filter((n) => n.attributes?.erreur_entete && (profil.has(n.attributes.arbre) || couches.some((c) => c.noeud === n)
    || ((types.length || contexte) && pouvaitEtre(n.attributes.indices_entete))));
  return [...new Set([...couches.map((c) => c.noeud).filter((n) => n?.attributes?.erreur_regles).map((n) => `${designation(n)} : ${n.attributes.erreur_regles}`),
    ...enTetes.map((n) => `${designation(n)} : ${n.attributes.erreur_entete}`)])];
}
/** Ce qui attend une approbation : une règle en brouillon, ou le brouillon posé sur une règle approuvée de même id. */
export const aApprouver = (e) => (e.statut === 'draft' || Boolean(e.proposee)) && !e.derogee;
const longueur = (e) => e.enonce.length + (e.pourquoi?.length || 0);
const taille = (l) => l.filter((e) => e.niveau === 'reminder').reduce((t, e) => t + longueur(e), 0);
const tailleRappels = (l) => taille(l.filter(applicable));
// Ce que les règles proposées ajouteraient à chaque tour si elles étaient approuvées : à savoir avant d'approuver.
const tailleProposes = (l) => taille(l.filter((e) => e.statut === 'draft' && !e.derogee))
  + l.filter((e) => e.proposee && !e.derogee && e.niveau === 'reminder').reduce((t, e) => t + longueur(e.proposee) - longueur(e), 0);

/**
 * Règle effective d'un projet : { regles, signaux, rappels } ; `rappels` compte les caractères chargés à chaque tour.
 * Seules les règles `stable` et non dérogées s'appliquent ; les autres restent visibles, avec la raison.
 */
export function regleEffective(fiches, projetId) {
  const a = arbresDe(fiches); const signaux = [];
  const racine = a.racines.find((n) => n.links?.project?.includes(projetId) && !a.profils.includes(n));
  const declarants = a.noeuds.filter((n) => n.attributes?.projects?.includes(projetId));
  if (declarants.length > 1) signaux.push(`projet déclaré par plusieurs contextes : ${declarants.map((n) => `${designation(n)}`).join(', ')} ; le premier compte`);
  if (!declarants.length) signaux.push(a.profils.length ? 'aucun contexte ne déclare ce projet : seules les règles du profil s’appliquent' : 'aucun profil connu sur ce site');
  const couches = []; const typesInconnus = [];
  if (declarants[0]) couches.push(...couchesDeclarant(a, declarants[0]));
  else if (a.profils.length === 1) couches.push({ origine: 'profil', noeud: a.profils[0], regles: a.regles.get(a.profils[0].id) || [] });
  for (const t of racine?.attributes?.types || []) {
    const n = a.templates.get(t);
    if (!n) { signaux.push(`type inconnu : ${t} (aucun nœud template ne porte cet id)`); typesInconnus.push(t); continue; }
    couches.push({ origine: 'type', noeud: n, regles: a.regles.get(n.id) || [] });
  }
  if (racine) couches.push({ origine: 'projet', noeud: racine, regles: a.regles.get(racine.id) || [] });
  const regles = fusionner(couches, signaux);
  const lues = couchesLues(couches, signaux);
  const config = fusionnerConfig(...lues.map((c) => c.config));
  for (const d of racine?.attributes?.derogations || []) {
    const e = regles.find((x) => x.id === d?.rule);
    if (!e) { signaux.push(`dérogation à une règle absente : ${d?.rule}`); continue; }
    if (e.derogeable === false) { signaux.push(`dérogation refusée : ${e.id} n’est pas dérogeable`); continue; }
    e.derogee = { pourquoi: d.why ?? null, par: d.by ?? null, le: d.at ?? null };
  }
  const lisibles = illisibles(a, couches, { types: typesInconnus, contexte: !declarants.length }); signaux.push(...lisibles);
  // Les autres en-têtes illisibles de l'arbre du projet (une décision, une observation) ne changent pas ses règles : dits.
  if (racine) signaux.push(...a.noeuds.filter((n) => n.attributes?.arbre === racine.attributes.arbre && n.attributes?.erreur_entete)
    .map((n) => `${designation(n)} : ${n.attributes.erreur_entete}`).filter((x) => !lisibles.includes(x)).map((x) => `${x} (sans effet sur les règles)`));
  regles.sort((x, y) => ORDRE.indexOf(x.origine) - ORDRE.indexOf(y.origine) || x.id.localeCompare(y.id));
  return { projet: projetId, declare: Boolean(declarants[0]), arbre: racine ? { id: racine.attributes.arbre, racine: racine.id, types: racine.attributes.types || [], classification: racine.classification } : null,
    regles: regles.map((e) => ({ ...e, applicable: applicable(e) })), config, couches: lues, signaux: [...new Set(signaux)], illisibles: lisibles, rappels: tailleRappels(regles), rappels_proposes: tailleProposes(regles) };
}

/**
 * Ce qui vaut pour tous les projets du site, à la portée du compte : la racine du profil et, s'il n'y a qu'un contexte,
 * les nœuds jusqu'à lui. Plusieurs contextes : seules les règles qui ne dépendent d'aucun choix. Aucun profil, ou
 * plusieurs : aucune règle, et `indetermine` le dit (un dépôt de profil absent ou déplacé ne vaut pas une règle retirée).
 */
export function regleDuCompte(fiches) {
  const a = arbresDe(fiches); const signaux = [];
  if (!a.profils.length) {
    const lisibles = illisibles(a, [], { contexte: true });
    return { regles: [], indetermine: true, signaux: ['aucun profil connu sur ce site (un arbre qui porte des nœuds context)', ...lisibles], illisibles: lisibles, rappels: 0, rappels_proposes: 0 };
  }
  if (a.profils.length > 1) return { regles: [], indetermine: true, signaux: [`plusieurs profils sur ce site : ${a.profils.map((p) => p.attributes.arbre).join(', ')} ; rien n’est posé au compte`], illisibles: [], rappels: 0, rappels_proposes: 0 };
  const ctx = a.contextes.filter((n) => n.attributes.arbre === a.profils[0].attributes.arbre);
  if (ctx.length > 1) signaux.push(`plusieurs contextes dans le profil : leurs règles propres ne vont pas au compte (portée locale par projet : à venir)`);
  const couches = ctx.length === 1 ? couchesDeclarant(a, ctx[0]) : [{ origine: 'profil', noeud: a.profils[0], regles: a.regles.get(a.profils[0].id) || [] }];
  const regles = fusionner(couches, signaux);
  const config = fusionnerConfig(...couchesLues(couches, signaux).map((c) => c.config));
  const lisibles = illisibles(a, couches); signaux.push(...lisibles);
  return { regles: regles.map((e) => ({ ...e, applicable: applicable(e) })), config, signaux, illisibles: lisibles, rappels: tailleRappels(regles), rappels_proposes: tailleProposes(regles) };
}

/**
 * Avant qu'un projet existe (décision creation-de-projet) : le contexte désigné (par le nom de son fichier ou son titre ;
 * facultatif quand le profil n'en a qu'un) et la configuration fusionnée de ses couches, profil, contexte puis types
 * dans l'ordre donné, comme la règle effective la calculera une fois le projet déclaré.
 */
export function configAvantProjet(fiches, { contexte = null, types = [] } = {}) {
  const a = arbresDe(fiches);
  const nomDe = (n) => n.node.split('/').pop().replace(/\.md$/, '');
  const tous = a.contextes.filter((n) => a.profils.some((p) => p.attributes.arbre === n.attributes.arbre));
  const choisis = contexte ? tous.filter((n) => nomDe(n) === contexte || n.name === contexte) : tous;
  const connus = tous.map(nomDe).join(', ') || 'aucun contexte dans le profil';
  if (choisis.length !== 1) throw new Error(contexte ? `contexte ${choisis.length ? 'ambigu' : 'inconnu'} : ${contexte} (${connus})` : `contexte à préciser (--contexte) : ${connus}`);
  const inconnus = types.filter((t) => !a.templates.has(t));
  if (inconnus.length) throw new Error(`type inconnu : ${inconnus.join(', ')} (${[...a.templates.keys()].join(', ')})`);
  const c = choisis[0];
  const couches = [...couchesDeclarant(a, c), ...types.map((t) => ({ origine: 'type', noeud: a.templates.get(t) }))];
  return { contexte: { nom: nomDe(c), fichier: c.location }, config: fusionnerConfig(...couchesLues(couches, []).map((x) => x.config)) };
}

/** Les projets qu'un contexte (ou une activité) déclare. */
/**
 * Les projets que couvre chaque nœud d'un profil (`<arbre>:<chemin>`) : ceux que déclarent les nœuds de cet arbre dont la
 * chaîne passe par lui. C'est ce que vise une exception qu'il porte, que son contrôle l'ait lue ou non.
 */
export function projetsCouverts(fiches) {
  const a = arbresDe(fiches); const r = new Map(); const profils = new Set(a.profils.map((p) => p.attributes.arbre));
  for (const n of a.noeuds.filter((x) => profils.has(x.attributes?.arbre) && Array.isArray(x.attributes?.projects))) {
    for (const c of chaine(a, n)) {
      const k = `${designation(c)}`; if (!r.has(k)) r.set(k, new Set());
      for (const p of n.attributes.projects) r.get(k).add(p);
    }
  }
  return r;
}

export const projetsDeclares = (fiches) => new Set(fiches.filter((f) => f.kind === 'node').flatMap((n) => n.attributes?.projects || []));
