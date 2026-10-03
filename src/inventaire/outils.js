// Outils communs aux adaptateurs d'inventaire.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';

/** En-tête YAML d'un fichier Markdown (`---` … `---`), ou {} ; ne lève jamais. */
export function enTete(fichier) {
  try {
    const t = fs.readFileSync(fichier, 'utf8');
    const m = t.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return {};
    return YAML.parse(m[1]) || {};
  } catch { return {}; }
}

export const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9/._-]+/g, '-').replace(/^-+|-+$/g, '');

export const lireJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };

export const liste = (d, filtre = () => true) => { try { return fs.readdirSync(d, { withFileTypes: true }).filter(filtre); } catch { return []; } };

export function git(depot, args) {
  const r = spawnSync('git', ['-C', depot, ...args], { encoding: 'utf8', timeout: 10000 });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** URL sans identifiants ni paramètres : une fiche ne porte jamais de secret. */
export function urlSure(u) {
  if (!u) return null;
  try { const x = new URL(u); x.username = ''; x.password = ''; x.search = ''; return x.toString(); } catch { return String(u).replace(/\/\/[^@/]+@/, '//'); }
}

export const mtimeIso = (f) => { try { return fs.statSync(f).mtime.toISOString(); } catch { return null; } };

export const premiereLigne = (t, n = 160) => (t ? String(t).split('\n').find((l) => l.trim())?.trim().slice(0, n) ?? null : null);

export const relatif = (base, p) => path.relative(base, p) || '.';
