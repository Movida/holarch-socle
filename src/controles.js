// Contrôles des règles (décision controles-de-regles, contrat règle §2) : du code du socle, désigné par un identifiant
// dans la règle (`check`), jamais une commande écrite dans l'arbre. Un contrôle reçoit un dépôt et un moment
// (`avant-commit` : les changements indexés ; `audit` : le contenu suivi) et rend ses écarts, ou « non disponible »
// avec la raison : il ne se dit jamais conforme sans avoir pu regarder. Un écart dit où il est, jamais ce qu'il a trouvé.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { git, trouverOutil, lireJson, ecrireJson } from './commun.js';

// Réglages de l'audit (`controles:` de la configuration du site), avec leurs défauts.
const reglage = (ctx, cle, defaut) => ctx.reglages?.[cle] ?? defaut;

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
      let texte; try { const p = path.join(ctx.depot, f); if (fs.statSync(p).size > reglage(ctx, 'taille_max_mo', 2) * 1024 * 1024) continue; texte = fs.readFileSync(p, 'utf8'); } catch { continue; }
      if (texte.includes('\0')) continue;
      texte.split('\n').forEach((l, i) => { if (trouve(l)) trouves.push({ fichier: f, ligne: i + 1 }); });
    }
  }
  return { ecarts: parFichier(trouves, 'terme de la liste privée') };
}

// ---------- secrets (gitleaks) ----------

export { trouverOutil } from './commun.js';

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
      const a = git(ctx.depot, ['archive', '--format=tar', 'HEAD'], { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 });
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

// ---------- résultats gardés une journée (sources réseau interrogées une fois par jour) ----------

function garde(ctx, nom, empreinte, calcul) {
  const f = ctx.cache ? path.join(ctx.cache, `${nom}.json`) : null;
  const c = f && lireJson(f);
  if (c?.empreinte === empreinte && Date.now() - Date.parse(c.at) < reglage(ctx, 'cache_heures', 24) * 3600e3) return c.resultat;
  const resultat = calcul();
  if (f && !resultat.indisponible) ecrireJson(f, { at: new Date().toISOString(), empreinte, resultat });
  return resultat;
}
const hacher = (...x) => createHash('sha256').update(x.join('\0')).digest('hex').slice(0, 16);

// ---------- dépendances vulnérables (osv-scanner) ----------

const VERROUS = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|uv\.lock|poetry\.lock|Pipfile\.lock|requirements[^/]*\.txt|go\.sum|Cargo\.lock|Gemfile\.lock|composer\.lock)$/;
const GRAVITE_DECLAREE = { CRITICAL: 9, HIGH: 7, MODERATE: 4, MEDIUM: 4, LOW: 1 };

function dependancesVulnerables(ctx) {
  if (!ctx.osv) return { indisponible: 'osv-scanner absent (réglage controles.osv_scanner, PATH ou ~/.local/bin)' };
  const r = git(ctx.depot, ['ls-files', '-z']);
  if (r.status !== 0) return { indisponible: 'pas un dépôt git' };
  const verrous = listeZ(r).filter((f) => VERROUS.test(f) && fs.existsSync(path.join(ctx.depot, f)));
  if (!verrous.length) return { ecarts: [] };
  const seuil = +(ctx.config?.dependances?.seuil_cvss ?? 7);
  const empreinte = hacher(seuil, ...verrous.map((f) => `${f}:${fs.readFileSync(path.join(ctx.depot, f)).length}:${hacher(fs.readFileSync(path.join(ctx.depot, f), 'utf8'))}`));
  return garde(ctx, `osv-${hacher(ctx.depot)}`, empreinte, () => {
    const o = spawnSync(ctx.osv, ['scan', 'source', ...verrous.flatMap((f) => ['-L', f]), '--format', 'json'], { cwd: ctx.depot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: reglage(ctx, 'delai_osv_s', 300) * 1e3 });
    if (o.status === 128) return { ecarts: [] };
    let d; try { if (o.status === 0 || o.status === 1) d = JSON.parse(o.stdout); } catch { /* sortie illisible */ }
    if (!d) return { indisponible: `osv-scanner en échec : ${(o.stderr || o.error?.message || `code ${o.status}`).trim().split('\n').at(-1)}` };
    const ecarts = [];
    for (const res of d.results || []) {
      const fichier = path.relative(ctx.depot, path.resolve(ctx.depot, res.source?.path || ''));
      for (const p of res.packages || []) {
        const gravites = (p.groups || []).map((g) => {
          let n = parseFloat(g.max_severity);
          if (Number.isNaN(n)) n = Math.max(-1, ...(p.vulnerabilities || []).filter((v) => g.ids?.includes(v.id)).map((v) => GRAVITE_DECLAREE[String(v.database_specific?.severity || '').toUpperCase()] ?? -1));
          return { id: g.ids?.[0], n };
        }).filter((g) => g.n >= seuil).sort((a, b) => b.n - a.n);
        if (!gravites.length) continue;
        ecarts.push({ fichier, ligne: null, cle: `${fichier}:${p.package.name}@${p.package.version}`, n: gravites.length,
          message: `${gravites.length} faille(s) de gravité ≥ ${seuil} dans ${p.package.name} ${p.package.version} (pire ${gravites[0].n}, ${gravites[0].id})` });
      }
    }
    return { ecarts };
  });
}

// ---------- outils à jour (portée site) ----------

const version = (t) => String(t || '').match(/(\d+)\.(\d+)\.(\d+)/)?.slice(1).map(Number) || null;
const avant = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const telecharger = (url, delai = 20) => {
  const r = spawnSync('curl', ['-sSfL', '--max-time', String(delai), '-H', 'Accept: application/json', url], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${url} : ${(r.stderr || `code ${r.status}`).trim()}`);
  return JSON.parse(r.stdout);
};

/** Dernière version publiée d'un outil : publication GitHub (`github: propriétaire/dépôt`) ou dernière LTS de node. */
export function versionPubliee(o, lire = telecharger, reglages = {}) {
  if (o.github) return lire(`${reglages.url_github ?? 'https://api.github.com'}/repos/${o.github}/releases/latest`).tag_name;
  if (o.node === 'lts') return lire(reglages.url_node ?? 'https://nodejs.org/dist/index.json').find((x) => x.lts)?.version;
  throw new Error(`source de version inconnue pour ${o.nom}`);
}

function outilsAJour(ctx) {
  const outils = [].concat(ctx.config?.outils_surveilles || []).filter((o) => o?.nom);
  if (!outils.length) return { indisponible: 'réglage outils_surveilles absent' };
  let publiees;
  try {
    publiees = ctx.publiees || garde(ctx, 'versions-publiees', hacher(JSON.stringify(outils)), () => ({ versions: Object.fromEntries(outils.map((o) => [o.nom, versionPubliee(o, (u) => telecharger(u, reglage(ctx, 'delai_http_s', 20)), ctx.reglages || {})])) })).versions;
  } catch (e) { return { indisponible: `version publiée introuvable : ${e.message.split('\n')[0]}` }; }
  const ecarts = [];
  for (const o of outils) {
    const pub = version(publiees[o.nom]);
    if (!pub) return { indisponible: `version publiée illisible pour ${o.nom}` };
    // Même recherche que pour les autres outils (PATH, puis ~/.local/bin) : un service au PATH réduit voit le même poste.
    const cmd = [].concat(o.commande || [o.nom]).map(String);
    const bin = cmd[0].includes('/') ? cmd[0] : trouverOutil(cmd[0]);
    const r = bin ? spawnSync(bin, cmd.slice(1), { encoding: 'utf8', timeout: 20e3 }) : { error: true };
    const inst = version(`${r.stdout || ''} ${r.stderr || ''}`);
    if (r.error || !inst) ecarts.push({ fichier: null, ligne: null, cle: o.nom, message: `${o.nom} introuvable sur ce site` });
    else if (avant(inst, pub) < 0) ecarts.push({ fichier: null, ligne: null, cle: o.nom, message: `${o.nom} ${inst.join('.')} installé, ${pub.join('.')} publié` });
  }
  return { ecarts };
}

// ---------- identité de commit (décision identite-par-contexte) ----------

/** Identité déclarée par la configuration effective (`identite: {nom, email}`), ou null si elle manque ou est incomplète. */
export function identiteDeclaree(config = {}) {
  const i = config.identite;
  return i?.nom && i?.email ? { nom: String(i.nom).trim(), email: String(i.email).trim() } : null;
}
/** Même identité : nom identique, adresse sans casse. */
export const memeIdentite = (a, b) => a.nom === b.nom && a.email.toLowerCase() === b.email.toLowerCase();

// Avant un commit, son auteur (`--author` et variables d'environnement compris) ; à l'audit, l'identité que git
// prendrait dans ce dépôt (réglage local, `includeIf` ou global). Un écart dit ce qui diffère, jamais les valeurs.
function identiteDeCommit(ctx, moment) {
  const voulue = identiteDeclaree(ctx.config);
  if (!voulue) return { indisponible: 'réglage identite absent ou incomplet ({nom, email})' };
  if (!ctx.declare) return { indisponible: 'projet déclaré par aucun contexte : identité non gardée' };
  let vue; let ou;
  if (moment === 'avant-commit') {
    const r = git(ctx.depot, ['var', 'GIT_AUTHOR_IDENT']);
    const m = (r.stdout || '').match(/^(.*) <([^>]*)>/);
    if (r.status !== 0 || !m) return { indisponible: 'auteur du commit illisible' };
    vue = { nom: m[1].trim(), email: m[2].trim() }; ou = 'auteur du commit';
  } else {
    const lire = (cle) => (git(ctx.depot, ['config', '--get', cle]).stdout || '').trim();
    vue = { nom: lire('user.name'), email: lire('user.email') }; ou = 'identité git du dépôt';
  }
  if (memeIdentite(vue, voulue)) return { ecarts: [] };
  const quoi = [vue.nom !== voulue.nom && 'nom', vue.email.toLowerCase() !== voulue.email.toLowerCase() && 'adresse'].filter(Boolean).join(' et ');
  return { ecarts: [{ fichier: null, ligne: null, cle: 'identite', message: `${ou} : ne correspond pas à l'identité déclarée (${quoi})` }] };
}

// ---------- journal tenu ----------

function journalTenu(ctx) {
  const journal = ctx.config?.journal;
  if (!journal) return { indisponible: 'réglage journal absent (chemin du journal du projet, dans sa racine)' };
  const f = path.join(ctx.depot, journal);
  if (!fs.existsSync(f)) return { indisponible: `journal introuvable : ${journal}` };
  const notes = new Set([...fs.readFileSync(f, 'utf8').matchAll(/^#{1,6}\s.*?(\d{4}-\d{2}-\d{2})/gm)].map((m) => m[1]));
  const arbre = path.relative(ctx.depot, ctx.arbre || ctx.depot) || '.';
  const r = git(ctx.depot, ['log', `--since=${reglage(ctx, 'journal_jours', 30)}.days`, '--format=%ad', '--date=short', '--', arbre, `:(exclude)${journal}`]);
  if (r.status !== 0) return { indisponible: 'pas un dépôt git' };
  const jours = new Map();
  for (const d of r.stdout.split('\n').filter(Boolean)) jours.set(d, (jours.get(d) || 0) + 1);
  return { ecarts: [...jours].filter(([d]) => !notes.has(d)).sort().map(([d, n]) => ({ fichier: journal, ligne: null, cle: `jour:${d}`, n,
    message: `${n} commit(s) changent l'arbre le ${d}, sans entrée de ce jour au journal` })) };
}

/**
 * Registre : identifiant → { moments, executer(ctx, moment), portee }. Un contrôle de portée `site` regarde le poste, pas
 * un dépôt : il s'exécute une fois, au compte.
 */
export const CONTROLES = {
  'donnees-personnelles': { moments: ['avant-commit', 'audit'], executer: donneesPersonnelles },
  secrets: { moments: ['avant-commit', 'audit'], executer: secrets },
  'journal-tenu': { moments: ['audit'], executer: journalTenu },
  'identite-de-commit': { moments: ['avant-commit', 'audit'], executer: identiteDeCommit },
  'dependances-vulnerables': { moments: ['audit'], executer: dependancesVulnerables },
  'outils-a-jour': { moments: ['audit'], executer: outilsAJour, portee: 'site' },
};

/** Exécute un contrôle ; une erreur le rend non disponible, jamais conforme. */
export function executer(id, ctx, moment) {
  const c = CONTROLES[id];
  if (!c) return { indisponible: `contrôle inconnu : ${id}` };
  if (!c.moments.includes(moment)) return { ecarts: [], hors_moment: true };
  if (c.portee !== 'site' && (!ctx.depot || !fs.existsSync(ctx.depot))) return { indisponible: 'dépôt absent de ce site' };
  try { return c.executer(ctx, moment); } catch (e) { return { indisponible: e.message.split('\n')[0] }; }
}
