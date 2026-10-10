// Contrôles et audit de conformité (étape 3, tranches 4 et 5 ; décisions controles-de-regles et
// veille-securite-versions). Le socle n'en garde que l'entrée : ces fonctions reçoivent le socle et lisent par lui.
import fs from 'node:fs';
import path from 'node:path';
import { comptesClaudeCode, accueil } from './config.js';
import { projetsDe, localiserProjet } from './projets.js';
import { regleEffective, regleDuCompte, projetsDeclares, projetsCouverts } from './regles.js';
import { listePrivee, executer, CONTROLES } from './controles.js';
import { trouverOutil } from './commun.js';
import { racineArbre } from './inventaire/arbre.js';
import { materialiserCompte, materialiserProjet } from './materialisation.js';
import { ulid } from './ulid.js';
import { crochetVoulu } from './regles-claude-code.js';

// Un écart se reconnaît d'un audit à l'autre par son projet, sa règle, son contrôle et sa clé (jamais par son contenu).
const cleEcart = (projet, d) => [projet ?? '', d.regle, d.controle, d.cle].join('|');
const donneesEcart = (x) => ({ regle: x.regle, controle: x.controle, cle: x.cle, ...(x.fichier && { fichier: x.fichier }), ...(x.ligne && { ligne: x.ligne }), ...(x.n && { n: x.n }), ...(x.message && { message: x.message }) });
const comptesDe = (s) => comptesClaudeCode(s.config, s.config.inventaire?.['claude-code'] || {});

/** Ce qu'un contrôle reçoit pour un projet : son dépôt, la racine de son arbre, ses réglages, la liste privée, les outils. */
export function contexteControle(s, projet, r, depot = projet.location) {
  const noeuds = s.fiches({ kind: 'node' });
  const declares = projetsDeclares(noeuds);
  // Public : la racine de son arbre se classe `public`, ou ses couches le déclarent public (`creation.visibilite`, que
  // porte le type depot-public) ; une seule notion avec la commande de création.
  const fiches = [...noeuds, ...s.fiches({ kind: 'rule' })];
  const publique = (id) => noeuds.some((n) => n.attributes?.racine && n.links?.project?.includes(id) && n.classification === 'public')
    || regleEffective(fiches, id).config?.creation?.visibilite === 'public';
  const projetsPrives = s.fiches({ kind: 'project' }).filter((x) => declares.has(x.id) && !publique(x.id)).map((x) => x.name);
  const config = r.config || {}; const couches = r.couches || []; const reglages = s.config.controles || {};
  return { depot, arbre: depot ? racineArbre(depot)?.dossier : null, config, couches, declare: Boolean(r.declare), reglages, cache: path.join(s.config.donnees, 'cache'),
    holarch: [s.config.accueil || accueil(), s.config.donnees],
    conteneurs: s.fiches({ kind: 'container' }).filter((k) => k.links?.project?.includes(projet.id)),
    gitleaks: trouverOutil('gitleaks', reglages.gitleaks), osv: trouverOutil('osv-scanner', reglages.osv_scanner),
    termes: depot ? listePrivee({ depot, config, couches, comptes: comptesDe(s), projetsPrives, nomProjet: projet.name }) : [] };
}

/** Contrôles d'une règle effective à un moment : par règle applicable de l'un des niveaux, ses écarts ; et l'état de chaque contrôle. */
function controler(r, ctx, moment, niveaux, portee = 'projet') {
  const memo = new Map(); const ecarts = []; const etats = new Map();
  for (const e of r.regles.filter((x) => x.applicable && niveaux.includes(x.niveau))) {
    for (const c of e.controles || []) {
      if ((CONTROLES[c]?.portee === 'site') !== (portee === 'site')) continue;
      if (!memo.has(c)) memo.set(c, executer(c, ctx, moment));
      const res = memo.get(c);
      if (res.hors_moment) continue;
      // Les exceptions qu'il a lues se disent avec son état (décision exceptions-hors-du-depot), et la règle qui l'a demandé.
      const exc = res.exceptions?.length ? { exceptions: res.exceptions.map((x) => ({ ...x, regle: e.fiche, regle_id: e.id })) } : {};
      etats.set(c, res.indisponible ? { id: c, etat: 'indisponible', raison: res.indisponible, ...exc } : { id: c, etat: 'fait', ...exc });
      // Un contrôle lu en partie dit ce qu'il a trouvé ; non disponible, il ne résout rien de ce qu'il n'a pas vu.
      ecarts.push(...(res.ecarts || []).map((x) => ({ regle: e.fiche, regle_id: e.id, enonce: e.enonce, controle: c, ...x })));
    }
  }
  return { ecarts, controles: [...etats.values()] };
}

/**
 * Garde avant commit (appelée par le crochet de git) : les règles bloquantes du projet du dépôt, sur les changements
 * indexés. { projet, refus: [{regle, enonce, ecarts}], indisponibles }.
 */
export function garde(s, { depot = process.cwd(), moment = 'avant-commit', journaliser = false } = {}) {
  const projets = s.fiches({ kind: 'project' });
  const p = localiserProjet(projetsDe(projets))(path.resolve(depot));
  if (!p) return { projet: null, refus: [], indisponibles: [] };
  const fiche = projets.find((x) => x.id === p.id);
  // L'arbre relu s'il a changé : une exception ajoutée vaut au commit suivant, pas une heure plus tard.
  const r = regleEffective(s.arbreFrais(), p.id);
  // Règles illisibles : une règle bloquante peut manquer ; le commit est refusé plutôt que dit conforme, et journalisé
  // comme tout refus.
  const enonce = 'les règles du projet ne se lisent pas toutes : la garde ne peut pas dire ce commit conforme';
  const { ecarts, controles } = r.illisibles.length ? { ecarts: ecartsIllisibles(r).map((x) => ({ ...x, enonce })), controles: [] }
    : controler(r, contexteControle(s, fiche, r, path.resolve(depot)), moment, ['blocking']);
  const refus = new Map();
  for (const x of ecarts) { if (!refus.has(x.regle_id)) refus.set(x.regle_id, { regle: x.regle_id, enonce: x.enonce, ecarts: [] }); refus.get(x.regle_id).ecarts.push(x); }
  // Un refus est un échec au journal (décision echecs-au-journal) : un `rule.enforced` par règle et contrôle, compté,
  // jamais le contenu trouvé. Un commit forcé reste vu par l'audit (`rule.violated`).
  // Un journal injoignable ne change pas le refus : il est dit (`journal_erreur`).
  let journalErreur = null;
  if (journaliser && ecarts.length) {
    try {
      const at = new Date().toISOString(); const parControle = new Map();
      for (const x of ecarts) { const k = `${x.regle}|${x.controle}`; parControle.set(k, { regle: x.regle, controle: x.controle, n: (parControle.get(k)?.n || 0) + 1, moment }); }
      const evs = [...parControle.values()].map((data) => ({ id: ulid(Date.parse(at)), at, kind: 'rule.enforced', actor: 'system:garde', subject: p.id, data, classification: 'internal' }));
      s.journal.ajouter(evs);
    } catch (e) { journalErreur = e.message; }
  }
  return { projet: p.id, refus: [...refus.values()], indisponibles: controles.filter((c) => c.etat === 'indisponible'), ...(journalErreur && { journal_erreur: journalErreur }) };
}

/** Écarts ouverts : derniers `rule.violated` sans `rule.resolved` après eux, avec leur date d'apparition. */
export function ecartsOuverts(s) {
  const ouverts = new Map();
  for (const ev of s.index.requete("SELECT at, kind, subject, data FROM evenements WHERE kind IN ('rule.violated','rule.resolved') ORDER BY id")) {
    const d = JSON.parse(ev.data); const k = cleEcart(ev.subject, d);
    if (ev.kind === 'rule.violated') ouverts.set(k, { ...d, projet: ev.subject ?? null, depuis: ev.at }); else ouverts.delete(k);
  }
  return [...ouverts.values()];
}

// ---------- écarts de matérialisation (lue à blanc) ----------

const regleNommee = (regles, nom) => regles.find((e) => e.id === nom)?.fiche || nom;

// Une source de règles illisible est un écart (durable au journal jusqu'à sa correction) ; la matérialisation, lue à
// blanc sur une règle incomplète, donnerait de faux retraits : elle n'est pas comparée tant que dure l'écart.
const ecartsIllisibles = (r) => r.illisibles.map((message) => ({ regle: 'regles-lisibles', regle_id: 'regles-lisibles', controle: 'regles-lisibles', cle: message.split(' : ')[0], message }));

function ecartsFichiers(regles, m, prefixe) {
  const regleDe = new Map(m.plan.fichiers.map((x) => [x.fichier, x.regle]));
  const e = (f, message) => { const id = regleDe.get(f) || f.replace(/\.md$/, ''); return { regle: regleNommee(regles, id), regle_id: id, controle: 'regles-a-jour', cle: f, fichier: `${prefixe}/${f}`, message }; };
  const d = m.fichiers;
  return [...d.crees.map((f) => e(f, 'fichier de règle absent')), ...d.modifies.map((f) => e(f, 'fichier de règle périmé')),
    ...d.retires.map((f) => e(f, 'fichier généré sans règle')), ...d.ignores.map((f) => e(f, 'fichier non marqué à la place d’une règle générée'))];
}

const ecartsPermissions = (m) => (m.permissions.ajoutees || []).map((x) => { const e = m.lectures.find((l) => l.entree === x).regle;
  return { regle: e.fiche, regle_id: e.id, controle: 'permissions-posees', cle: x, fichier: 'settings.json', message: 'lecture non refusée' }; });

// Réglages de Claude Code voulus par le profil et absents (une clé posée à la main n'est pas un écart : elle est dite).
const ecartsReglages = (regles, m) => [
  ...m.reglages.cles.posees.map((cle) => ({ regle: 'claude_code', regle_id: 'claude_code', controle: 'reglages-poses', cle, fichier: 'settings.json', message: `réglage ${cle} non posé` })),
  ...m.reglages.crochets.poses.map((c) => { const x = crochetVoulu(c, regles); return { regle: x.regle === 'claude_code' ? x.regle : regleNommee(regles, x.regle), regle_id: x.regle, controle: 'reglages-poses', cle: x.cle, fichier: 'settings.json', message: x.message }; })];

function ecartsCrochet({ demande, etat }) {
  const e = (message, r = demande) => [{ regle: r ? r.fiche : 'crochet', regle_id: r ? r.id : 'crochet', controle: 'crochet-pose', cle: 'pre-commit', fichier: '.git/hooks/pre-commit', message }];
  if (etat === 'pose') return e('crochet de git absent');
  if (etat === 'modifie') return e('crochet de git périmé');
  if (etat === 'ignore' && demande) return e('un crochet pre-commit non marqué occupe la place');
  if (etat === 'retire') return e('crochet posé sans règle qui le demande', null);
  return [];
}

const remplacees = (regles, memoires) => regles.filter((e) => e.applicable && e.remplace?.length).flatMap((e) => memoires
  .filter((m) => e.remplace.includes(m.name) || e.remplace.includes(path.basename(m.location || '', '.md')))
  .map((m) => ({ regle: e.fiche, regle_id: e.id, controle: 'memoire-remplacee', cle: m.id, fichier: m.name, message: 'mémoire encore présente, remplacée par la règle' })));

/**
 * Exceptions périmées (décision exceptions-hors-du-depot) : une exception jugée par son contrôle dans chaque projet où
 * elle s'applique, sans y faire taire aucun écart, est un écart du compte (elle vit au profil ou dans un contexte),
 * jusqu'à ce qu'elle serve ou soit retirée. Jugée sur l'audit de tous les projets, et sur ce site. Elle s'applique aux
 * projets que son nœud couvre (`couverts`) ; dans l'un d'eux, elle n'est pas jugée si son contrôle n'a pas pu la lire en
 * entier (lu en partie), ne l'a pas lue du tout (dépôt absent de ce site, projet hors du catalogue, contrôle en échec),
 * ou si la chaîne du projet ne passe plus par son nœud (`chaines`). Non jugée, rien ne se dit ni ne se résout.
 */
function perimees(sorties, faits, couverts, chaines) {
  const vues = new Map(); const controles = new Set(); const parProjet = new Map(sorties.filter((x) => x.projet).map((x) => [x.projet, x]));
  for (const c of [...parProjet.values()].flatMap((x) => x.controles)) {
    if (c.etat === 'fait' || c.exceptions?.length) controles.add(c.id);
    for (const x of c.exceptions || []) {
      const k = `${c.id}|${x.provenance}|${x.ecart}`; const jugee = x.jugee ?? c.etat === 'fait';
      const v = vues.get(k) || { ...x, controle: c.id, utilisee: false, entiere: true };
      v.utilisee ||= x.utilisee; v.entiere &&= jugee; vues.set(k, v);
    }
  }
  for (const v of vues.values()) {
    for (const projet of couverts.get(v.provenance) || []) {
      const rp = parProjet.get(projet); const c = rp?.controles.find((y) => y.id === v.controle);
      const lue = c?.exceptions?.some((y) => y.provenance === v.provenance && y.ecart === v.ecart);
      // Fait sans la lire : le contrôle l'a écartée (dans le dépôt contrôlé) ; non lancé, aucune règle ne le demande ici.
      if (!chaines.get(projet)?.has(v.provenance) || (c && c.etat !== 'fait' && !lue)) v.entiere = false;
    }
  }
  const nonJuges = new Set([...vues.values()].filter((v) => !v.entiere).map((v) => v.controle));
  const ecarts = [...vues.values()].filter((v) => !v.utilisee && v.entiere).map((v) => ({ regle: v.regle, regle_id: v.regle_id, controle: v.controle,
    cle: `exception-perimee:${v.ecart}`, fichier: v.provenance, message: `exception qui ne fait taire aucun écart sur ce site (${v.pourquoi}) : la retirer` }));
  let compte = sorties.find((x) => !x.projet);
  if (ecarts.length && !compte) sorties.unshift(compte = { projet: null, nom: 'compte', ecarts: [], controles: [] });
  compte?.ecarts.push(...ecarts);
  for (const c of controles) if (!nonJuges.has(c)) faits.add(`|${c}`);
}

/**
 * Audit de conformité : pour le compte et chaque projet qui a des règles (ou celui demandé), les contrôles de ses règles
 * `blocking` et `verified`, et la matérialisation (fichiers générés, crochet, permissions, mémoires remplacées).
 * `journaliser` : un écart apparu s'écrit `rule.violated`, un écart disparu `rule.resolved` (si son contrôle a pu
 * s'exécuter). Rien d'autre n'est écrit.
 */
export function audit(s, { projet = null, journaliser = false } = {}) {
  const fiches = [...s.fiches({ kind: 'node' }), ...s.fiches({ kind: 'rule' })];
  const projets = s.fiches({ kind: 'project' }); const memoires = s.fiches({ kind: 'memory' });
  const faits = new Set(); const sorties = [];

  // Compte : ce qui vaut pour tous les projets du site.
  const compte = regleDuCompte(fiches);
  if (compte.regles.length || compte.illisibles.length) {
    const rc = { projet: null, nom: 'compte', ecarts: ecartsIllisibles(compte), controles: [] };
    faits.add('|regles-lisibles');
    // Règles illisibles : une règle qui remplace une mémoire peut manquer ; ni ses écarts ni leur résolution ne se disent.
    if (compte.illisibles.length) rc.controles.push(...['regles-a-jour', 'permissions-posees', 'reglages-poses', 'memoire-remplacee'].map((id) => ({ id, etat: 'indisponible', raison: 'règles illisibles' })));
    else for (const m of materialiserCompte(compte, comptesDe(s), { accueil: s.config.accueil || accueil(), ecrire: false })) {
      rc.ecarts.push(...ecartsFichiers(compte.regles, m, 'rules/holarch'));
      if (m.permissions.erreur) rc.controles.push({ id: 'permissions-posees', etat: 'indisponible', raison: m.permissions.erreur });
      else rc.ecarts.push(...ecartsPermissions(m));
      if (m.reglages.erreur) rc.controles.push({ id: 'reglages-poses', etat: 'indisponible', raison: m.reglages.erreur });
      else rc.ecarts.push(...ecartsReglages(compte.regles, m));
    }
    if (!compte.illisibles.length) rc.ecarts.push(...remplacees(compte.regles, memoires));
    for (const c of ['regles-a-jour', 'permissions-posees', 'reglages-poses', 'memoire-remplacee']) if (!rc.controles.some((x) => x.id === c)) faits.add(`|${c}`);
    // Contrôles de portée site (le poste lui-même), une fois, avec les réglages du compte.
    const site = controler(compte, { config: compte.config || {}, reglages: s.config.controles || {}, cache: path.join(s.config.donnees, 'cache'), accueil: s.config.accueil || accueil() }, 'audit', ['blocking', 'verified'], 'site');
    rc.ecarts.push(...site.ecarts); rc.controles.push(...site.controles);
    for (const c of site.controles) if (c.etat === 'fait') faits.add(`|${c.id}`);
    sorties.push(rc);
  }

  // Projets.
  const cibles = projet ? [s.projetDe(projet)] : s.regles().projets.map((p) => p.id);
  const chaines = new Map();
  for (const id of cibles) {
    const p = projets.find((x) => x.id === id); if (!p) continue;
    const r = regleEffective(fiches, id);
    // Un dépôt absent de ce site : ses types, donc ses règles, sont inconnus ; rien ne s'y juge.
    if (p.location && fs.existsSync(p.location)) chaines.set(id, new Set(r.couches.map((c) => `${c.arbre}:${c.noeud}`)));
    const { ecarts, controles } = controler(r, contexteControle(s, p, r), 'audit', ['blocking', 'verified']);
    for (const c of controles) if (c.etat === 'fait') faits.add(`${id}|${c.id}`);
    // Une source illisible du profil est déjà un écart du compte : le projet ne la compte pas une seconde fois.
    const propres = { illisibles: r.illisibles.filter((m) => !compte.illisibles.includes(m)) };
    const rp = { projet: id, nom: p.name, ecarts: [...ecartsIllisibles(propres), ...ecarts], controles };
    faits.add(`${id}|regles-lisibles`);
    if (r.illisibles.length) rp.controles.push(...['regles-a-jour', 'crochet-pose', 'memoire-remplacee'].map((c) => ({ id: c, etat: 'indisponible', raison: 'règles illisibles' })));
    else if (p.location && fs.existsSync(p.location)) {
      const m = materialiserProjet(r, p.location, { accueil: s.config.accueil || accueil(), ecrire: false });
      rp.ecarts.push(...ecartsFichiers(r.regles, m, '.claude/rules/holarch'), ...ecartsCrochet(m.crochet));
      faits.add(`${id}|regles-a-jour`); faits.add(`${id}|crochet-pose`);
    }
    if (!r.illisibles.length) {
      rp.ecarts.push(...remplacees(r.regles.filter((e) => e.origine === 'type' || e.origine === 'projet'), memoires.filter((m) => m.links?.project?.includes(id))));
      faits.add(`${id}|memoire-remplacee`);
    }
    sorties.push(rp);
  }
  if (!projet) perimees(sorties, faits, projetsCouverts(fiches), chaines);

  let journal = null;
  if (journaliser) {
    const ouverts = new Map(ecartsOuverts(s).map((o) => [cleEcart(o.projet, o), o]));
    const actuels = new Map(sorties.flatMap((x) => x.ecarts.map((e) => [cleEcart(x.projet, e), { ...e, projet: x.projet }])));
    const at = new Date().toISOString(); const evs = [];
    const ev = (kind, x) => ({ id: ulid(Date.parse(at)), at, kind, actor: 'system:audit', subject: x.projet, data: donneesEcart(x), classification: 'internal' });
    for (const [k, x] of actuels) if (!ouverts.has(k)) evs.push(ev('rule.violated', x));
    for (const [k, o] of ouverts) if (!actuels.has(k) && faits.has(`${o.projet ?? ''}|${o.controle}`)) evs.push(ev('rule.resolved', o));
    const r = s.journal.ajouter(evs);
    if (r.ajoutes) s.index.inserer(evs.map((e) => ({ ...e, site: s.config.site })), s.config.tarifs);
    journal = { apparus: evs.filter((e) => e.kind === 'rule.violated').length, resolus: evs.filter((e) => e.kind === 'rule.resolved').length, refuses: r.refuses.length };
  }
  return { cibles: sorties, journal };
}
