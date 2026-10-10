// Règle effective (décision arbre-des-regles, contrat règle) : pour un projet, l'ensemble calculé de ses règles, chacune
// avec sa provenance. Couches, de la plus générale à la plus spécifique : le profil (racine de l'arbre du dépôt que la
// configuration du site désigne, décision profil-designe), les nœuds qui mènent de cette racine au contexte qui déclare
// le projet, les types du projet dans l'ordre déclaré (un type cité plus loin l'emporte), puis la racine de l'arbre du
// projet. Lecture pure, sur les fiches du catalogue et le profil désigné (`profilDuSite`), que chaque appelant passe.
import path from 'node:path';
import { dedans } from './commun.js';
import { slug } from './inventaire/outils.js';

const ORDRE = ['profil', 'contexte', 'type', 'projet'];
// Les nœuds du profil qui déclarent des projets (décision profil-designe).
const DECLARANTS = ['context', 'activity'];
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'sensitive'];
// Un nœud désigné comme le fait un lien vers un autre arbre (contrat nœud §3) : `<id de l'arbre>:<chemin>`.
export const designation = (n) => `${n?.attributes?.arbre}:${n?.node}`;
// Le dépôt d'un nœud : son fichier, moins son chemin dans le dépôt (`node`) ; à défaut (fiche sans emplacement),
// l'identifiant de son arbre. Un lien interne à un arbre se résout dans ce dépôt, jamais par l'`id` (décision
// profil-designe).
const depotDe = (n) => (typeof n?.location === 'string' && typeof n?.node === 'string' && n.location.endsWith(n.node) ? n.location.slice(0, -n.node.length) : `arbre:${n?.attributes?.arbre}`);
const nomDepot = (n) => path.basename(depotDe(n));

/**
 * Structure des arbres connus, tirée des fiches `node` et `rule`, et le profil : la racine de l'arbre du dépôt désigné
 * (`profil`, rendu par `profilDuSite` ; null : aucun profil sur ce site). Un autre arbre qui porte des contextes n'en
 * fait pas un second. `sansProfil` dit pourquoi il n'y a pas de profil, `introuvable` s'il est désigné sans être lu.
 * Seuls les nœuds `context` ou `activity` du profil déclarent des projets (`declarants`) ; ailleurs, un `projects:` ou
 * un nœud `context` n'est pas lu (`nonLus`, avec sa raison). Un identifiant n'est jamais résolu au hasard : le profil
 * garde son `id`, deux autres racines de même `id` ne sont pas retenues (`retenue`, `enDouble`), deux types de même
 * `id`, ou un type d'un arbre non retenu, non plus (`typesAmbigus`) ; un lien vers un `id` en double reste non résolu
 * (`lienDouble`).
 */
export function arbresDe(fiches, { profil } = {}) {
  // Un appelant qui oublierait le profil le perdrait sans le moindre signal : il le passe, null compris.
  if (profil === undefined) throw new Error('profil du site non passé (profilDuSite)');
  const noeuds = fiches.filter((f) => f.kind === 'node');
  const regles = new Map();
  for (const r of fiches.filter((f) => f.kind === 'rule')) {
    const k = r.attributes?.noeud_id; if (!regles.has(k)) regles.set(k, []); regles.get(k).push(r);
  }
  const parChemin = new Map(noeuds.map((n) => [`${depotDe(n)}|${n.node}`, n]));
  const parId = new Map(noeuds.map((n) => [n.id, n]));
  const racines = noeuds.filter((n) => n.attributes?.racine);
  // Racine d'un dépôt (contrat nœud §1) : `arbre/index.md`, sinon l'`index.md` d'un bundle OKF.
  const fichiers = profil && path.isAbsolute(profil) ? [path.join(profil, 'arbre', 'index.md'), path.join(profil, 'index.md')] : [];
  const p = racines.find((r) => r.location && fichiers.includes(path.resolve(r.location))) || null;
  const sansProfil = !profil ? 'aucun profil désigné sur ce site (clé profil de la configuration)'
    : p ? null : `profil désigné introuvable : ${profil} (${path.isAbsolute(profil) ? 'aucune racine d’arbre lue dans ce dépôt' : 'chemin absolu attendu'})`;
  const grouper = (l, cle) => { const m = new Map(); for (const x of l) { const k = cle(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const parArbre = grouper(racines, (r) => r.attributes.arbre);
  const retenue = (r) => r === p || parArbre.get(r.attributes.arbre).length === 1;
  const racineDe = new Map(racines.filter(retenue).map((r) => [r.attributes.arbre, r]));
  const depotsRetenus = new Set([...racineDe.values()].map(depotDe));
  const enDouble = [...parArbre].filter(([, l]) => l.length > 1)
    .map(([id, l]) => `identifiant d’arbre en double : ${id} (${l.map((r) => (r === p ? `${nomDepot(r)}, profil désigné, retenu` : nomDepot(r))).sort().join(' ; ')})`);
  // Un lien `derives_from` (contrat nœud §3) : chemin dans le dépôt du nœud, `<id de l'arbre>:<chemin>` vers un autre
  // arbre (retenu), ou identifiant du catalogue.
  const lien = (n) => String((n.links?.derives_from || [])[0] || '');
  const versArbre = (l) => l.match(/^([a-z0-9][a-z0-9._-]*):(\/.*)$/i);
  const parent = (n) => {
    const l = lien(n); if (!l) return null;
    const m = versArbre(l);
    if (m) { const r = racineDe.get(slug(m[1])); return (r && parChemin.get(`${depotDe(r)}|${m[2]}`)) || null; }
    return parId.get(l) || parChemin.get(`${depotDe(n)}|${l}`) || null;
  };
  const lienDouble = (n) => { const m = versArbre(lien(n)); return m && !racineDe.has(slug(m[1])) && parArbre.get(slug(m[1]))?.length > 1 ? `lien vers un identifiant d’arbre en double, non résolu : ${designation(n)} → ${lien(n)}` : null; };
  // Un type ne se résout que s'il est seul de son `id` sur le site, dans un arbre retenu.
  const templates = new Map(); const typesAmbigus = new Map();
  for (const [id, l] of grouper(noeuds.filter((n) => n.attributes?.type === 'template' && n.attributes?.id), (n) => n.attributes.id)) {
    if (l.length === 1 && depotsRetenus.has(depotDe(l[0]))) templates.set(id, l[0]);
    else typesAmbigus.set(id, l.length > 1 ? `type en double : ${id} (${l.map(designation).sort().join(', ')})` : `type d’un arbre non retenu : ${id} (${designation(l[0])}, identifiant d’arbre en double)`);
  }
  const contextes = noeuds.filter((n) => n.attributes?.type === 'context');
  const duProfil = (n) => Boolean(p) && depotDe(n) === depotDe(p);
  const declarants = noeuds.filter((n) => duProfil(n) && DECLARANTS.includes(n.attributes?.type) && Array.isArray(n.attributes?.projects));
  const nonLus = noeuds.filter((n) => !declarants.includes(n) && (n.attributes?.projects || (n.attributes?.type === 'context' && !duProfil(n))))
    .map((n) => ({ noeud: n, raison: !duProfil(n) ? `${n.attributes?.type === 'context' ? 'contexte' : 'projets déclarés'} hors du profil désigné` : 'projets déclarés hors d’un contexte ou d’une activité du profil' }));
  return { noeuds, regles, racines, parent, templates, contextes: contextes.filter(duProfil), profil: p, sansProfil, introuvable: Boolean(profil) && !p, declarants, nonLus,
    retenue, enDouble, lienDouble, typesAmbigus };
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
// s'allonge (une exception posée par le projet s'ajoute à celles du profil), une valeur simple posée plus bas l'emporte
// sur une valeur simple. Elle ne remplace ni un objet ni une liste d'une couche plus haute : celle-ci tient, et c'est dit
// (`signaux`, avec la provenance de la couche ; décision fusion-et-profil-audite). Lever une règle passe par une
// dérogation, pas par un réglage vidé. Une clé de l'arbre (`__proto__` compris) reste une clé.
export function fusionnerCouches(couches, signaux = []) {
  const objet = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
  const forme = (x) => (Array.isArray(x) ? 'une liste' : objet(x) ? 'un objet' : 'une valeur simple');
  const poser = (r, k, v) => Object.defineProperty(r, k, { value: v, enumerable: true, writable: true, configurable: true });
  const fusion = (a, b, chemin, de) => {
    if (b === undefined) return a;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    if (objet(a) && objet(b)) {
      const r = {}; for (const [k, v] of Object.entries(a)) poser(r, k, v);
      for (const [k, v] of Object.entries(b)) poser(r, k, Object.hasOwn(r, k) ? fusion(r[k], v, [...chemin, k], de) : v);
      return r;
    }
    if ((objet(a) || Array.isArray(a)) && forme(a) !== forme(b)) {
      signaux.push(`${chemin.join('.')} posé par ${de} : ${forme(b)} ne remplace pas ${forme(a)} d’une couche plus haute, qui tient (décision fusion-et-profil-audite)`);
      return a;
    }
    return b;
  };
  return couches.filter((c) => objet(c.config)).reduce((r, c) => fusion(r, c.config, [], c.provenance ? `${c.provenance} (${c.origine})` : 'une couche'), {});
}
export const fusionnerConfig = (...configs) => fusionnerCouches(configs.map((config) => ({ config })));

// Portée d'un réglage qui ne se lit pas partout : une clé (`a`) ou une sous-clé (`a.b`), les couches qui peuvent la
// porter, si elle se lit hors du dépôt contrôlé, et la décision qui le dit. Une exception fait taire un écart : elle ne
// se lit pas dans les fichiers qu'un conteneur du projet écrit (types et racine du projet), ni dans le dépôt contrôlé
// s'il est celui du profil. `montage_sensible` entier (décision exceptions-hors-du-depot) ; de `donnees_personnelles`,
// les seules `exceptions`, les `termes` allongeant la liste privée à toutes les couches (décision profil-designe).
// Une clé absente de cette table se lit à toutes les couches.
// Une `Map` : une clé écrite dans l'arbre (`constructor`, `toString`…) ne se confond pas avec une propriété d'objet.
const PORTEE = new Map([
  ['montage_sensible', { couches: ['profil', 'contexte'], horsDepot: true, decision: 'exceptions-hors-du-depot' }],
  ['donnees_personnelles.exceptions', { couches: ['profil', 'contexte'], horsDepot: true, decision: 'profil-designe' }]]);
const porteeDe = (cle) => PORTEE.get(cle) || PORTEE.get(`${cle}.exceptions`);

// Les réglages d'une couche dans leur portée (`config`) ; une clé posée hors de sa portée n'est pas lue (`ecartee`, de
// même forme), et se dit.
function dansPortee(c, signaux) {
  const config = c.noeud.attributes?.config;
  const objet = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
  if (!objet(config)) return { config: config ?? null, ecartee: null };
  let garde = config; let ecartee = null;
  for (const [chemin, p] of PORTEE) {
    const [k, sous] = chemin.split('.');
    if (p.couches.includes(c.origine) || !Object.hasOwn(garde, k) || (sous && !(objet(garde[k]) && Object.hasOwn(garde[k], sous)))) continue;
    signaux.push(`${chemin} porté par ${designation(c.noeud)} (${c.origine}) : non lu, il se lit au ${p.couches.join(' et au ')} (décision ${p.decision})`);
    const { [sous ?? k]: hors, ...reste } = sous ? garde[k] : garde;
    ecartee = { ...ecartee, [k]: sous ? { [sous]: hors } : hors };
    garde = sous ? { ...garde, [k]: reste } : reste;
  }
  return { config: garde, ecartee };
}

// Les couches telles que les lisent la configuration fusionnée et les contrôles : origine, nœud qui la porte
// (`provenance`, sa désignation) et son fichier, ses réglages dans leur portée, et ceux qui en sont écartés.
const couchesLues = (couches, signaux) => couches.map((c) => ({ origine: c.origine, provenance: designation(c.noeud), fichier: c.noeud.location ?? null,
  ...dansPortee(c, signaux) }));

/**
 * Les exceptions d'un réglage (`<cle>.exceptions`), lues d'une seule façon par tous les contrôles : couche par couche,
 * chacune avec sa raison et sa provenance. Sans sa valeur (`champ` : `terme`, `fichier`, `ecart`, ou une liste de champs
 * possibles, le premier présent étant le sien) ou sans raison, une exception ne vaut pas. Une clé qui se lit hors du
 * dépôt contrôlé (`PORTEE`) ignore les couches dont le fichier est dans `depot`. { lues, ignorees } : chacune avec son
 * champ ; celles qui ne valent pas, avec ce qui les écarte.
 */
export function lireExceptions(couches = [], cle, champ, { depot = null } = {}) {
  const texte = (x) => (x === null || x === undefined || typeof x === 'object' ? '' : String(x).trim());
  const champs = [].concat(champ);
  const dansDepot = (f) => Boolean(porteeDe(cle)?.horsDepot && depot && f) && dedans(path.resolve(f), path.resolve(depot));
  const lues = []; const ignorees = [];
  for (const c of couches) {
    const de = { origine: c.origine, provenance: c.provenance, fichier: c.fichier };
    const ecartee = [].concat(c.ecartee?.[cle]?.exceptions || []);
    for (const x of [].concat(c.config?.[cle]?.exceptions || []).concat(ecartee)) {
      const objet = x && typeof x === 'object'; const sien = (objet && champs.find((k) => texte(x[k]))) || champs[0];
      const valeur = objet ? texte(x[sien]) : ''; const pourquoi = objet ? texte(x.pourquoi) : '';
      const raison = ecartee.includes(x) ? `porté par un ${c.origine}, il se lit au ${porteeDe(cle).couches.join(' et au ')}`
        : dansDepot(c.fichier) ? 'écrite dans le dépôt contrôlé' : !valeur ? `sans ${champs.join(' ni ')}` : !pourquoi ? 'sans raison' : null;
      (raison ? ignorees : lues).push({ valeur, champ: sien, ...(raison ? { raison } : { pourquoi }), ...de });
    }
  }
  return { lues, ignorees };
}
export const exceptions = (...a) => lireExceptions(...a).lues;

const applicable = (e) => e.statut === 'stable' && !e.derogee;
// Sources de règles illisibles (un `rules.yaml` ou un en-tête en cours d'édition, un conflit de fusion) : la règle
// effective est alors incomplète. Ce qui en décide (garde, matérialisation, audit) ne la dit pas conforme pour autant.
// Comptent les couches elles-mêmes, tout en-tête illisible de l'arbre du profil (ce pouvait être un contexte ou un nœud
// de sa chaîne) et, quand un type déclaré est introuvable, tout en-tête illisible qui pouvait être lui : d'après ce qui
// s'en lit ligne à ligne (`indices_entete`), un `template` de cet `id`, ou un nœud dont le type ne se lit pas. Seuls les
// contextes du profil déclarent (décision profil-designe) : un contexte illisible ailleurs ne pouvait déclarer personne.
// Une décision illisible d'un projet sans rapport ne compte pas. Un profil désigné
// mais introuvable compte aussi (décision profil-designe) : ses règles manquent toutes ; de même un lien de la chaîne du
// profil vers un identifiant d'arbre en double, une chaîne de déclarant qui n'atteint pas la racine du profil (lien
// absent, rompu ou vers un autre arbre : les règles de la racine manqueraient sans signal), et un champ de forme
// invalide (`erreur_forme`, inventaire de l'arbre).
function illisibles(a, couches, { types = [] } = {}) {
  const chaine = couches.filter((c) => c.origine === 'profil' || c.origine === 'contexte');
  const profil = new Set(chaine.map((c) => depotDe(c.noeud)));
  const pouvaitEtre = ({ type, id } = {}) => types.length > 0 && (!type || (type === 'template' && (!id || types.includes(id))));
  const enTetes = a.noeuds.filter((n) => n.attributes?.erreur_entete && (profil.has(depotDe(n)) || couches.some((c) => c.noeud === n) || pouvaitEtre(n.attributes.indices_entete)));
  // Un lien vers un identifiant en double dit déjà pourquoi la chaîne s'arrête.
  const doubles = chaine.map((c) => a.lienDouble(c.noeud)).filter(Boolean);
  const rompue = !doubles.length && chaine.length && chaine[0].noeud !== a.profil ? [`${designation(chaine.at(-1).noeud)} : sa chaîne (derives_from) n’atteint pas la racine du profil`] : [];
  return [...new Set([...(a.introuvable ? [a.sansProfil] : []), ...doubles, ...rompue,
    ...couches.map((c) => c.noeud).filter((n) => n?.attributes?.erreur_regles).map((n) => `${designation(n)} : ${n.attributes.erreur_regles}`),
    // Un champ de forme invalide (`erreur_forme`) : dans une couche, ou dans l'arbre du profil, où il pouvait déclarer ce
    // projet (`projects`) ou porter ses réglages.
    ...a.noeuds.filter((n) => n.attributes?.erreur_forme && (profil.has(depotDe(n)) || couches.some((c) => c.noeud === n))).map((n) => `${designation(n)} : ${n.attributes.erreur_forme}`),
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
export function regleEffective(fiches, projetId, { profil } = {}) {
  const a = arbresDe(fiches, { profil }); const signaux = [];
  // L'arbre du projet, s'il est retenu ; sinon (identifiant en double), ses règles et ses types manquent : incomplète.
  const brute = a.racines.find((n) => n.links?.project?.includes(projetId) && n !== a.profil);
  const racine = brute && a.retenue(brute) ? brute : null;
  const ambigus = brute && !racine ? [`arbre du projet non retenu, ${a.enDouble.find((x) => x.startsWith(`identifiant d’arbre en double : ${brute.attributes.arbre} (`))}`] : [];
  const declarants = a.declarants.filter((n) => n.attributes.projects.includes(projetId));
  // Deux déclarants : aucun n'est choisi, la règle effective est incomplète (`deuxFois`, avec les illisibles).
  const deuxFois = declarants.length > 1 ? [`projet déclaré par plusieurs nœuds du profil : ${declarants.map(designation).join(', ')}`] : [];
  for (const x of a.nonLus.filter((x) => x.noeud.attributes?.projects?.includes(projetId))) signaux.push(`déclaration non lue : ${designation(x.noeud)} (${x.raison})`);
  if (!declarants.length) signaux.push(a.profil ? 'aucun contexte ne déclare ce projet : seules les règles du profil s’appliquent' : a.sansProfil);
  const couches = []; const typesInconnus = [];
  if (declarants.length === 1) couches.push(...couchesDeclarant(a, declarants[0]));
  else if (a.profil) couches.push({ origine: 'profil', noeud: a.profil, regles: a.regles.get(a.profil.id) || [] });
  for (const t of racine?.attributes?.types || []) {
    if (a.typesAmbigus.has(t)) { ambigus.push(a.typesAmbigus.get(t)); continue; }
    const n = a.templates.get(t);
    if (!n) { signaux.push(`type inconnu : ${t} (aucun nœud template ne porte cet id)`); typesInconnus.push(t); continue; }
    couches.push({ origine: 'type', noeud: n, regles: a.regles.get(n.id) || [] });
  }
  if (racine) couches.push({ origine: 'projet', noeud: racine, regles: a.regles.get(racine.id) || [] });
  const regles = fusionner(couches, signaux);
  const lues = couchesLues(couches, signaux);
  const config = fusionnerCouches(lues, signaux);
  for (const d of racine?.attributes?.derogations || []) {
    const e = d?.rule == null ? null : regles.find((x) => x.id === slug(d.rule));
    if (!e) { signaux.push(`dérogation à une règle absente : ${d?.rule}`); continue; }
    if (e.derogeable === false) { signaux.push(`dérogation refusée : ${e.id} n’est pas dérogeable`); continue; }
    e.derogee = { pourquoi: d.why ?? null, par: d.by ?? null, le: d.at ?? null };
  }
  const lisibles = [...deuxFois, ...ambigus, ...illisibles(a, couches, { types: typesInconnus })]; signaux.push(...lisibles);
  // Les autres en-têtes illisibles de l'arbre du projet (une décision, une observation) ne changent pas ses règles : dits.
  if (racine) signaux.push(...a.noeuds.filter((n) => depotDe(n) === depotDe(racine) && n.attributes?.erreur_entete)
    .map((n) => `${designation(n)} : ${n.attributes.erreur_entete}`).filter((x) => !lisibles.includes(x)).map((x) => `${x} (sans effet sur les règles)`));
  regles.sort((x, y) => ORDRE.indexOf(x.origine) - ORDRE.indexOf(y.origine) || x.id.localeCompare(y.id));
  return { projet: projetId, declare: declarants.length > 0, arbre: racine ? { id: racine.attributes.arbre, racine: racine.id, types: racine.attributes.types || [], classification: racine.classification } : null,
    regles: regles.map((e) => ({ ...e, applicable: applicable(e) })), config, couches: lues, signaux: [...new Set(signaux)], illisibles: lisibles, rappels: tailleRappels(regles), rappels_proposes: tailleProposes(regles) };
}

/**
 * Ce qui vaut pour tous les projets du site, à la portée du compte : la racine du profil et, s'il n'y a qu'un contexte,
 * les nœuds jusqu'à lui. Plusieurs contextes : seules les règles qui ne dépendent d'aucun choix. Sans profil : aucune
 * règle, et `indetermine` le dit (un dépôt de profil absent ou déplacé ne vaut pas une règle retirée).
 */
export function regleDuCompte(fiches, { profil } = {}) {
  const a = arbresDe(fiches, { profil }); const signaux = [];
  // Ce que l'audit dit au compte (décision profil-designe) : un site qui lit des arbres sans profil désigné, et chaque
  // déclaration non lue, avec le nœud qui la porte.
  const declarations = { non_designe: !profil && a.racines.length > 0, non_lues: a.nonLus.map((x) => ({ noeud: designation(x.noeud), raison: x.raison })).sort((x, y) => x.noeud.localeCompare(y.noeud)) };
  if (!a.profil) {
    const lisibles = illisibles(a, []);
    return { regles: [], indetermine: true, signaux: [...new Set([a.sansProfil, ...lisibles, ...a.enDouble])], illisibles: lisibles, declarations, rappels: 0, rappels_proposes: 0 };
  }
  signaux.push(...a.enDouble);
  const ctx = a.contextes;
  if (ctx.length > 1) signaux.push(`plusieurs contextes dans le profil : leurs règles propres ne vont pas au compte (portée locale par projet : à venir)`);
  const couches = ctx.length === 1 ? couchesDeclarant(a, ctx[0]) : [{ origine: 'profil', noeud: a.profil, regles: a.regles.get(a.profil.id) || [] }];
  const regles = fusionner(couches, signaux);
  const config = fusionnerCouches(couchesLues(couches, signaux), signaux);
  const lisibles = illisibles(a, couches); signaux.push(...lisibles);
  return { regles: regles.map((e) => ({ ...e, applicable: applicable(e) })), config, signaux, illisibles: lisibles, declarations, rappels: tailleRappels(regles), rappels_proposes: tailleProposes(regles) };
}

/**
 * Avant qu'un projet existe (décision creation-de-projet) : le contexte désigné (par le nom de son fichier ou son titre ;
 * facultatif quand le profil n'en a qu'un) et la configuration fusionnée de ses couches, profil, contexte puis types
 * dans l'ordre donné, comme la règle effective la calculera une fois le projet déclaré.
 */
export function configAvantProjet(fiches, { contexte = null, types: demandes = [], profil } = {}) {
  const a = arbresDe(fiches, { profil }); const types = demandes.map(slug);
  if (!a.profil) throw new Error(a.sansProfil);
  const nomDe = (n) => n.node.split('/').pop().replace(/\.md$/, '');
  const tous = a.contextes;
  const choisis = contexte ? tous.filter((n) => nomDe(n) === contexte || n.name === contexte) : tous;
  const connus = tous.map(nomDe).join(', ') || 'aucun contexte dans le profil';
  if (choisis.length !== 1) throw new Error(contexte ? `contexte ${choisis.length ? 'ambigu' : 'inconnu'} : ${contexte} (${connus})` : `contexte à préciser (--contexte) : ${connus}`);
  const ambigus = types.filter((t) => a.typesAmbigus.has(t));
  if (ambigus.length) throw new Error(ambigus.map((t) => a.typesAmbigus.get(t)).join(' ; '));
  const inconnus = types.filter((t) => !a.templates.has(t));
  if (inconnus.length) throw new Error(`type inconnu : ${inconnus.join(', ')} (${[...a.templates.keys()].join(', ')})`);
  const c = choisis[0];
  const couches = [...couchesDeclarant(a, c), ...types.map((t) => ({ origine: 'type', noeud: a.templates.get(t) }))];
  return { contexte: { nom: nomDe(c), fichier: c.location }, config: fusionnerCouches(couchesLues(couches, [])) };
}

/**
 * Les projets que couvre chaque nœud d'un profil (`<arbre>:<chemin>`) : ceux que déclarent les nœuds de cet arbre dont la
 * chaîne passe par lui. C'est ce que vise une exception qu'il porte, que son contrôle l'ait lue ou non.
 */
export function projetsCouverts(fiches, { profil } = {}) {
  const a = arbresDe(fiches, { profil }); const r = new Map();
  for (const n of a.declarants) {
    for (const c of chaine(a, n)) {
      const k = `${designation(c)}`; if (!r.has(k)) r.set(k, new Set());
      for (const p of n.attributes.projects) r.get(k).add(p);
    }
  }
  return r;
}

/** Les déclarations des nœuds du profil (décision profil-designe) : chaque projet déclaré, avec le nœud qui le déclare. */
export const declarationsDe = (fiches, { profil } = {}) => arbresDe(fiches, { profil }).declarants.flatMap((n) => n.attributes.projects.map((projet) => ({ projet, noeud: designation(n) })));

/** Les projets que déclarent les nœuds du profil (décision profil-designe). */
export const projetsDeclares = (fiches, o = {}) => new Set(declarationsDe(fiches, o).map((x) => x.projet));
