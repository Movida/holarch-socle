// Briques partagées du socle (étape 3, tranche 6) : ce que plusieurs modules faisaient chacun à sa façon. Une seule
// façon d'échapper une chaîne, de reconnaître un fichier généré, d'écrire du JSON, de trouver un outil, d'appeler git.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
 * été remis). Un fichier créé par cette ouverture (`O_EXCL`) au bout du lien encore là est retiré. Reste ouvert sans
 * `openat`, absent de Node : un dossier remplacé, remis pour la vérification refaite, puis remplacé de nouveau avant la
 * comparaison des inodes ; et ce que l'ouverture crée au bout du lien quand le dossier est remis aussitôt (un fichier
 * vide). `nom` : le fichier que disent les erreurs (celui que remplace un temporaire).
 */
function ouvrirSansLien(racine, relatif, drapeaux, verbe, mode, nom = relatif) {
  const p = cheminSansLien(racine, relatif, verbe);
  let fd; try { fd = fs.openSync(p, drapeaux | fs.constants.O_NOFOLLOW, mode); } catch (e) {
    throw e.code === 'ELOOP' ? new Error(`${nom} est un lien symbolique : rien n’est ${verbe}`) : e;
  }
  try {
    cheminSansLien(racine, relatif, verbe);
    if (!memeFichier(p, fd)) throw new Error(`${nom} : un dossier de son chemin a changé pendant l’ouverture, rien n’est ${verbe}`);
    return fd;
  } catch (e) {
    if (drapeaux & fs.constants.O_EXCL && memeFichier(p, fd)) fs.rmSync(p, { force: true });
    fs.closeSync(fd); throw e;
  }
}
/** Le chemin `p` désigne-t-il le fichier ouvert `fd` (même inode, sans suivre de lien) ? */
function memeFichier(p, fd) {
  const o = fs.fstatSync(fd, { bigint: true }); let l; try { l = fs.lstatSync(p, { bigint: true }); } catch { return false; }
  return l.dev === o.dev && l.ino === o.ino;
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
  return lireOuvert(fd, max);
}

/**
 * Le texte d'un fichier hors d'un dépôt (le compte, que seul l'hôte écrit : un lien y est celui de l'auteur, et se suit),
 * null s'il manque ou ne se lit pas ; comme `lireSansLien`, ce qui n'est pas un fichier (un FIFO, ouvert sans attendre
 * d'écrivain) ou dépasse `max` octets ne se lit pas.
 */
export function lireFichier(f, { max = Infinity } = {}) {
  let fd; try { fd = fs.openSync(f, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK); } catch { return null; }
  return lireOuvert(fd, max);
}
function lireOuvert(fd, max) {
  try { const s = fs.fstatSync(fd); return s.isFile() && s.size <= max ? fs.readFileSync(fd, 'utf8') : null; } catch { return null; } finally { fs.closeSync(fd); }
}

/**
 * Écrit `contenu` dans `relatif` sous `racine` (un dépôt, un dossier du compte ou du site), dossiers créés au besoin,
 * d'un coup : dans un temporaire du même dossier, renommé ensuite sur le fichier (une écriture coupée, disque plein ou
 * processus tué, laisse le fichier d'avant entier ; coupé, un fichier généré perdait sa marque et passait pour étranger).
 * Sans suivre de lien symbolique : le temporaire s'ouvre par `ouvrirSansLien` (`O_EXCL`), et juste avant le renommage, le
 * fichier remplacé n'est ni un lien (`cheminSansLien`) ni ce qui n'est pas un fichier (un FIFO posé à sa place, qui reste
 * en place), et le temporaire est toujours celui qui est ouvert (un dossier du chemin remplacé depuis le ferait chercher
 * ailleurs). Ses droits : `mode`, sinon ceux du fichier remplacé (un fichier en 0600 ne devient pas lisible de tous).
 */
export function ecrireSansLien(racine, relatif, contenu, mode) {
  const p = cheminSansLien(racine, relatif);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const pasUnFichier = () => new Error(`${relatif} n’est pas un fichier : rien n’est écrit`);
  const remplace = () => { cheminSansLien(racine, relatif); let l; try { l = fs.lstatSync(p); } catch { return null; } if (!l.isFile()) throw pasUnFichier(); return l; };
  const avant = remplace(); const droits = mode ?? (avant ? avant.mode & 0o7777 : null);
  // Un temporaire du même numéro de processus, laissé par une panne, ne sert plus : retiré.
  const tmp = `${relatif}.${process.pid}.holarch`; const t = cheminSansLien(racine, tmp); fs.rmSync(t, { force: true });
  const { O_WRONLY, O_CREAT, O_EXCL } = fs.constants;
  const fd = ouvrirSansLien(racine, tmp, O_WRONLY | O_CREAT | O_EXCL, 'écrit', droits ?? 0o666, relatif);
  try {
    if (droits !== null) fs.fchmodSync(fd, droits);
    fs.writeFileSync(fd, contenu);
    remplace();
    if (!memeFichier(t, fd)) throw new Error(`${relatif} : un dossier de son chemin a changé pendant l’écriture, rien n’est écrit`);
    fs.renameSync(t, p);
  } catch (e) { if (memeFichier(t, fd)) fs.rmSync(t, { force: true }); throw e; } finally { fs.closeSync(fd); }
}

/** Le répertoire de travail de HOLARCH (configuration, données) : `HOLARCH_HOME`, sinon `~/.holarch`. */
export const accueil = () => process.env.HOLARCH_HOME || path.join(os.homedir(), '.holarch');

/** Empreinte courte d'un texte (ou de plusieurs, séparés par un octet nul) : SHA-256, 16 chiffres hexadécimaux. */
export const hacher = (...x) => createHash('sha256').update(x.join('\0')).digest('hex').slice(0, 16);

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
/**
 * Le fichier `f` porte-t-il la marque ? Lu sous `racine` (un dépôt) par `lireSansLien`, sinon (le compte) par
 * `lireFichier` : un lien dans le dépôt, ou ce qui n'est pas un fichier (un FIFO, qui bloquerait la lecture), ne la porte
 * pas, et n'est donc jamais réécrit ni retiré.
 */
export const fichierMarque = (f, marque, racine = null) => {
  try { return porteMarque(racine ? lireSansLien(racine, path.relative(racine, f)) : lireFichier(f), marque); } catch { return false; }
};

/**
 * JSON d'un fichier, `defaut` s'il est absent ou illisible. `strict` : un fichier présent mais illisible lève une erreur
 * (avant de réécrire un fichier, ne jamais le prendre pour vide). Lu par `lireFichier` : ce qui n'est pas un fichier (un
 * FIFO posé à la place de `settings.json`, qui bloquerait la lecture) est illisible.
 */
export function lireJson(f, defaut = null, { strict = false } = {}) {
  if (!fs.existsSync(f)) return defaut;
  const t = lireFichier(f);
  if (t === null) {
    if (!strict) return defaut;
    let raison; try { raison = fs.statSync(f).isFile() ? 'ne se lit pas' : 'pas un fichier'; } catch (e) { raison = e.code; }
    throw new Error(`${f} illisible : ${raison}`);
  }
  try { return JSON.parse(t); } catch (e) { if (strict) throw new Error(`${f} illisible : ${e.message}`); return defaut; }
}

/**
 * Écriture atomique (fichier temporaire puis renommage) : une panne ne laisse jamais un JSON à moitié écrit. Le temporaire
 * porte le numéro du processus : deux écrivains simultanés (crochet et inventaire horaire) n'écrivent pas le même.
 * `racine` (un dépôt, un compte Claude Code) : ni le fichier, ni son temporaire, ni un dossier du chemin depuis elle ne
 * sont des liens symboliques (`cheminSansLien`) ; le renommage remplacerait un lien final sans écrire à travers, mais un
 * dossier qui en est un enverrait le temporaire et le fichier dehors. Sans `racine` (`~/.claude.json`, catalogue, états),
 * un lien posé par l'auteur (une configuration rangée ailleurs) reste : le fichier qu'il vise est réécrit, un lien vers
 * un fichier absent n'est pas remplacé (rien n'est écrit). Les droits du fichier remplacé se gardent : un fichier en
 * 0600 ne devient pas lisible de tous.
 */
export function ecrireJson(f, o, { indent = 2, racine = null, siInchange } = {}) {
  let cible = f;
  if (racine) for (const x of [f, `${f}.${process.pid}.holarch`]) cheminSansLien(racine, path.relative(racine, x));
  else if (lienSymbolique(f)) { try { cible = fs.realpathSync(f); } catch (e) { throw new Error(`${f} est un lien vers un fichier absent (${e.code}) : rien n’est écrit`); } }
  const tmp = `${cible}.${process.pid}.holarch`;
  let mode = null; try { mode = fs.statSync(cible).mode & 0o7777; } catch { /* fichier nouveau : les droits par défaut */ }
  fs.mkdirSync(path.dirname(cible), { recursive: true });
  // Le temporaire naît avec les droits du fichier (que personne d'autre ne l'ouvre avant), exacts malgré le umask. Une
  // écriture ou un renommage en échec (disque plein, un dossier à la place du fichier) ne le laisse pas derrière elle.
  const fd = fs.openSync(tmp, 'w', mode ?? 0o666);
  try {
    try { if (mode !== null) fs.fchmodSync(fd, mode); fs.writeFileSync(fd, `${JSON.stringify(o, null, indent || undefined)}\n`); } finally { fs.closeSync(fd); }
    // `siInchange` : le texte lu avant la modification (null : le fichier était absent), relu juste avant le renommage ;
    // changé depuis, rien n'est remplacé (`modifierJson`).
    if (siInchange !== undefined && lireFichier(cible) !== siInchange) throw Object.assign(new Error(`${f} a changé depuis sa lecture : rien n’est remplacé`), { code: 'ECHANGE' });
    fs.renameSync(tmp, cible);
  } catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}
const lienSymbolique = (f) => { try { return fs.lstatSync(f).isSymbolicLink(); } catch { return false; } };

/**
 * Modifie un JSON qu'un autre programme réécrit en entier à tout moment (`~/.claude.json`, que Claude Code réécrit sans
 * verrou) : lu, modifié par `modifier` (qui rend `false` s'il n'y a rien à écrire), puis écrit d'un coup (`ecrireJson`),
 * relu juste avant le renommage. Changé depuis la lecture, rien n'est remplacé : tout recommence depuis la nouvelle
 * version, `essais` fois au plus, puis une erreur le dit. Cela protège l'écriture de l'autre programme, pas la nôtre : une
 * écriture de Claude Code faite après notre renommage, depuis ce qu'il avait lu avant, la remplace (aucun verrou ne les
 * ordonne) ; reste aussi l'instant entre la relecture et le renommage. `defaut` : le contenu d'un fichier absent ; un
 * fichier présent mais illisible lève une erreur (`lireJson` strict). Rend ce que rend `modifier`.
 */
export function modifierJson(f, modifier, { defaut = null, essais = 3 } = {}) {
  for (let i = 0; i < essais; i++) {
    const texte = lireFichier(f);
    if (texte === null && fs.existsSync(f)) lireJson(f, defaut, { strict: true });
    let o; try { o = texte === null ? structuredClone(defaut) : JSON.parse(texte); } catch (e) { throw new Error(`${f} illisible : ${e.message}`); }
    const r = modifier(o);
    if (r === false) return false;
    try { ecrireJson(f, o, { siInchange: texte }); return r; } catch (e) { if (e.code !== 'ECHANGE') throw e; }
  }
  throw new Error(`${f} a changé pendant chacun des ${essais} essais d’écriture : rien n’est écrit`);
}

/** `/proc/<pid>/stat` : { comm, ppid, debut } (début en tops d'horloge depuis l'amorçage), ou null. */
export function stat(pid) {
  try {
    const t = fs.readFileSync(`/proc/${pid}/stat`, 'utf8'); const i = t.lastIndexOf(')');
    const champs = t.slice(i + 2).split(' '); // champ 3 (état) en tête : ppid est le champ 4, le début le champ 22
    return { comm: t.slice(t.indexOf('(') + 1, i), ppid: +champs[1], debut: champs[19] };
  } catch { return null; }
}

/**
 * Le processus noté vit encore : même numéro et même début (un numéro réattribué n'est pas ce processus). Sans /proc,
 * le numéro seul (`numeroPris`). `proc` : /proc se lit-il (essais).
 */
export const vivant = ({ pid, debut }, lire = stat, proc = procLisible()) => { const s = lire(pid); return s ? s.debut === debut : !proc && signalable(pid); };

/**
 * Un processus porte ce numéro (une copie de pose est-elle orpheline ?) : lu dans /proc. Sans /proc (hors Linux), comme
 * pour `vivant`, aucun début ne se lit : le numéro seul fait foi (`kill 0`), au risque d'un numéro réattribué. `proc` :
 * /proc se lit-il (essais).
 */
export const numeroPris = (pid, { lire = stat, proc = procLisible() } = {}) => Boolean(lire(pid)) || (!proc && signalable(pid));
const procLisible = () => fs.existsSync('/proc/self/stat');
// `kill 0` n'envoie rien : le numéro est pris (EPERM : par un processus d'un autre utilisateur). 0 et moins visent un groupe.
const signalable = (pid) => { if (!Number.isInteger(pid) || pid <= 0) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

/**
 * Efface un fichier seulement s'il n'a pas changé depuis sa lecture (`lu`), sans fenêtre de course : renommé (le
 * renommage prend d'un coup ce qui est là), comparé, puis supprimé. Réécrit entre la lecture et le renommage, il est
 * remis en place, sauf si un plus récent l'a déjà remplacé (`link` ne remplace jamais un fichier). Le nom provisoire ne
 * finit pas comme le fichier (`.json`, `.verrou`) : ceux qui les lisent ne le prennent pas pour l'un d'eux. Vrai s'il est
 * effacé. `pendant` : appelé après le renommage (essais).
 */
export function effacerSiInchange(f, lu, { pendant = () => {} } = {}) {
  const t = `${f}.effacee-${process.pid}`;
  try { fs.renameSync(f, t); } catch { return false; }
  pendant();
  let changee = false;
  try { changee = fs.readFileSync(t, 'utf8') !== lu; } catch { /* plus rien à comparer */ }
  if (changee) {
    try { fs.linkSync(t, f); } catch (e) { if (e.code !== 'EEXIST' && !fs.existsSync(f)) fs.renameSync(t, f); }
  }
  fs.rmSync(t, { force: true });
  return !changee;
}

// Un verrou illisible est celui qu'un processus vient de créer sans l'avoir encore écrit : tenu, une minute au plus.
const VERROU_ILLISIBLE = 60e3;
/**
 * Verrou d'un seul écrivain (l'inventaire, l'import : deux passages simultanés lisent le même état et doublent leurs
 * événements). Un fichier créé d'un coup (`wx`), qui porte le processus qui le tient : son numéro et son début
 * (`vivant`). Tenu par un processus vivant : `{ pris: { pid, at } }`, et rien n'est fait, sans attente ni échec ; c'est à
 * l'appelant de le dire. Laissé par un processus mort (tué, panne du poste), ou illisible depuis plus d'une minute : retiré
 * s'il n'a pas changé depuis sa lecture (`effacerSiInchange` : deux repreneurs ne retirent pas le verrou neuf de l'autre),
 * puis repris. Pris : `{ liberer }`, qui ne retire que le sien.
 */
export function prendreVerrou(f, { maintenant = Date.now() } = {}) {
  const texte = JSON.stringify({ pid: process.pid, debut: stat(process.pid)?.debut ?? null, at: new Date(maintenant).toISOString() });
  fs.mkdirSync(path.dirname(f), { recursive: true });
  let lu = null; let tenant = null;
  for (let essai = 0; essai < 2; essai++) {
    let fd = null;
    try { fd = fs.openSync(f, 'wx', 0o600); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    if (fd !== null) {
      try { fs.writeFileSync(fd, texte); } finally { fs.closeSync(fd); }
      return { liberer: () => effacerSiInchange(f, texte) };
    }
    lu = lireFichier(f); tenant = null;
    if (lu === null) continue; // retiré entre-temps : repris au tour suivant
    try { tenant = JSON.parse(lu); } catch { /* pas encore écrit */ }
    let age = Infinity; try { age = maintenant - fs.statSync(f).mtimeMs; } catch { /* retiré entre-temps */ }
    if (tenant ? vivant(tenant) : age < VERROU_ILLISIBLE) break;
    effacerSiInchange(f, lu);
  }
  return { pris: { pid: tenant?.pid ?? null, at: tenant?.at ?? null } };
}
/** Ce que dit un passage qui trouve le verrou tenu (`prendreVerrou`) : `quoi` (« inventaire ») passe son tour. */
export const tourPasse = (quoi, { pid, at }) => `${quoi} déjà en cours (processus ${pid ?? 'inconnu'}${at ? `, depuis ${heureLocale(at, { seule: true })}` : ''}) : celui-ci passe son tour`;

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

/** Noms des tests en échec dans la sortie de `node --test` (rapport spec) : la liste qui suit « ✖ failing tests: ». */
export function testsEnEchec(sortie) {
  const apres = String(sortie || '').split(/^✖ failing tests:/m)[1] || '';
  return [...new Set(apres.match(/^✖ .+$/gm) || [])].map((l) => l.slice(2).replace(/ \([\d.]+m?s\)$/, ''));
}

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
  const lister = (...o) => spawnSync('git', ['-C', depot, 'config', ...o, '-z', '--get-regexp', NEUTRE.pilotes], { encoding: 'utf8', timeout: 10e3 });
  const pilotes = new Set(); const ajouter = (cle) => { const m = cle.match(/^(filter|diff)\.(.+)\.[^.]+$/); if (m) pilotes.add(`${m[1]}.${m[2]}`); };
  // Clé et valeur séparées par une fin de ligne, chaque entrée finie par un octet nul ; `--show-scope` la précède de sa portée.
  const r = lister('--show-scope');
  if (r.status === 0 || r.status === 1) {
    const champs = (r.stdout || '').split('\0');
    for (let i = 0; i + 1 < champs.length; i += 2) if (champs[i] === 'local' || champs[i] === 'worktree') ajouter(champs[i + 1].split('\n')[0]);
  } else {
    // Un git antérieur à 2.26 (celui d'un conteneur) n'a pas `--show-scope` (code 129) : comme au repli du crochet de
    // commit, tous les pilotes déclarés, de toute portée, sont neutralisés (ceux du compte aussi), plutôt qu'aucun. Cette
    // liste-ci se passe de `--name-only` (absent avant 2.6, où le crochet refuse le commit) : clé et valeur se séparent.
    for (const x of (lister().stdout || '').split('\0')) if (x) ajouter(x.split('\n')[0]);
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

/**
 * Valeur d'une clé de la configuration git d'un dépôt (`options` : `--local`… pour une seule portée), '' si elle n'est
 * pas posée. Seule lecture d'une clé : par `gitLu`, rien de ce que la configuration du dépôt déclare ne s'exécute.
 */
export const configGit = (depot, cle, ...options) => (gitLu(depot, ['config', ...options, '--get', cle]).stdout || '').trim();

// Le compte de Claude Code par défaut (`~/.claude`), celui que `claude` lit sans `CLAUDE_CONFIG_DIR`.
const compteParDefaut = (home) => path.resolve(home) === path.join(os.homedir(), '.claude');
/** Fichier de configuration de Claude Code d'un compte : `~/.claude.json` pour `~/.claude`, sinon `<home>/.claude.json`. */
export const configClaude = (home) => (compteParDefaut(home) ? path.join(os.homedir(), '.claude.json') : path.join(home, '.claude.json'));
/** Ce qui fait parler une commande `claude` au compte `home` : rien pour le compte par défaut, sinon `CLAUDE_CONFIG_DIR`. */
export const pourCompte = (home) => (compteParDefaut(home) ? '' : `CLAUDE_CONFIG_DIR=${shell(home)} `);

// Heure locale du poste, « AAAA-MM-JJ HH:MM » (`seule` : « HH:MM ») : une seule façon de la dire, au terminal, dans les
// constats et dans le résumé de reprise.
export function heureLocale(iso, { seule = false } = {}) {
  const t = new Date(iso).toLocaleString('sv-SE').slice(0, 16);
  return seule ? t.slice(11) : t;
}
// Jour local du poste d'une date, « AAAA-MM-JJ » (choix de l'auteur : jour local partout), celui de `heureLocale`.
export const jourLocal = (date) => heureLocale(date).slice(0, 10);
/** Clé d'un serveur MCP, telle qu'elle apparaît dans le nom de ses outils (`mcp__<clé>__<outil>`). */
export const cleServeur = (nom) => String(nom).replace(/[^A-Za-z0-9_-]/g, '_');
