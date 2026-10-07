// Contrôles et audit de conformité (étape 3, tranches 4 et 5 ; décisions controles-de-regles et
// veille-securite-versions). Le socle n'en garde que l'entrée : ces fonctions reçoivent le socle et lisent par lui.
import fs from 'node:fs';
import path from 'node:path';
import { comptesClaudeCode, accueil } from './config.js';
import { projetsDe, localiserProjet } from './projets.js';
import { regleEffective, regleDuCompte, projetsDeclares } from './regles.js';
import { listePrivee, executer, CONTROLES } from './controles.js';
import { trouverOutil } from './commun.js';
import { racineArbre } from './inventaire/arbre.js';
import { materialiserCompte, materialiserProjet } from './materialisation.js';
import { ulid } from './ulid.js';

// Un écart se reconnaît d'un audit à l'autre par son projet, sa règle, son contrôle et sa clé (jamais par son contenu).
const cleEcart = (projet, d) => [projet ?? '', d.regle, d.controle, d.cle].join('|');
const donneesEcart = (x) => ({ regle: x.regle, controle: x.controle, cle: x.cle, ...(x.fichier && { fichier: x.fichier }), ...(x.ligne && { ligne: x.ligne }), ...(x.n && { n: x.n }), ...(x.message && { message: x.message }) });
const comptesDe = (s) => comptesClaudeCode(s.config, s.config.inventaire?.['claude-code'] || {});

/** Ce qu'un contrôle reçoit pour un projet : son dépôt, la racine de son arbre, ses réglages, la liste privée, les outils. */
export function contexteControle(s, projet, r, depot = projet.location) {
  const noeuds = s.fiches({ kind: 'node' });
  const declares = projetsDeclares(noeuds);
  const publique = (id) => noeuds.some((n) => n.attributes?.racine && n.links?.project?.includes(id) && n.classification === 'public');
  const projetsPrives = s.fiches({ kind: 'project' }).filter((x) => declares.has(x.id) && !publique(x.id)).map((x) => x.name);
  const config = r.config || {}; const reglages = s.config.controles || {};
  return { depot, arbre: depot ? racineArbre(depot)?.dossier : null, config, reglages, cache: path.join(s.config.donnees, 'cache'),
    gitleaks: trouverOutil('gitleaks', reglages.gitleaks), osv: trouverOutil('osv-scanner', reglages.osv_scanner),
    termes: depot ? listePrivee({ depot, config, comptes: comptesDe(s), projetsPrives, nomProjet: projet.name }) : [] };
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
      etats.set(c, res.indisponible ? { id: c, etat: 'indisponible', raison: res.indisponible } : { id: c, etat: 'fait' });
      if (!res.indisponible) ecarts.push(...res.ecarts.map((x) => ({ regle: e.fiche, regle_id: e.id, enonce: e.enonce, controle: c, ...x })));
    }
  }
  return { ecarts, controles: [...etats.values()] };
}

/**
 * Garde avant commit (appelée par le crochet de git) : les règles bloquantes du projet du dépôt, sur les changements
 * indexés. { projet, refus: [{regle, enonce, ecarts}], indisponibles }.
 */
export function garde(s, { depot = process.cwd(), moment = 'avant-commit' } = {}) {
  const projets = s.fiches({ kind: 'project' });
  const p = localiserProjet(projetsDe(projets))(path.resolve(depot));
  if (!p) return { projet: null, refus: [], indisponibles: [] };
  const fiche = projets.find((x) => x.id === p.id);
  const r = regleEffective([...s.fiches({ kind: 'node' }), ...s.fiches({ kind: 'rule' })], p.id);
  const { ecarts, controles } = controler(r, contexteControle(s, fiche, r, path.resolve(depot)), moment, ['blocking']);
  const refus = new Map();
  for (const x of ecarts) { if (!refus.has(x.regle_id)) refus.set(x.regle_id, { regle: x.regle_id, enonce: x.enonce, ecarts: [] }); refus.get(x.regle_id).ecarts.push(x); }
  return { projet: p.id, refus: [...refus.values()], indisponibles: controles.filter((c) => c.etat === 'indisponible') };
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

function ecartsFichiers(regles, m, prefixe) {
  const regleDe = new Map(m.plan.fichiers.map((x) => [x.fichier, x.regle]));
  const e = (f, message) => { const id = regleDe.get(f) || f.replace(/\.md$/, ''); return { regle: regleNommee(regles, id), regle_id: id, controle: 'regles-a-jour', cle: f, fichier: `${prefixe}/${f}`, message }; };
  const d = m.fichiers;
  return [...d.crees.map((f) => e(f, 'fichier de règle absent')), ...d.modifies.map((f) => e(f, 'fichier de règle périmé')),
    ...d.retires.map((f) => e(f, 'fichier généré sans règle')), ...d.ignores.map((f) => e(f, 'fichier non marqué à la place d’une règle générée'))];
}

const ecartsPermissions = (m) => (m.permissions.ajoutees || []).map((x) => { const e = m.lectures.find((l) => l.entree === x).regle;
  return { regle: e.fiche, regle_id: e.id, controle: 'permissions-posees', cle: x, fichier: 'settings.json', message: 'lecture non refusée' }; });

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
  if (compte.regles.length) {
    const rc = { projet: null, nom: 'compte', ecarts: [], controles: [] };
    for (const m of materialiserCompte(compte.regles, comptesDe(s), { ecrire: false })) {
      rc.ecarts.push(...ecartsFichiers(compte.regles, m, 'rules/holarch'));
      if (m.permissions.erreur) rc.controles.push({ id: 'permissions-posees', etat: 'indisponible', raison: m.permissions.erreur });
      else rc.ecarts.push(...ecartsPermissions(m));
    }
    rc.ecarts.push(...remplacees(compte.regles, memoires));
    for (const c of ['regles-a-jour', 'permissions-posees', 'memoire-remplacee']) if (!rc.controles.some((x) => x.id === c)) faits.add(`|${c}`);
    // Contrôles de portée site (le poste lui-même), une fois, avec les réglages du compte.
    const site = controler(compte, { config: compte.config || {}, reglages: s.config.controles || {}, cache: path.join(s.config.donnees, 'cache') }, 'audit', ['blocking', 'verified'], 'site');
    rc.ecarts.push(...site.ecarts); rc.controles.push(...site.controles);
    for (const c of site.controles) if (c.etat === 'fait') faits.add(`|${c.id}`);
    sorties.push(rc);
  }

  // Projets.
  const cibles = projet ? [s.projetDe(projet)] : s.regles().projets.map((p) => p.id);
  for (const id of cibles) {
    const p = projets.find((x) => x.id === id); if (!p) continue;
    const r = regleEffective(fiches, id);
    const { ecarts, controles } = controler(r, contexteControle(s, p, r), 'audit', ['blocking', 'verified']);
    for (const c of controles) if (c.etat === 'fait') faits.add(`${id}|${c.id}`);
    const rp = { projet: id, nom: p.name, ecarts, controles };
    if (p.location && fs.existsSync(p.location)) {
      const m = materialiserProjet(r, p.location, { accueil: s.config.accueil || accueil(), ecrire: false });
      rp.ecarts.push(...ecartsFichiers(r.regles, m, '.claude/rules/holarch'), ...ecartsCrochet(m.crochet));
      faits.add(`${id}|regles-a-jour`); faits.add(`${id}|crochet-pose`);
    }
    rp.ecarts.push(...remplacees(r.regles.filter((e) => e.origine === 'type' || e.origine === 'projet'), memoires.filter((m) => m.links?.project?.includes(id))));
    faits.add(`${id}|memoire-remplacee`);
    sorties.push(rp);
  }

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
