// Contrôles des règles (décision controles-de-regles, contrat règle §2) : du code du socle, désigné par un identifiant
// dans la règle (`check`), jamais une commande écrite dans l'arbre. Un contrôle reçoit un dépôt et un moment
// (`avant-commit` : les changements indexés ; `audit` : le contenu suivi) et rend ses écarts, ou « non disponible »
// avec la raison : il ne se dit jamais conforme sans avoir pu regarder. Un écart dit où il est, jamais ce qu'il a trouvé.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse as parseJsonc, parseTree, findNodeAtLocation } from 'jsonc-parser';
import { gitLu, trouverOutil, lireJson, ecrireJson } from './commun.js';
import { etatDepot } from './inventaire/depots-git.js';
import { mecanisme, evaluer, fichierGardien, GARDIEN_FRAIS, fichierErreur, ERREUR_VUE_JOURS } from './veille.js';
import { etatVeille } from './distant.js';

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
  const lireGit = (cle) => (gitLu(depot, ['config', '--get', cle]).stdout || '').trim();
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
  const r = gitLu(depot, ['diff', '--cached', '-U0', '--no-color', '--diff-filter=ACMR']);
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
    for (const f of listeZ(gitLu(ctx.depot, ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR']))) if (!exclu.has(f) && trouve(f)) trouves.push({ fichier: f, ligne: null });
    for (const l of lignesAjoutees(ctx.depot)) if (!exclu.has(l.fichier) && trouve(l.texte)) trouves.push(l);
  } else {
    const r = gitLu(ctx.depot, ['ls-files', '-z']);
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

export function gitleaks(bin, args) {
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
    // Le contenu suivi au dernier commit, exporté : ni les fichiers ignorés, ni l'historique. Un dépôt que git ne lit
    // pas (dossier sans dépôt, dépôt abîmé, git absent) n'est pas contrôlé ; seul un dépôt sans commit n'a rien à lire.
    const depot = gitLu(ctx.depot, ['rev-parse', '--git-dir']);
    if (depot.status !== 0) return { indisponible: `dépôt illisible par git : ${(depot.stderr || depot.error?.message || `code ${depot.status}`).trim().split('\n')[0]}` };
    if (gitLu(ctx.depot, ['rev-parse', '--verify', '-q', 'HEAD']).status !== 0) return { ecarts: [] };
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-secrets-'));
    try {
      const a = gitLu(ctx.depot, ['archive', '--format=tar', 'HEAD'], { encoding: 'buffer', maxBuffer: 1024 * 1024 * 1024 });
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
  const r = gitLu(ctx.depot, ['ls-files', '-z']);
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
    const r = gitLu(ctx.depot, ['var', 'GIT_AUTHOR_IDENT']);
    const m = (r.stdout || '').match(/^(.*) <([^>]*)>/);
    if (r.status !== 0 || !m) return { indisponible: 'auteur du commit illisible' };
    vue = { nom: m[1].trim(), email: m[2].trim() }; ou = 'auteur du commit';
  } else {
    const lire = (cle) => (gitLu(ctx.depot, ['config', '--get', cle]).stdout || '').trim();
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
  const r = gitLu(ctx.depot, ['log', `--since=${reglage(ctx, 'journal_jours', 30)}.days`, '--format=%ad', '--date=short', '--', arbre, `:(exclude)${journal}`]);
  if (r.status !== 0) return { indisponible: 'pas un dépôt git' };
  const jours = new Map();
  for (const d of r.stdout.split('\n').filter(Boolean)) jours.set(d, (jours.get(d) || 0) + 1);
  return { ecarts: [...jours].filter(([d]) => !notes.has(d)).sort().map(([d, n]) => ({ fichier: journal, ligne: null, cle: `jour:${d}`, n,
    message: `${n} commit(s) changent l'arbre le ${d}, sans entrée de ce jour au journal` })) };
}

// ---------- commits poussés ----------

// Un commit resté local n'existe que sur ce site : ni le téléphone ni un conteneur ne le voient. Le délai laisse passer
// une session de travail, dont l'envoi attend souvent l'accord de l'auteur. Même lecture de l'amont que la reprise.
function commitsPousses(ctx) {
  const e = etatDepot(ctx.depot);
  if (!e.amont) return { indisponible: 'branche sans amont' };
  if (!e.en_avance) return { ecarts: [] };
  const h = reglage(ctx, 'non_pousses_heures', 4);
  const r = gitLu(ctx.depot, ['log', '--format=%ct', '@{upstream}..HEAD']);
  const plusAncien = Math.min(...(r.stdout || '').split('\n').filter(Boolean).map(Number));
  if (r.status !== 0 || !Number.isFinite(plusAncien)) return { indisponible: 'dates des commits illisibles' };
  if (Date.now() / 1000 - plusAncien < h * 3600) return { ecarts: [] };
  return { ecarts: [{ fichier: null, ligne: null, cle: 'amont', n: e.en_avance, message: `${e.en_avance} commit(s) non poussé(s) vers ${e.amont} depuis plus de ${h} h` }] };
}

// ---------- veille retardée (décision environnement-d-execution) ----------

/**
 * Le poste retarde sa veille sous une session distante : un mécanisme existe (Windows, vu de WSL) ; dès qu'un accès
 * distant est actif, le gardien tourne ; et quand une session notée retient la veille (une session reliée par
 * `/remote-control` aussi, sans accès distant), le gardien dit tenir la demande depuis moins de GARDIEN_FRAIS. Les
 * crochets qui notent les sessions sont vus par `reglages-poses`. `ctx.veille` remplace la lecture du poste (essais).
 */
function veilleRetardee(ctx) {
  const e = ctx.veille || { mecanisme: mecanisme(), ...etatVeille(), besoin: ctx.accueil ? evaluer({ accueil: ctx.accueil }).besoin : false,
    tenu: ctx.accueil ? lireJson(fichierGardien(ctx.accueil), null) : null, erreur: ctx.accueil ? lireJson(fichierErreur(ctx.accueil), null) : null };
  if (!e.mecanisme) return { indisponible: 'aucun mécanisme pour retarder la veille sur ce site (Windows, vu de WSL)' };
  const ecarts = [];
  if (e.distants && e.gardien !== 'actif') ecarts.push({ fichier: null, ligne: null, cle: 'gardien', message: `gardien de veille ${e.gardien} avec ${e.distants} accès distant(s) actif(s) : la veille n'est pas retardée` });
  const frais = e.tenu && Date.now() - Date.parse(e.tenu.maj) < GARDIEN_FRAIS;
  if (e.besoin && !(e.gardien === 'actif' && frais && e.tenu.tenue)) {
    ecarts.push({ fichier: null, ligne: null, cle: 'retenue', message: `une session distante retient la veille, mais la demande d'éveil n'est pas tenue (gardien ${e.gardien}${frais ? '' : ', sans passage récent'})` });
  }
  // Une erreur du crochet : des sessions ne sont peut-être pas notées. Dite par sa date et son événement (le message,
  // qui peut citer un chemin, reste dans le fichier).
  const t = Date.parse(e.erreur?.at);
  if (Number.isFinite(t) && Date.now() - t < ERREUR_VUE_JOURS * 864e5) {
    ecarts.push({ fichier: null, ligne: null, cle: 'crochet', message: `crochet de veille en erreur le ${e.erreur.at.slice(0, 16).replace('T', ' ')} UTC (${e.erreur.evenement || '?'}) : des sessions peuvent ne pas être notées ; détail dans veille-erreur.json de l'accueil HOLARCH` });
  }
  return { ecarts };
}

// ---------- montage sensible (décision modules-et-palliatifs, palliatif 7) ----------

// Ce qu'un conteneur ne monte jamais de l'hôte : les identifiants, même en lecture (le conteneur les lirait, et une
// configuration de Claude Code écrite depuis lui pose des crochets que l'hôte exécute), le Docker de l'hôte, et, en
// écriture, les données de HOLARCH. Un dossier qui en contient un compte comme lui (le dossier personnel entier expose
// `~/.ssh`).
const IDENTIFIANTS = ['.claude', '.claude.json', '.ssh', '.config/gh', '.aws', '.azure', '.config/gcloud', '.kube', '.docker', '.gnupg', '.netrc', '.git-credentials', '.npmrc'];
const DOCKER_HOTE = ['/var/run/docker.sock', '/run/docker.sock'];
const dedans = (a, b) => { const r = path.relative(b, a); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
const reel = (p) => { try { return fs.realpathSync(p); } catch { return p; } };

// Admis sous `~/.claude`, et seulement eux : le dossier de transcriptions et de mémoire du projet du conteneur, que
// Claude Code nomme d'après le dossier de travail (HOLARCH les importe, P4), et les règles du compte en lecture (l'arbre
// des règles atteint le conteneur ; écrites depuis lui, elles s'imposeraient aux sessions de l'hôte).
export const dossierClaude = (dossier) => dossier.replace(/[^a-zA-Z0-9]/g, '-');

// Dossier de travail du conteneur, résolu comme le CLI Dev Containers et normalisé ; null hors de `/workspaces/` (le
// dossier d'un projet de l'hôte, `-home-…`, porte une mémoire que les sessions de l'hôte chargent) ou quand Claude Code
// en tronquerait le nom (plus de 200 caractères, haché).
function dossierDeTravail(c, depot) {
  const s = String(c.workspaceFolder ?? `/workspaces/${path.basename(depot)}`)
    .replace(/\$\{localWorkspaceFolderBasename\}/g, path.basename(depot)).replace(/\$\{localWorkspaceFolder\}/g, depot);
  const n = path.posix.normalize(s).replace(/\/+$/, '');
  return !s.includes('${') && /^\/workspaces\/[^/]/.test(n) && dossierClaude(n).length <= 200 ? n : null;
}

const montagesAdmis = (c, depot, maison) => {
  const travail = dossierDeTravail(c, depot);
  return [...(travail ? [{ chemin: path.join(maison, '.claude', 'projects', dossierClaude(travail)) }] : []),
    { chemin: path.join(maison, '.claude', 'rules'), lecture: true, quoi: 'règles du compte, lues par les sessions de l’hôte' }];
};

// Fichiers de configuration d'un conteneur, aux emplacements de la spécification Dev Containers.
function configsConteneur(depot) {
  const dossier = path.join(depot, '.devcontainer');
  const sous = fs.existsSync(dossier) ? fs.readdirSync(dossier, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `.devcontainer/${d.name}/devcontainer.json`) : [];
  return ['.devcontainer.json', '.devcontainer/devcontainer.json', ...sous].filter((f) => fs.statSync(path.join(depot, f), { throwIfNoEntry: false })?.isFile());
}

// Les champs d'une ligne CSV, comme `encoding/csv` de Go qui lit `--mount` pour le CLI Docker (guillemets doubles,
// `""` pour un guillemet) ; null si la ligne est mal formée.
function champsCsv(t) {
  const champs = []; let i = 0;
  for (;;) {
    let v = '';
    if (t[i] === '"') {
      for (i++; ; i++) {
        if (i >= t.length) return null;
        if (t[i] === '"' && t[i + 1] === '"') { v += '"'; i++; } else if (t[i] === '"') { i++; break; } else v += t[i];
      }
      if (i < t.length && t[i] !== ',') return null;
    } else {
      const fin = t.indexOf(',', i) === -1 ? t.length : t.indexOf(',', i);
      v = t.slice(i, fin); i = fin;
      if (v.includes('"')) return null;
    }
    champs.push(v);
    if (i >= t.length) return champs;
    i++;
  }
}

// Booléens de Go (`strconv.ParseBool`), et les clés que le CLI Docker connaît en plus de type, source, cible et lecture.
const BOOLEENS = { 1: true, t: true, T: true, TRUE: true, true: true, True: true, 0: false, f: false, F: false, FALSE: false, false: false, False: false };
const AUTRES_CLES = new Set(['consistency', 'bind-propagation', 'bind-nonrecursive', 'bind-recursive', 'bind-create-src', 'volume-subpath',
  'volume-nocopy', 'volume-label', 'volume-driver', 'volume-opt', 'image-subpath', 'tmpfs-size', 'tmpfs-mode']);
const TYPES = new Set(['bind', 'volume', 'tmpfs', 'npipe', 'cluster', 'image']);

// Un montage écrit à la façon de `docker --mount`, lu comme le CLI Docker : CSV, clés et type sans casse, `volume` par
// défaut. Ce que Docker refuserait (clé ou type inconnus, booléen invalide, ligne mal formée) est `illisible` : le
// contrôle ne le dit pas conforme pour autant.
function montageTexte(t) {
  const m = { type: 'volume', source: null, cible: null, lecture: false };
  const champs = champsCsv(String(t).trim());
  if (!champs) return { ...m, illisible: true };
  for (const champ of champs) {
    const i = champ.indexOf('='); const cle = (i === -1 ? champ : champ.slice(0, i)).toLowerCase(); const val = i === -1 ? null : champ.slice(i + 1);
    if (cle === 'type' && val !== null) m.type = val.toLowerCase();
    else if ((cle === 'source' || cle === 'src') && val !== null) m.source = val;
    else if ((cle === 'target' || cle === 'dst' || cle === 'destination') && val !== null) m.cible = val;
    else if (cle === 'readonly' || cle === 'ro') { m.lecture = val === null ? true : BOOLEENS[val]; if (m.lecture === undefined) return { ...m, illisible: true }; }
    else if (!AUTRES_CLES.has(cle)) return { ...m, illisible: true };
  }
  return TYPES.has(m.type) ? m : { ...m, illisible: true };
}

// Un montage écrit en objet devient la ligne que le CLI Dev Containers passe à `--mount` (`generateMountCommand`).
const montageObjet = (m) => montageTexte(`type=${m.type},${m.source ? `src=${m.source},` : ''}dst=${m.target}`);

// Un `-v [source:]cible[:mode]`, lu comme le démon Docker sous Linux (`ParseMountRaw`) une fois les variables du CLI
// Dev Containers résolues : découpé aux `:` hors de `${…}` ; une seule partie est un volume anonyme ; une source absolue
// (ou `~`, `.`, une variable) est un chemin de l'hôte. Ce que Docker refuserait, ou un chemin Windows (`C:\…`), est
// `illisible`.
const MODES = new Set(['rw', 'ro', 'z', 'Z', 'nocopy', 'shared', 'rshared', 'slave', 'rslave', 'private', 'rprivate', 'delegated', 'cached', 'consistent']);
const auxDeuxPoints = (t) => { const parts = ['']; let dans = 0;
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '$' && t[i + 1] === '{') dans++; else if (t[i] === '}' && dans) dans--;
    if (t[i] === ':' && !dans) parts.push(''); else parts[parts.length - 1] += t[i];
  }
  return parts; };
function montageCourt(t) {
  const parts = auxDeuxPoints(String(t));
  const illisible = { type: 'volume', source: null, cible: null, lecture: false, illisible: true };
  if (!parts[0] || parts.length > 3 || (parts.length === 2 && parts[1].split(',').every((x) => MODES.has(x)))) return illisible;
  if (parts.length > 1 && /^[A-Za-z]$/.test(parts[0]) && /^[\\/]/.test(parts[1])) return illisible;
  if (parts.length === 1) return { type: 'volume', source: null, cible: parts[0], lecture: false };
  const [source, cible, mode = ''] = parts;
  return { type: /^[/~.$]/.test(source) ? 'bind' : 'volume', source, cible, lecture: mode.split(',').includes('ro') };
}

// Les options de `runArgs`, lues comme le CLI Docker (pflag) : `--nom=valeur` ou `--nom valeur`, options courtes
// groupées ou collées à leur valeur (`-itv /a:/b`, `-v/a:/b`, `-v=/a:/b`) ; chacune sous son nom long, avec sa place.
// Une option inconnue ne prend la suivante pour valeur que si celle-ci n'est pas une option.
const COURTES = { a: 'attach', c: 'cpu-shares', e: 'env', h: 'hostname', l: 'label', m: 'memory', p: 'publish', u: 'user', v: 'volume', w: 'workdir' };
const COURTES_BOOL = { d: 'detach', i: 'interactive', t: 'tty', P: 'publish-all', q: 'quiet' };
const LONGUES_BOOL = new Set(['detach', 'interactive', 'tty', 'privileged', 'rm', 'init', 'read-only', 'publish-all', 'quiet', 'oom-kill-disable',
  'no-healthcheck', 'sig-proxy', 'disable-content-trust', 'use-api-socket', 'help']);
function optionsDocker(args) {
  const l = []; const suivante = (i) => (i + 1 < args.length && !args[i + 1].startsWith('-') ? args[i + 1] : null);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const eg = a.indexOf('='); const nom = a.slice(2, eg === -1 ? undefined : eg);
      if (eg !== -1) l.push({ nom, val: a.slice(eg + 1), ou: i });
      else if (LONGUES_BOOL.has(nom) || suivante(i) === null) l.push({ nom, val: null, ou: i });
      else l.push({ nom, val: args[++i], ou: i });
    } else if (a.startsWith('-') && a.length > 1) {
      for (let k = 1; k < a.length; k++) {
        if (COURTES_BOOL[a[k]]) { l.push({ nom: COURTES_BOOL[a[k]], val: null, ou: i }); continue; }
        const nom = COURTES[a[k]] || a[k]; const reste = a.slice(k + 1).replace(/^=/, '');
        if (reste) l.push({ nom, val: reste, ou: i });
        else if (suivante(i) !== null) l.push({ nom, val: args[++i], ou: i });
        else l.push({ nom, val: null, ou: i });
        break;
      }
    }
  }
  return l;
}

// Les montages d'une configuration (ou d'une feature), chacun avec son chemin dans le fichier (pour la ligne).
function montagesDe(c, opts) {
  const l = []; const sansValeur = { type: 'volume', source: null, cible: null, lecture: false, illisible: true };
  (Array.isArray(c.mounts) ? c.mounts : []).forEach((m, i) => l.push({ ou: ['mounts', i], ...(m && typeof m === 'object' ? montageObjet(m) : montageTexte(m)) }));
  if (c.workspaceMount) l.push({ ou: ['workspaceMount'], ...montageTexte(c.workspaceMount) });
  for (const o of opts.filter((x) => x.nom === 'volume' || x.nom === 'mount')) {
    l.push({ ou: ['runArgs', o.ou], ...(o.val === null ? sansValeur : o.nom === 'volume' ? montageCourt(o.val) : montageTexte(o.val)) });
  }
  return l;
}

// Ce qui défait l'isolement sans monter de fichier : un conteneur privilégié ou doté de capacités voit les périphériques
// et remonte ce qu'il veut (les règles montées en lecture comprises) ; un périphérique, un espace de noms de l'hôte, une
// protection retirée, les montages d'un autre conteneur, le socket Docker. Propriétés du fichier et options de `runArgs`.
const PROTECTION_RETIREE = /unconfined|label[=:]disable|no-new-privileges[=:]false/i;
function privilegesDe(c, opts) {
  const l = []; const p = (ou, cle, quoi) => l.push({ ou, cle, quoi });
  if (c.privileged === true) p(['privileged'], 'privileged', 'conteneur privilégié : périphériques et capacités de l’hôte');
  (Array.isArray(c.capAdd) ? c.capAdd : []).forEach((x, i) => p(['capAdd', i], `cap-add:${x}`, `capacité ${x} ajoutée`));
  (Array.isArray(c.securityOpt) ? c.securityOpt : []).forEach((x, i) => PROTECTION_RETIREE.test(x) && p(['securityOpt', i], `security-opt:${x}`, `protection retirée (${x})`));
  for (const o of opts) {
    const ou = ['runArgs', o.ou];
    if (o.nom === 'privileged' && (o.val === null || BOOLEENS[o.val] !== false)) p(ou, 'privileged', 'conteneur privilégié : périphériques et capacités de l’hôte');
    else if (o.nom === 'cap-add') p(ou, `cap-add:${o.val}`, `capacité ${o.val} ajoutée`);
    else if (o.nom === 'device') p(ou, `device:${o.val}`, `périphérique de l’hôte (${o.val})`);
    else if (['pid', 'ipc', 'uts', 'userns', 'cgroupns'].includes(o.nom) && o.val === 'host') p(ou, `${o.nom}:host`, `espace de noms de l’hôte (--${o.nom}=host)`);
    else if (o.nom === 'security-opt' && PROTECTION_RETIREE.test(o.val || '')) p(ou, `security-opt:${o.val}`, `protection retirée (${o.val})`);
    else if (o.nom === 'volumes-from') p(ou, `volumes-from:${o.val}`, `montages du conteneur ${o.val}`);
    else if (o.nom === 'use-api-socket' && (o.val === null || BOOLEENS[o.val] !== false)) p(ou, 'use-api-socket', 'Docker de l’hôte');
  }
  return l;
}

// Une configuration lue (JSONC), avec son arbre pour situer une ligne ; `erreur` si elle ne se lit pas.
function lireConfig(depot, f) {
  const texte = fs.readFileSync(path.join(depot, f), 'utf8'); const erreurs = [];
  const c = parseJsonc(texte, erreurs, { allowTrailingComma: true });
  if (erreurs.length || !c || typeof c !== 'object' || Array.isArray(c)) return { f, erreur: `${f} illisible` };
  return { f, texte, c, arbre: parseTree(texte, [], { allowTrailingComma: true }) };
}
const ligneDe = (lu, ou) => { const n = lu.arbre && findNodeAtLocation(lu.arbre, ou); return n ? lu.texte.slice(0, n.offset).split('\n').length : null; };

// Les features locales d'une configuration (`./…`, sous `.devcontainer/`) : leurs montages et privilèges s'ajoutent.
// Les features publiées ne se lisent pas ici ; ce qu'elles ajoutent se voit sur le conteneur construit.
function featuresLocales(depot, f, c) {
  const ids = Object.keys(c.features && typeof c.features === 'object' ? c.features : {}).filter((id) => id.startsWith('./') || id.startsWith('../'));
  return ids.map((id) => {
    const g = path.join(path.dirname(f), id, 'devcontainer-feature.json');
    return fs.statSync(path.join(depot, g), { throwIfNoEntry: false })?.isFile() ? lireConfig(depot, g) : { f: g, erreur: `${g} absent (feature ${id})` };
  });
}

// Chemin de l'hôte d'une source, variables résolues comme le CLI Dev Containers (`${localEnv:NOM:défaut}`, le défaut
// s'arrêtant au `:` suivant ; `${localWorkspaceFolder}`, `~`) ; null si une variable reste inconnue. Une variable absente
// de l'environnement de l'audit et sans défaut est inconnue : l'environnement qui ouvre le conteneur peut l'avoir.
function sourceHote(source, depot, maison, env) {
  let inconnue = false;
  let s = String(source).replace(/\$\{(.*?)\}/g, (m, v) => {
    const [nom, ...args] = v.split(':');
    if ((nom === 'localEnv' || nom === 'env') && typeof env[args[0]] === 'string') return env[args[0]];
    if ((nom === 'localEnv' || nom === 'env') && args.length > 1) return args[1];
    if (nom === 'localWorkspaceFolder') return depot;
    if (nom === 'localWorkspaceFolderBasename') return path.basename(depot);
    inconnue = true; return m;
  });
  if (inconnue) return null;
  if (s === '~' || s.startsWith('~/')) s = path.join(maison, s.slice(1));
  return path.resolve(depot, s);
}

/**
 * Ce qui expose l'hôte dans les configurations Dev Containers du dépôt : un montage d'un identifiant, du Docker de
 * l'hôte ou des données de HOLARCH en écriture (`mounts`, `workspaceMount`, `-v` et `--mount` de `runArgs`, features
 * locales), et un privilège qui défait l'isolement. Compose : non disponible. `ctx.maison`, `ctx.env` et `ctx.holarch`
 * remplacent ceux du poste (essais).
 */
function montageSensible(ctx) {
  const maison = ctx.maison || os.homedir(); const env = ctx.env || process.env;
  const affiche = (p) => (dedans(p, maison) ? `~/${path.relative(maison, p)}`.replace(/\/$/, '') : p);
  const sensibles = [...IDENTIFIANTS.map((r) => ({ chemin: path.join(maison, r), quoi: 'identifiants de l’hôte' })),
    ...DOCKER_HOTE.map((c) => ({ chemin: c, quoi: 'Docker de l’hôte' })),
    ...(ctx.holarch || []).filter(Boolean).map((c) => ({ chemin: path.resolve(c), quoi: 'données de HOLARCH', ecriture: true }))];
  const ecarts = []; const nonLus = [];
  for (const f of configsConteneur(ctx.depot)) {
    const config = lireConfig(ctx.depot, f);
    if (config.erreur) { nonLus.push(config.erreur); continue; }
    if (config.c.dockerComposeFile) { nonLus.push(`${f} : conteneur décrit par Docker Compose, montages non lus`); continue; }
    const admis = montagesAdmis(config.c, ctx.depot, maison);
    for (const lu of [config, ...featuresLocales(ctx.depot, f, config.c)]) {
      if (lu.erreur) { nonLus.push(lu.erreur); continue; }
      const opts = lu === config ? optionsDocker(Array.isArray(lu.c.runArgs) ? lu.c.runArgs.map(String) : []) : [];
      const montages = montagesDe(lu.c, opts);
      for (const m of montages.filter((x) => x.illisible)) nonLus.push(`${lu.f} : montage que Docker refuserait (${m.ou.join('.')})`);
      for (const m of montages.filter((x) => x.type === 'bind' && x.source && !x.illisible)) {
        const src = sourceHote(m.source, ctx.depot, maison, env);
        if (!src) { nonLus.push(`${lu.f} : source de montage non résolue (${m.source})`); continue; }
        const a = admis.find((x) => x.chemin === src);
        if (a && (!a.lecture || m.lecture)) continue;
        // Un montage admis en lecture seule, monté en écriture, compte pour lui-même ; sinon, ce qu'il touche ou contient.
        let vu = src;
        const touche = a || sensibles.find((x) => !(x.ecriture && m.lecture) && [src, reel(src)].some((s) => (dedans(s, x.chemin) || dedans(x.chemin, s)) && (vu = s)));
        if (!touche) continue;
        const qui = vu === touche.chemin ? affiche(vu) : dedans(touche.chemin, vu) ? `${affiche(vu)}, qui contient ${affiche(touche.chemin)}` : `${affiche(vu)}, dans ${affiche(touche.chemin)}`;
        ecarts.push({ fichier: lu.f, ligne: ligneDe(lu, m.ou), cle: `montage:${lu.f}:${m.cible}`,
          message: `monte ${qui} (${touche.quoi}) dans le conteneur, ${m.lecture ? 'en lecture' : 'en écriture'}` });
      }
      for (const x of privilegesDe(lu.c, opts)) {
        ecarts.push({ fichier: lu.f, ligne: ligneDe(lu, x.ou), cle: `privilege:${lu.f}:${x.cle}`, message: `${x.quoi} : l’isolement du conteneur ne tient plus` });
      }
    }
  }
  // Ce qui n'a pu se lire rend le contrôle non disponible, sans taire ce qui a été trouvé ailleurs.
  return nonLus.length ? { ecarts, indisponible: nonLus.join(' ; ') } : { ecarts };
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
  'commits-pousses': { moments: ['audit'], executer: commitsPousses },
  'dependances-vulnerables': { moments: ['audit'], executer: dependancesVulnerables },
  'outils-a-jour': { moments: ['audit'], executer: outilsAJour, portee: 'site' },
  'veille-retardee': { moments: ['audit'], executer: veilleRetardee, portee: 'site' },
  'montage-sensible': { moments: ['audit'], executer: montageSensible },
};

/** Exécute un contrôle ; une erreur le rend non disponible, jamais conforme. */
export function executer(id, ctx, moment) {
  const c = CONTROLES[id];
  if (!c) return { indisponible: `contrôle inconnu : ${id}` };
  if (!c.moments.includes(moment)) return { ecarts: [], hors_moment: true };
  if (c.portee !== 'site' && (!ctx.depot || !fs.existsSync(ctx.depot))) return { indisponible: 'dépôt absent de ce site' };
  try { return c.executer(ctx, moment); } catch (e) { return { indisponible: e.message.split('\n')[0] }; }
}
