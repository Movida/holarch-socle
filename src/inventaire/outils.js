// Outils communs aux adaptateurs d'inventaire.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { gitLu, lireSansLien, lireFichier } from '../commun.js';

// Un fichier à en-tête (nœud d'arbre, skill, agent, mémoire) : mesure du 2026-10-13, 416 fichiers sous l'accueil de
// l'auteur, le plus gros de 152 430 octets (une spécification d'étape).
const EN_TETE_MAX = 4 * 1024 * 1024;

// Ce que `lireSansLien` ou `lireFichier` (`suivre` : un lien se suit) ne dit pas quand il ne rend rien : le code de
// l'erreur, sinon ce qu'est le fichier.
function illisible(p, suivre) {
  try {
    const s = suivre ? fs.statSync(p) : fs.lstatSync(p);
    if (!s.isFile()) return 'pas un fichier';
    if (s.size > EN_TETE_MAX) return `plus de ${EN_TETE_MAX} octets`;
    fs.accessSync(p, fs.constants.R_OK); return 'ne se lit pas';
  } catch (e) { return e.code || e.message; }
}

/**
 * En-tête YAML d'un fichier Markdown (`---` … `---`) : { entete, erreur }. Sans en-tête, `entete` est {} et `erreur`
 * null ; un en-tête présent mais illisible (YAML invalide, autre chose qu'un objet) le dit dans `erreur`, avec les
 * `indices` lus ligne à ligne (`type`, `id`) : ce que le nœud pouvait être. `depot` : le dépôt du fichier, d'où il se lit
 * par `lireSansLien` : un lien symbolique sur son chemin n'est pas suivi, même posé après la vérification, ni ce qui
 * n'est pas un fichier (un FIFO bloquerait l'inventaire), ni au-delà de EN_TETE_MAX ; le fichier est dit illisible,
 * avec la raison. Sans `depot` (le compte), un lien se suit (`lireFichier`), le reste est pareil. Ne lève jamais.
 */
export function lireEnTete(fichier, depot = null) {
  let t;
  try { t = depot ? lireSansLien(depot, path.relative(depot, fichier), { max: EN_TETE_MAX }) : lireFichier(fichier, { max: EN_TETE_MAX }); } catch (e) { return { entete: {}, erreur: `fichier illisible : ${e.code || e.message}` }; }
  if (t === null) return { entete: {}, erreur: `fichier illisible : ${illisible(fichier, !depot)}` };
  const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { entete: {}, erreur: null };
  try {
    const h = YAML.parse(m[1]);
    if (h == null) return { entete: {}, erreur: null };
    return typeof h === 'object' && !Array.isArray(h) ? { entete: h, erreur: null } : { entete: {}, erreur: 'en-tête illisible : un objet est attendu', indices: indices(m[1]) };
  } catch (e) { return { entete: {}, erreur: `en-tête illisible : ${e.message.split('\n')[0]}`, indices: indices(m[1]) }; }
}

// `type` et `id` d'un en-tête illisible, lus ligne à ligne (commentaire et guillemets ôtés) ; absents s'ils ne se lisent
// pas, ou s'ils prennent plusieurs valeurs (un conflit de fusion) : rien ne permet alors de conclure.
function indices(texte) {
  const vus = { type: new Set(), id: new Set() };
  for (const [, cle, v] of texte.matchAll(/^(type|id):[ \t]*(.*?)[ \t]*$/gm)) {
    const x = v.replace(/(^|[ \t])#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2');
    if (x) vus[cle].add(x);
  }
  return Object.fromEntries(Object.entries(vus).filter(([, s]) => s.size === 1).map(([k, s]) => [k, [...s][0]]));
}

/** En-tête YAML d'un fichier Markdown, ou {} (absent ou illisible, ou un lien symbolique dans `depot`). */
export const enTete = (fichier, depot = null) => lireEnTete(fichier, depot).entete;

export const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/._-]+/g, '-').replace(/^-+|-+$/g, '');

export { lireJson } from '../commun.js';

export const liste = (d, filtre = () => true) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(filtre); } catch { return []; } };

// Sortie de git pour l'inventaire (en lecture, `gitLu`) : texte nettoyé, ou null (dépôt absent, commande en échec, délai dépassé).
export function gitInventaire(depot, args) {
  const r = gitLu(depot, args, { timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * URL sans identifiants, paramètres ni fragment : une fiche ne porte jamais de secret. `origine` : schéma et hôte seuls,
 * pour l'URL d'un serveur, dont un jeton peut faire le chemin (`…/s/<jeton>/mcp`) ; le chemin d'un remote git
 * (propriétaire et dépôt) reste.
 */
export function urlSure(u, { origine = false } = {}) {
  if (!u) return null;
  try {
    const x = new URL(u);
    if (origine) return x.host ? `${x.protocol}//${x.host}` : x.protocol;
    x.username = ''; x.password = ''; x.search = ''; x.hash = ''; return x.toString();
  } catch {
    const t = String(u).replace(/\/\/[^@/]+@/, '//');
    return origine ? t.match(/^(?:[^/?#]*\/\/)?[^/?#]*/)[0] : t;
  }
}

/**
 * Un mot qui a l'allure d'un jeton : au moins 16 caractères, des chiffres, et une entropie d'au moins 3,5 bits par
 * caractère (seuil de la règle générique de gitleaks 8.30.1). Mesure du 2026-10-13 sur les crochets posés du poste :
 * aucun de leurs 278 mots n'est pris pour un jeton.
 */
export function jeton(t) {
  const c = [...String(t)];
  if (c.length < 16 || !/\d/.test(t)) return false;
  const n = new Map(); for (const x of c) n.set(x, (n.get(x) || 0) + 1);
  let h = 0; for (const k of n.values()) h -= (k / c.length) * Math.log2(k / c.length);
  return h >= 3.5;
}

export const mtimeIso = (f) => { try { return fs.statSync(f).mtime.toISOString(); } catch { return null; } };

export const premiereLigne = (t, n = 160) => {
  const l = t ? String(t).split('\n').find((x) => x.trim())?.trim() : null;
  if (!l) return null;
  return l.length <= n ? l : `${l.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; // coupe à la fin d'un mot, et le dit
};

export const relatif = (base, p) => path.relative(base, p) || '.';
