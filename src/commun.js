// Briques partagées du socle (étape 3, tranche 6) : ce que plusieurs modules faisaient chacun à sa façon. Une seule
// façon d'échapper une chaîne, de reconnaître un fichier généré, d'écrire du JSON, de trouver un outil, d'appeler git.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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
 */
export function ecrireJson(f, o, { indent = 2 } = {}) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.${process.pid}.holarch`;
  fs.writeFileSync(tmp, `${JSON.stringify(o, null, indent || undefined)}\n`);
  fs.renameSync(tmp, f);
}

/**
 * Chemin d'un outil : réglage explicite, sinon le PATH, sinon ~/.local/bin ; null s'il est absent. Un nom d'outil peut
 * venir d'un réglage de l'arbre : il ne passe jamais par un shell, et ne contient pas de chemin.
 */
export function trouverOutil(nom, reglage = null) {
  if (reglage) return fs.existsSync(reglage) ? reglage : null;
  if (!/^[A-Za-z0-9._+-]+$/.test(String(nom))) return null;
  const executable = (f) => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };
  // Seules les entrées absolues du PATH : un `.` ferait exécuter un binaire du dossier courant (un projet).
  const dossiers = [...(process.env.PATH || '').split(path.delimiter).filter((d) => path.isAbsolute(d)), path.join(os.homedir(), '.local', 'bin')];
  return dossiers.map((d) => path.join(d, nom)).find(executable) || null;
}

/**
 * Le binaire de Claude Code, une seule façon de le chercher : `acces_distant.claude` s'il est réglé, sinon le PATH et
 * ~/.local/bin. Le réglage compte pour les services, dont le PATH réduit ne voit pas toujours le binaire.
 */
export const binaireClaude = (config) => trouverOutil('claude', config?.acces_distant?.claude || null);
/** Ce que dit tout appelant quand `binaireClaude` ne trouve rien. */
export const CLAUDE_INTROUVABLE = 'claude introuvable dans le PATH ni ~/.local/bin (acces_distant.claude pour le préciser)';

/**
 * Ce que la configuration propre d'un dépôt (portées `local` et `worktree`, inclusions comprises) pourrait faire
 * exécuter à une lecture, annulé en `-c` : `core.fsmonitor`, la vérification des signatures, et chaque pilote qu'elle
 * déclare (`filter.<x>` vidé, `diff.<x>.textconv` remplacé par `cat`, qui ne change rien : une valeur vide ferait
 * lancer un programme vide). Les diffs externes sont coupés par `--no-ext-diff` (voir `git`). Les pilotes du compte
 * (git-lfs installé normalement) restent.
 */
function neutralisation(depot) {
  const r = spawnSync('git', ['-C', depot, 'config', '--show-scope', '-z', '--get-regexp', '^(filter|diff)\\..+\\.'], { encoding: 'utf8', timeout: 10e3 });
  const pilotes = new Set();
  const champs = (r.stdout || '').split('\0'); // portée, puis clé et valeur séparées par une fin de ligne
  for (let i = 0; i + 1 < champs.length; i += 2) {
    const m = champs[i + 1].split('\n')[0].match(/^(filter|diff)\.(.+)\.[^.]+$/);
    if (m && (champs[i] === 'local' || champs[i] === 'worktree')) pilotes.add(`${m[1]}.${m[2]}`);
  }
  const cles = ['core.fsmonitor=false', 'log.showSignature=false'];
  for (const p of pilotes) {
    if (p.startsWith('filter.')) cles.push(`${p}.clean=`, `${p}.smudge=`, `${p}.process=`, `${p}.required=false`);
    else cles.push(`${p}.textconv=cat`);
  }
  return cles.flatMap((c) => ['-c', c]);
}

/**
 * git dans un dépôt : le résultat complet (status, stdout, stderr), avec un délai et un tampon larges. Le dépôt peut
 * être n'importe lequel sous les racines inventoriées (une archive extraite, un clone tiers) : rien de ce que sa
 * configuration déclare comme programme ne s'exécute (`neutralisation`, et `--no-ext-diff` pour ce qui produit un diff).
 */
export function git(depot, args, o = {}) {
  const diff = ['diff', 'log', 'show'].includes(args[0]) ? [args[0], '--no-ext-diff', ...args.slice(1)] : args;
  return spawnSync('git', [...neutralisation(depot), '-C', depot, ...diff], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 60e3, ...o });
}

/** Fichier de configuration de Claude Code d'un compte : `~/.claude.json` pour `~/.claude`, sinon `<home>/.claude.json`. */
export const configClaude = (home) => (path.resolve(home) === path.join(os.homedir(), '.claude') ? path.join(os.homedir(), '.claude.json') : path.join(home, '.claude.json'));

/** Clé d'un serveur MCP, telle qu'elle apparaît dans le nom de ses outils (`mcp__<clé>__<outil>`). */
export const cleServeur = (nom) => String(nom).replace(/[^A-Za-z0-9_-]/g, '_');
