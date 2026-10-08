// Outils communs aux adaptateurs d'inventaire.
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { git as gitCommun } from '../commun.js';

/**
 * En-tête YAML d'un fichier Markdown (`---` … `---`) : { entete, erreur }. Sans en-tête, `entete` est {} et `erreur`
 * null ; un en-tête présent mais illisible (YAML invalide, autre chose qu'un objet) le dit dans `erreur`. Ne lève jamais.
 */
export function lireEnTete(fichier) {
  let t;
  try { t = fs.readFileSync(fichier, 'utf8'); } catch (e) { return { entete: {}, erreur: `fichier illisible : ${e.code || e.message}` }; }
  const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return { entete: {}, erreur: null };
  try {
    const h = YAML.parse(m[1]);
    if (h == null) return { entete: {}, erreur: null };
    return typeof h === 'object' && !Array.isArray(h) ? { entete: h, erreur: null } : { entete: {}, erreur: 'en-tête illisible : un objet est attendu' };
  } catch (e) { return { entete: {}, erreur: `en-tête illisible : ${e.message.split('\n')[0]}` }; }
}

/** En-tête YAML d'un fichier Markdown, ou {} (absent ou illisible). */
export const enTete = (fichier) => lireEnTete(fichier).entete;

export const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/._-]+/g, '-').replace(/^-+|-+$/g, '');

export { lireJson } from '../commun.js';

export const liste = (d, filtre = () => true) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(filtre); } catch { return []; } };

// Sortie de git pour l'inventaire : texte nettoyé, ou null (dépôt absent, commande en échec, délai dépassé).
export function git(depot, args) {
  const r = gitCommun(depot, args, { timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** URL sans identifiants ni paramètres : une fiche ne porte jamais de secret. */
export function urlSure(u) {
  if (!u) return null;
  try { const x = new URL(u); x.username = ''; x.password = ''; x.search = ''; return x.toString(); } catch { return String(u).replace(/\/\/[^@/]+@/, '//'); }
}

export const mtimeIso = (f) => { try { return fs.statSync(f).mtime.toISOString(); } catch { return null; } };

export const premiereLigne = (t, n = 160) => {
  const l = t ? String(t).split('\n').find((x) => x.trim())?.trim() : null;
  if (!l) return null;
  return l.length <= n ? l : `${l.slice(0, n - 1).replace(/\s+\S*$/, '')}…`; // coupe à la fin d'un mot, et le dit
};

export const relatif = (base, p) => path.relative(base, p) || '.';
