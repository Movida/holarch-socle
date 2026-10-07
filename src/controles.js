// Contrôles des règles (décision controles-de-regles, contrat règle §2) : du code du socle, désigné par un identifiant
// dans la règle (`check`), jamais une commande écrite dans l'arbre. Un contrôle reçoit un dépôt et un moment
// (`avant-commit` : les changements indexés ; `audit` : le contenu suivi) et rend ses écarts, ou « non disponible »
// avec la raison : il ne se dit jamais conforme sans avoir pu regarder. Un écart dit où il est, jamais ce qu'il a trouvé.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const git = (depot, args, o = {}) => spawnSync('git', ['-C', depot, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, ...o });
const TAILLE_MAX = 2 * 1024 * 1024;

// ---------- données personnelles ----------

/**
 * Liste privée d'un projet : déduite de la machine (identité git, dossier personnel, comptes Claude Code, noms des
 * projets non publics que déclare un contexte), complétée et amendée par le réglage `donnees_personnelles` de la règle
 * effective (`termes` : chaînes ou `{terme, pourquoi}` ; `exceptions` : `{terme, pourquoi}` retire un terme, `{fichier,
 * pourquoi}` soustrait un fichier du contrôle). Le nom du projet lui-même n'en fait jamais partie.
 */
export function listePrivee({ depot, config = {}, comptes = [], projetsPrives = [], nomProjet = null }) {
  const lireGit = (cle) => (git(depot, ['config', '--get', cle]).stdout || '').trim();
  const valeur = (x) => String(typeof x === 'object' && x ? x.terme ?? '' : x ?? '').trim();
  const reglage = config.donnees_personnelles || {};
  const termes = [lireGit('user.name'), lireGit('user.email'), os.userInfo().username, os.homedir(),
    ...comptes.map((c) => c.home).filter(Boolean), ...projetsPrives, ...[].concat(reglage.termes || []).map(valeur)];
  const exclus = new Set([nomProjet, ...[].concat(reglage.exceptions || []).filter((x) => !x?.fichier).map(valeur)].filter(Boolean).map((t) => t.toLowerCase()));
  return [...new Set(termes.map((t) => t.trim()).filter((t) => t.length >= 3 && !exclus.has(t.toLowerCase())))];
}

/** Fichiers soustraits au contrôle des données personnelles (`exceptions: [{fichier, pourquoi}]`), chemins du dépôt. */
export const fichiersExclus = (config = {}) => [].concat(config.donnees_personnelles?.exceptions || []).filter((x) => x?.fichier).map((x) => String(x.fichier));

/** Un chercheur de termes en mots entiers, sans casse ; null si la liste est vide. */
export function chercheur(termes) {
  if (!termes.length) return null;
  const alt = [...termes].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt})(?![\\p{L}\\p{N}_])`, 'iu');
  return (texte) => re.test(texte);
}

// Lignes ajoutées par les changements indexés : [{ fichier, ligne, texte }].
function lignesAjoutees(depot) {
  const r = git(depot, ['diff', '--cached', '-U0', '--no-color', '--no-ext-diff', '--diff-filter=ACMR']);
  if (r.status !== 0) throw new Error((r.stderr || '').trim() || 'git diff en échec');
  const out = []; let fichier = null; let n = 0;
  for (const l of r.stdout.split('\n')) {
    if (l.startsWith('+++ ')) { fichier = l === '+++ /dev/null' ? null : l.slice(6); continue; }
    const h = l.match(/^@@ -\S+ \+(\d+)(?:,\d+)? @@/);
    if (h) { n = +h[1]; continue; }
    if (fichier && l.startsWith('+')) out.push({ fichier, ligne: n++, texte: l.slice(1) });
  }
  return out;
}

const listeZ = (r) => (r.stdout || '').split('\0').filter(Boolean);

// Un écart par fichier : première ligne trouvée, nombre de lignes.
function parFichier(trouves, message) {
  const m = new Map();
  for (const t of trouves) {
    const e = m.get(t.fichier);
    if (e) e.n++; else m.set(t.fichier, { fichier: t.fichier, ligne: t.ligne ?? null, cle: t.fichier, n: 1, message });
  }
  return [...m.values()];
}

function donneesPersonnelles(ctx, moment) {
  const trouve = chercheur(ctx.termes || []);
  if (!trouve) return { indisponible: 'liste privée vide' };
  const trouves = []; const exclu = new Set(fichiersExclus(ctx.config));
  if (moment === 'avant-commit') {
    for (const f of listeZ(git(ctx.depot, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']))) if (!exclu.has(f) && trouve(f)) trouves.push({ fichier: f, ligne: null });
    for (const l of lignesAjoutees(ctx.depot)) if (!exclu.has(l.fichier) && trouve(l.texte)) trouves.push(l);
  } else {
    const r = git(ctx.depot, ['ls-files', '-z']);
    if (r.status !== 0) return { indisponible: 'pas un dépôt git' };
    for (const f of listeZ(r).filter((x) => !exclu.has(x))) {
      if (trouve(f)) trouves.push({ fichier: f, ligne: null });
      let texte; try { const p = path.join(ctx.depot, f); if (fs.statSync(p).size > TAILLE_MAX) continue; texte = fs.readFileSync(p, 'utf8'); } catch { continue; }
      if (texte.includes('\0')) continue;
      texte.split('\n').forEach((l, i) => { if (trouve(l)) trouves.push({ fichier: f, ligne: i + 1 }); });
    }
  }
  return { ecarts: parFichier(trouves, 'terme de la liste privée') };
}

// ---------- secrets (gitleaks) ----------

/** Chemin de gitleaks : réglage du site, sinon le PATH, sinon ~/.local/bin ; null s'il est absent. */
export function trouverGitleaks(reglage = null) {
  if (reglage) return fs.existsSync(reglage) ? reglage : null;
  const r = spawnSync('sh', ['-c', 'command -v gitleaks'], { encoding: 'utf8' });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  const l = path.join(os.homedir(), '.local', 'bin', 'gitleaks');
  return fs.existsSync(l) ? l : null;
}

function gitleaks(bin, args) {
  const r = spawnSync(bin, [...args, '--redact', '--no-banner', '--log-level', 'error', '--report-format', 'json', '--report-path', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  // 0 : rien trouvé ; 1 : des fuites, listées en JSON. Tout le reste est une panne, jamais un « rien trouvé ».
  if (r.status === 0 || r.status === 1) {
    try { const l = JSON.parse(r.stdout || (r.status === 0 ? '[]' : '')); if (Array.isArray(l) && (r.status === 0 || l.length)) return { trouves: l }; } catch { /* sortie illisible */ }
  }
  return { indisponible: `gitleaks en échec : ${(r.stderr || r.error?.message || `code ${r.status}`).trim().split('\n')[0]}` };
}

function secrets(ctx, moment) {
  if (!ctx.gitleaks) return { indisponible: 'gitleaks absent (réglage controles.gitleaks, PATH ou ~/.local/bin)' };
  let r; let base = '';
  if (moment === 'avant-commit') r = gitleaks(ctx.gitleaks, ['git', '--pre-commit', '--staged', ctx.depot]);
  else {
    // Le contenu suivi au dernier commit, exporté : ni les fichiers ignorés, ni l'historique.
    if (git(ctx.depot, ['rev-parse', '--verify', '-q', 'HEAD']).status !== 0) return { ecarts: [] };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-secrets-'));
    try {
      const a = spawnSync('git', ['-C', ctx.depot, 'archive', '--format=tar', 'HEAD'], { maxBuffer: 1024 * 1024 * 1024 });
      if (a.status !== 0 || spawnSync('tar', ['-x', '-C', tmp], { input: a.stdout }).status !== 0) return { indisponible: 'export du dépôt en échec' };
      base = tmp; r = gitleaks(ctx.gitleaks, ['dir', tmp]);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  if (r.indisponible) return r;
  return { ecarts: r.trouves.map((t) => {
    const fichier = base ? path.relative(base, t.File) : t.File;
    return { fichier, ligne: t.StartLine ?? null, cle: `${fichier}:${t.RuleID}`, n: 1, message: `secret possible (${t.RuleID})` };
  }) };
}

// ---------- journal tenu ----------

const JOURS = 30;

function journalTenu(ctx) {
  const journal = ctx.config?.journal;
  if (!journal) return { indisponible: 'réglage journal absent (chemin du journal du projet, dans sa racine)' };
  const f = path.join(ctx.depot, journal);
  if (!fs.existsSync(f)) return { indisponible: `journal introuvable : ${journal}` };
  const notes = new Set([...fs.readFileSync(f, 'utf8').matchAll(/^#{1,6}\s.*?(\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]));
  const arbre = path.relative(ctx.depot, ctx.arbre || ctx.depot) || '.';
  const r = git(ctx.depot, ['log', `--since=${JOURS}.days`, '--format=%ad', '--date=short', '--', arbre, `:(exclude)${journal}`]);
  if (r.status !== 0) return { indisponible: 'pas un dépôt git' };
  const jours = new Map();
  for (const d of r.stdout.split('\n').filter(Boolean)) jours.set(d, (jours.get(d) || 0) + 1);
  return { ecarts: [...jours].filter(([d]) => !notes.has(d)).sort().map(([d, n]) => ({ fichier: journal, ligne: null, cle: `jour:${d}`, n,
    message: `${n} commit(s) changent l'arbre le ${d}, sans entrée de ce jour au journal` })) };
}

/** Registre : identifiant → { moments, executer(ctx, moment) }. */
export const CONTROLES = {
  'donnees-personnelles': { moments: ['avant-commit', 'audit'], executer: donneesPersonnelles },
  secrets: { moments: ['avant-commit', 'audit'], executer: secrets },
  'journal-tenu': { moments: ['audit'], executer: journalTenu },
};

/** Exécute un contrôle ; une erreur le rend non disponible, jamais conforme. */
export function executer(id, ctx, moment) {
  const c = CONTROLES[id];
  if (!c) return { indisponible: `contrôle inconnu : ${id}` };
  if (!c.moments.includes(moment)) return { ecarts: [], hors_moment: true };
  if (!ctx.depot || !fs.existsSync(ctx.depot)) return { indisponible: 'dépôt absent de ce site' };
  try { return c.executer(ctx, moment); } catch (e) { return { indisponible: e.message.split('\n')[0] }; }
}
