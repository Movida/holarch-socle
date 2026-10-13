// Briques partagées du socle (étape 3, tranche 6) : ce que plusieurs modules faisaient chacun à sa façon. Une seule
// façon d'échapper une chaîne, de reconnaître un fichier généré, d'écrire du JSON, de trouver un outil, d'appeler git.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** `a` est `b` ou se trouve dessous (chemins de même base) ; un dossier dessous nommé `..x` l'est aussi. */
export const dedans = (a, b) => { const r = path.relative(b, a); return r === '' || (r !== '..' && !r.startsWith(`..${path.sep}`) && !path.isAbsolute(r)); };

/**
 * Le chemin absolu de `relatif` sous `racine` (un dépôt), vérifié sans rien écrire : un dossier du chemin (la racine
 * exclue) ou le fichier qui est un lien symbolique, ou un chemin qui sort de la racine, lève une erreur. Un conteneur
 * écrit son dépôt monté ; un lien qu'il y pose détournerait vers l'hôte une écriture faite sur l'hôte, ou ferait lire
 * un fichier de l'hôte. Toute écriture de HOLARCH dans un dépôt passe par là : `ecrireSansLien`, et ce qui renomme, lit
 * un dossier ou retire un fichier ; toute lecture dont le contenu sort (audit, journal, écriture), par `lireSansLien`.
 * `verbe` : ce que l'erreur dit ne pas faire (« écrit », « lu »).
 */
export function cheminSansLien(racine, relatif, verbe = 'écrit') {
  const p = path.resolve(racine, relatif);
  if (!dedans(p, racine) || p === path.resolve(racine)) throw new Error(`${relatif} : hors du dépôt`);
  let q = path.resolve(racine);
  for (const s of path.relative(q, p).split(path.sep)) {
    q = path.join(q, s);
    let l; try { l = fs.lstatSync(q); } catch { break; }
    if (l.isSymbolicLink()) throw new Error(`${path.relative(racine, q)} est un lien symbolique : rien n’est ${verbe}`);
  }
  return p;
}

/**
 * Le descripteur de `relatif` sous `racine`, ouvert (`drapeaux`) sans suivre de lien. Le fichier s'ouvre en
 * `O_NOFOLLOW` : un lien posé à sa place entre la vérification et l'ouverture la fait échouer, qui le dit comme la
 * vérification. Un dossier du chemin remplacé par un lien dans cet intervalle se voit après l'ouverture : à la
 * vérification refaite (le lien est encore là), sinon à l'inode ouvert, qui n'est pas celui que le chemin désigne (il a
 * été remis). Reste ouvert sans `openat`, absent de Node : un dossier remplacé, remis pour la vérification refaite, puis
 * remplacé de nouveau avant la comparaison des inodes ; et ce que l'ouverture crée au bout du lien (un fichier vide).
 */
function ouvrirSansLien(racine, relatif, drapeaux, verbe, mode) {
  const p = cheminSansLien(racine, relatif, verbe);
  let fd; try { fd = fs.openSync(p, drapeaux | fs.constants.O_NOFOLLOW, mode); } catch (e) {
    throw e.code === 'ELOOP' ? new Error(`${relatif} est un lien symbolique : rien n’est ${verbe}`) : e;
  }
  try {
    cheminSansLien(racine, relatif, verbe);
    const o = fs.fstatSync(fd, { bigint: true }); let l; try { l = fs.lstatSync(p, { bigint: true }); } catch { l = null; }
    if (!l || l.dev !== o.dev || l.ino !== o.ino) throw new Error(`${relatif} : un dossier de son chemin a changé pendant l’ouverture, rien n’est ${verbe}`);
    return fd;
  } catch (e) { fs.closeSync(fd); throw e; }
}

/**
 * Le texte de `relatif` sous `racine` (un dépôt), null s'il manque ou ne se lit pas, sans suivre de lien symbolique
 * (`cheminSansLien` : un lien lève une erreur ; `ouvrirSansLien` pour la course entre la vérification et la lecture).
 * Ce qui n'est pas un fichier (un FIFO, ouvert sans attendre d'écrivain : `O_NONBLOCK`), ou qui dépasse `max` octets,
 * ne se lit pas.
 */
export function lireSansLien(racine, relatif, { max = Infinity } = {}) {
  const { O_RDONLY, O_NONBLOCK } = fs.constants;
  let fd; try { fd = ouvrirSansLien(racine, relatif, O_RDONLY | O_NONBLOCK, 'lu'); } catch (e) { if (e.code) return null; throw e; }
  try { const s = fs.fstatSync(fd); return s.isFile() && s.size <= max ? fs.readFileSync(fd, 'utf8') : null; } catch { return null; } finally { fs.closeSync(fd); }
}

/**
 * Écrit `contenu` dans `relatif` sous `racine` (un dépôt), dossiers créés au besoin, sans suivre de lien symbolique
 * (`cheminSansLien`, puis `ouvrirSansLien` pour la course entre la vérification et l'écriture). Le fichier s'ouvre sans
 * `O_TRUNC` et ne se tronque qu'une fois l'ouverture vérifiée ; son mode se pose sur ce qui est ouvert.
 */
export function ecrireSansLien(racine, relatif, contenu, mode) {
  const p = cheminSansLien(racine, relatif);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const fd = ouvrirSansLien(racine, relatif, fs.constants.O_WRONLY | fs.constants.O_CREAT, 'écrit', mode ?? 0o666);
  try { fs.ftruncateSync(fd, 0); fs.writeFileSync(fd, contenu); if (mode) fs.fchmodSync(fd, mode); } finally { fs.closeSync(fd); }
}

/** Le répertoire de travail de HOLARCH (configuration, données) : `HOLARCH_HOME`, sinon `~/.holarch`. */
export const accueil = () => process.env.HOLARCH_HOME || path.join(os.homedir(), '.holarch');

/** Un mot pour le shell, entre apostrophes. */
export const shell = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

/** Une valeur pour une ligne d'unité systemd, entre guillemets (`$` et `%` doublés). */
export const systemd = (s) => `"${String(s).replace(/(["\\])/g, '\\$1').replace(/\$/g, '$$$$').replace(/%/g, '%%')}"`;

/**
 * Un fichier généré porte sa marque sur l'une de ses premières lignes, après un éventuel en-tête `---` (aussi long
 * soit-il) : un fichier qui ne la porte pas n'est jamais modifié ni retiré.
 */
export function porteMarque(texte, marque) {
  const l = String(texte ?? '').split('\n');
  const fin = l[0] === '---' ? l.indexOf('---', 1) : -1;
  const debut = fin > 0 ? fin + 1 : 0;
  return l.slice(debut, debut + 12).some((x) => x.startsWith(marque));
}
export const fichierMarque = (f, marque) => { try { return porteMarque(fs.readFileSync(f, 'utf8'), marque); } catch { return false; } };

/**
 * JSON d'un fichier, `defaut` s'il est absent ou illisible. `strict` : un fichier présent mais illisible lève une erreur
 * (avant de réécrire un fichier, ne jamais le prendre pour vide).
 */
export function lireJson(f, defaut = null, { strict = false } = {}) {
  if (!fs.existsSync(f)) return defaut;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { if (strict) throw new Error(`${f} illisible : ${e.message}`); return defaut; }
}

/**
 * Écriture atomique (fichier temporaire puis renommage) : une panne ne laisse jamais un JSON à moitié écrit. Le temporaire
 * porte le numéro du processus : deux écrivains simultanés (crochet et inventaire horaire) n'écrivent pas le même.
 * `racine` (un dépôt, un compte Claude Code) : ni le fichier, ni son temporaire, ni un dossier du chemin depuis elle ne
 * sont des liens symboliques (`cheminSansLien`) ; le renommage remplacerait un lien final sans écrire à travers, mais un
 * dossier qui en est un enverrait le temporaire et le fichier dehors.
 */
export function ecrireJson(f, o, { indent = 2, racine = null } = {}) {
  const tmp = `${f}.${process.pid}.holarch`;
  if (racine) for (const x of [f, tmp]) cheminSansLien(racine, path.relative(racine, x));
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(o, null, indent || undefined)}\n`);
  fs.renameSync(tmp, f);
}

/**
 * Chemin d'un outil : réglage explicite, sinon le PATH, sinon ~/.local/bin ; null s'il est absent ou n'est pas un fichier
 * exécutable (un réglage qui vise un dossier compris). Un nom d'outil peut venir d'un réglage de l'arbre : il ne passe
 * jamais par un shell, et ne contient pas de chemin.
 */
export function trouverOutil(nom, reglage = null) {
  const executable = (f) => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };
  if (reglage) return executable(reglage) ? reglage : null;
  if (!/^[A-Za-z0-9._+-]+$/.test(String(nom))) return null;
  // Seules les entrées absolues du PATH : un `.` ferait exécuter un binaire du dossier courant (un projet).
  const dossiers = [...(process.env.PATH || '').split(path.delimiter).filter((d) => path.isAbsolute(d)), path.join(os.homedir(), '.local', 'bin')];
  return dossiers.map((d) => path.join(d, nom)).find(executable) || null;
}

/**
 * Le binaire de Claude Code, une seule façon de le chercher : `acces_distant.claude` s'il est réglé, sinon le PATH et
 * ~/.local/bin. Le réglage compte pour les services, dont le PATH réduit ne voit pas toujours le binaire.
 */
export const binaireClaude = (config) => trouverOutil('claude', config?.acces_distant?.claude || null);
/** Ce que dit tout appelant quand `binaireClaude` ne trouve rien : le réglage quand il est posé, sinon où il a cherché. */
export const claudeIntrouvable = (config) => (config?.acces_distant?.claude
  ? `claude introuvable : acces_distant.claude (${config.acces_distant.claude}) n'existe pas ou n'est pas un fichier exécutable`
  : 'claude introuvable dans le PATH ni ~/.local/bin (acces_distant.claude pour le préciser)');

/**
 * git dans un dépôt de l'auteur : le résultat complet (status, stdout, stderr), avec un délai et un tampon larges.
 * Sa configuration s'applique comme à la main (filtres, crochets) : c'est par là que passent les écritures (création,
 * identité, crochet, copie de service). Un dépôt quelconque se lit par `gitLu`.
 */
export function git(depot, args, o = {}) {
  return spawnSync('git', ['-C', depot, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 60e3, ...o });
}

/**
 * Ce que pose `neutralisation`, partagé avec son écriture en shell (repli du crochet de commit, `garde-git`) : les clés
 * fixes, celles de chaque pilote déclaré (`filter.<x>.<clé>`, `diff.<x>.<clé>`), le protocole qui n'existe pas, et ce
 * qui désigne les pilotes dans `git config --get-regexp`.
 */
export const NEUTRE = {
  cles: [['core.fsmonitor', 'false'], ['core.hooksPath', '/dev/null'], ['log.showSignature', 'false'], ['submodule.recurse', 'false'],
    ...['gpg.program', 'gpg.openpgp.program', 'gpg.ssh.program', 'gpg.x509.program'].map((k) => [k, 'false'])],
  filter: [['clean', ''], ['smudge', ''], ['process', ''], ['required', 'false']],
  diff: [['textconv', 'cat']],
  protocole: 'aucun',
  pilotes: '^(filter|diff)\\..+\\.',
};

/**
 * Ce que la configuration propre d'un dépôt (portées `local` et `worktree`, inclusions comprises) pourrait faire
 * exécuter à une lecture, annulé : `core.fsmonitor`, les crochets (`core.hooksPath` vers /dev/null), les programmes de
 * vérification des signatures (qu'un `export-subst` d'`archive` appelle), tout transport (`GIT_ALLOW_PROTOCOL` réduit à un protocole qui n'existe pas :
 * un clone partiel irait chercher un objet manquant par son `uploadpack` ou son `sshCommand`), et chaque pilote qu'elle déclare (`filter.<x>` vidé, `diff.<x>.textconv` remplacé par `cat`, qui ne
 * change rien : une valeur vide ferait lancer un programme vide). Passé par `GIT_CONFIG_COUNT`, qui garde un nom de
 * pilote contenant `=` (`-c` le couperait). Les pilotes du compte (git-lfs installé normalement) restent. Un outil qui
 * lance git lui-même dans un dépôt (gitleaks avant commit) le reçoit dans son environnement, que git hérite.
 */
export function neutralisation(depot, env) {
  const r = spawnSync('git', ['-C', depot, 'config', '--show-scope', '-z', '--get-regexp', NEUTRE.pilotes], { encoding: 'utf8', timeout: 10e3 });
  const pilotes = new Set();
  const champs = (r.stdout || '').split('\0'); // portée, puis clé et valeur séparées par une fin de ligne
  for (let i = 0; i + 1 < champs.length; i += 2) {
    const m = champs[i + 1].split('\n')[0].match(/^(filter|diff)\.(.+)\.[^.]+$/);
    if (m && (champs[i] === 'local' || champs[i] === 'worktree')) pilotes.add(`${m[1]}.${m[2]}`);
  }
  const cles = [...NEUTRE.cles];
  for (const p of pilotes) cles.push(...NEUTRE[p.startsWith('filter.') ? 'filter' : 'diff'].map(([v, x]) => [`${p}.${v}`, x]));
  const n0 = Number(env.GIT_CONFIG_COUNT) || 0; const e = { ...env, GIT_ALLOW_PROTOCOL: NEUTRE.protocole, GIT_CONFIG_COUNT: String(n0 + cles.length) };
  cles.forEach(([k, v], i) => { e[`GIT_CONFIG_KEY_${n0 + i}`] = k; e[`GIT_CONFIG_VALUE_${n0 + i}`] = v; });
  return e;
}

/**
 * git en lecture dans un dépôt quelconque (inventaire, audit) : une archive extraite, un clone tiers. Rien de ce que sa
 * configuration déclare comme programme ne s'exécute (`neutralisation`, `--no-ext-diff` pour ce qui produit un diff),
 * l'index n'est pas réécrit (`--no-optional-locks`), et `status` et `diff` ne descendent pas dans les sous-modules, dont
 * la configuration propre échapperait à la neutralisation (leurs changements ne se comptent pas).
 */
export function gitLu(depot, args, o = {}) {
  const sous = { diff: ['--no-ext-diff', '--ignore-submodules=all'], log: ['--no-ext-diff'], show: ['--no-ext-diff'], status: ['--ignore-submodules=all'] }[args[0]];
  const a = sous ? [args[0], ...sous, ...args.slice(1)] : args;
  return git(depot, ['--no-optional-locks', ...a], { ...o, env: neutralisation(depot, o.env || process.env) });
}

/** Fichier de configuration de Claude Code d'un compte : `~/.claude.json` pour `~/.claude`, sinon `<home>/.claude.json`. */
export const configClaude = (home) => (path.resolve(home) === path.join(os.homedir(), '.claude') ? path.join(os.homedir(), '.claude.json') : path.join(home, '.claude.json'));

/** Clé d'un serveur MCP, telle qu'elle apparaît dans le nom de ses outils (`mcp__<clé>__<outil>`). */
// Heure locale du poste, « AAAA-MM-JJ HH:MM » (`seule` : « HH:MM ») : une seule façon de la dire, au terminal, dans les
// constats et dans le résumé de reprise.
export function heureLocale(iso, { seule = false } = {}) {
  const t = new Date(iso).toLocaleString('sv-SE').slice(0, 16);
  return seule ? t.slice(11) : t;
}
export const cleServeur = (nom) => String(nom).replace(/[^A-Za-z0-9_-]/g, '_');
