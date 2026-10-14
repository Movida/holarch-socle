// Copie de service (décision copie-de-service, idée I16) : les points d'entrée de HOLARCH (import horaire, interface,
// crochets de Claude Code, serveur MCP, garde avant commit) lancent une copie du socle tirée d'un commit, jamais la copie
// de travail. Les outils font le travail (`git archive`, `npm ci`) ; HOLARCH exporte, installe et bascule un lien.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { git, lireJson, ecrireJson, trouverOutil, configClaude, dedans, shell, pourCompte, stat } from './commun.js';
import { creerInterface, creerImport, creerRecolte, creerReveil, etatRoutines } from './distant.js';
import { OUTILS } from './conteneur.js';

const SOI = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const FICHE = '.holarch-service.json';
const COMMIT = /^[0-9a-f]{7,40}$/;

const dossier = (accueil) => path.join(accueil, 'service');
const lien = (accueil) => path.join(dossier(accueil), 'courant');

/**
 * Le binaire qu'appellent les points d'entrée : celui de la copie en service, par le lien `courant` (le même chemin
 * d'une pose à l'autre : seul le lien bascule), sinon le code qui s'exécute (autre site, conteneur, tests).
 */
export function binaireService(accueil) {
  const b = path.join(lien(accueil), 'bin', 'holarch.js');
  return fs.existsSync(b) ? b : path.join(SOI, 'bin', 'holarch.js');
}

/** La copie en service (`{ commit, source, pose_le }`), ou null. */
export const copieEnService = (accueil) => lireJson(path.join(lien(accueil), FICHE), null);

const sortie = (r) => (r.stdout || '').trim();
const echec = (r) => (r.error?.message || (r.stderr || '').trim().split('\n').slice(-3).join(' ') || `code ${r.status}`);

/** Retard de la copie en service sur `HEAD` de sa source, en commits ; null si illisible. */
export function retard(copie) {
  if (!copie?.source || !copie?.commit) return null;
  const r = git(copie.source, ['rev-list', '--count', `${copie.commit}..HEAD`]);
  return r.status === 0 ? Number(sortie(r)) : null;
}

// Ce que laisse une pose arrêtée net (le processus tué pendant `npm ci`, une panne) : `<nom>.pose-<pid>`, copie, lien ou
// fichier temporaire, jamais renommé ni retiré. La pose suivante retire ceux dont le processus est mort ; un numéro
// encore pris (une pose en cours, ou ce numéro repris par un autre : le nom ne porte pas le début) garde le sien. Les
// chemins retirés.
function retirerOrphelines(d) {
  let noms = []; try { noms = fs.readdirSync(d); } catch { return []; }
  return noms.filter((n) => { const m = n.match(/\.pose-(\d+)$/); return m && !stat(Number(m[1])); }).map((n) => {
    const f = path.join(d, n); fs.rmSync(f, { recursive: true, force: true }); return f;
  });
}
const gitleaksDesConteneurs = (maison) => path.join(maison, OUTILS.hote, 'gitleaks');

/**
 * Le gitleaks de l'hôte (`bin`), copié dans le dossier que les conteneurs générés montent en lecture (décision
 * garde-sans-passage-muet) : leur crochet de commit, où HOLARCH est injoignable, vérifie au moins les secrets. Copié
 * seulement s'il diffère, d'un coup (un fichier neuf renommé sur l'ancien). { etat }.
 */
export function copierGitleaks(bin, maison = os.homedir()) {
  if (!bin) return { etat: 'absent de l’hôte : le crochet d’un conteneur laisse passer et le dit' };
  const f = gitleaksDesConteneurs(maison); const contenu = fs.readFileSync(bin);
  let actuel = null; try { actuel = fs.readFileSync(f); } catch { /* absent */ }
  if (actuel?.equals(contenu)) return { etat: 'inchangé' };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = `${f}.pose-${process.pid}`;
  fs.writeFileSync(tmp, contenu); fs.chmodSync(tmp, 0o755); fs.renameSync(tmp, f);
  return { etat: `copié (${f})` };
}

export function creerService({ accueil, comptes = [], veille = null, gitleaks = null, maison = os.homedir() }, {
  source = null, unites, systemctl, node = process.execPath,
  npm = trouverOutil('npm'),
  lancer = (cmd, args, o) => spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900e3, ...o }),
} = {}) {
  const env = { ...process.env, PATH: [path.dirname(node), process.env.PATH].join(path.delimiter) };
  // La source : celle que nomme l'appel, sinon le dépôt du code qui s'exécute, sinon celle de la copie en service.
  const sourceDe = () => source || (git(SOI, ['rev-parse', '--show-toplevel']).status === 0 ? SOI : copieEnService(accueil)?.source) || null;

  function installer(src, commit, cible) {
    const tmp = `${cible}.pose-${process.pid}`;
    fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
    try {
      const a = git(src, ['archive', '--format=tar', commit], { encoding: 'buffer' });
      if (a.status !== 0) throw new Error(`git archive : ${echec({ ...a, stderr: String(a.stderr || '') })}`);
      const x = lancer('tar', ['-x', '-C', tmp], { input: a.stdout, encoding: 'buffer' });
      if (x.status !== 0) throw new Error(`tar : ${echec({ ...x, stderr: String(x.stderr || '') })}`);
      const i = lancer(npm, ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: tmp, env });
      if (i.status !== 0) throw new Error(`npm ci : ${echec(i)}`);
      ecrireJson(path.join(tmp, FICHE), { commit, source: src, pose_le: new Date().toISOString() });
      fs.renameSync(tmp, cible);
    } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); throw e; }
  }

  // Le serveur MCP `holarch` d'un compte (portée utilisateur : `mcpServers` de son `.claude.json`), lu : { fichier, cfg,
  // s, i (le chemin de `bin/holarch.js` dans ses arguments), lance (une copie de service, le socle : la copie de travail
  // qui pose, ou la source ; null sinon) }. `service poser` ne repointe que ce qui lance une copie de service ou le socle :
  // réglé ailleurs (une autre copie de HOLARCH, posée à la main), il est laissé, et dit (décision geste-a-la-main).
  function entreeMcp(c, src) {
    const fichier = configClaude(c.home); const cfg = lireJson(fichier, null, { strict: true });
    const s = cfg?.mcpServers?.holarch;
    if (!s || typeof s !== 'object') return { fichier, s: null };
    const i = Array.isArray(s.args) ? s.args.findIndex((a) => /(^|\/)bin\/holarch\.js$/.test(a)) : -1; const a = s.args?.[i];
    const lance = i < 0 || !path.isAbsolute(a) ? null : dedans(path.resolve(a), dossier(accueil)) ? 'copie de service'
      : [SOI, src].some((d) => d && path.resolve(a) === path.join(d, 'bin', 'holarch.js')) ? 'socle' : null;
    return { fichier, cfg, s, i, lance };
  }

  // Le geste qui repointe vers la copie de service l'entrée MCP laissée : la même entrée, le chemin de `bin/holarch.js`
  // remplacé (sans lui, une entrée neuve qui lance `holarch mcp` par node, son environnement gardé), réécrite par
  // `claude mcp` dans la portée utilisateur du compte (`add` refuse un nom déjà pris : retirée d'abord).
  function repointer(c, { s, i }) {
    const holarch = binaireService(accueil);
    const entree = i < 0 ? { type: 'stdio', command: node, args: ['--no-warnings', holarch, 'mcp'], ...(s.env && { env: s.env }) } : { ...s, args: s.args.map((a, n) => (n === i ? holarch : a)) };
    return `${pourCompte(c.home)}claude mcp remove holarch --scope user && ${pourCompte(c.home)}claude mcp add-json holarch ${shell(JSON.stringify(entree))} --scope user`;
  }

  // Points d'entrée tenus par cette commande ; la garde et les crochets suivent `regles appliquer` (l'audit les voit).
  function pointsDEntree(src) {
    const holarch = binaireService(accueil); const o = { unites, systemctl, node };
    const essai = (point, f) => { try { return { point, ...f() }; } catch (e) { return { point, etat: 'erreur', message: e.message }; } };
    return [
      essai('interface', () => creerInterface({ holarch, accueil }, o).relancer()),
      essai('import', () => creerImport({ holarch, accueil }, o).poser()),
      essai('recolte', () => creerRecolte({ holarch, accueil }, o).poser()),
      essai('reveil', () => creerReveil({ holarch, accueil }, o).reecrire()),
      essai('veille', () => creerReveil({ holarch, accueil }, o).gardien({ veille })),
      essai('gitleaks des conteneurs', () => copierGitleaks(gitleaks, maison)),
      ...comptes.filter((c) => c.home).map((c) => essai(`mcp ${c.nom || c.home}`, () => {
        // Laissée (non reconnue, réglée ailleurs), le point dit la commande qui la repointe : celle de `holarch service`.
        const { fichier, cfg, s, i, lance } = entreeMcp(c, src);
        if (!s) return { etat: 'absent' };
        if (i < 0) return { etat: 'non reconnu', geste: repointer(c, { s, i }) };
        if (s.args[i] === holarch) return { etat: 'inchangé' };
        if (!lance) return { etat: `réglé ailleurs (${s.args[i]}) : laissé`, geste: repointer(c, { s, i }) };
        s.args[i] = holarch; ecrireJson(fichier, cfg);
        return { etat: 'posé (effet à la prochaine session de Claude Code)' };
      })),
    ];
  }

  return {
    etat() {
      const copie = copieEnService(accueil);
      const copies = fs.existsSync(dossier(accueil)) ? fs.readdirSync(dossier(accueil)).filter((d) => COMMIT.test(d)) : [];
      // L'entrée MCP de chaque compte : ce qu'elle lance ; laissée par la pose (réglée ailleurs, non reconnue), le geste
      // qui la repointe. Aucune clé de l'arbre ne porte ce chemin : c'est ici qu'il se voit.
      const src = sourceDe(); const holarch = binaireService(accueil);
      const mcp = comptes.filter((c) => c.home).map((c) => {
        const compte = c.nom || c.home;
        try {
          const m = entreeMcp(c, src);
          if (!m.s) return { compte, fichier: m.fichier, etat: 'absente' };
          const lance = Array.isArray(m.s.args) ? [m.s.command, ...m.s.args].join(' ') : m.s.url || m.s.command || JSON.stringify(m.s);
          if (m.lance) return { compte, fichier: m.fichier, lance, etat: m.s.args[m.i] === holarch ? m.lance : `${m.lance} : repointée à la prochaine pose (holarch service poser)` };
          return { compte, fichier: m.fichier, lance, etat: m.i < 0 ? 'non reconnue : laissée' : 'réglée ailleurs : laissée', geste: repointer(c, m) };
        } catch (e) { return { compte, etat: 'illisible', message: e.message }; }
      });
      return { copie, retard: retard(copie), copies, binaire: holarch, routines: etatRoutines({ unites, systemctl }), mcp };
    },

    /**
     * Pose `ref` (défaut HEAD). Une copie neuve se tire seulement de `HEAD` d'une copie de travail propre aux tests
     * verts ; une copie déjà présente se repose sans condition (retour arrière). Garde la copie posée et la précédente.
     */
    poser(ref = 'HEAD') {
      const orphelines = [dossier(accueil), path.dirname(gitleaksDesConteneurs(maison))].flatMap(retirerOrphelines);
      const src = sourceDe();
      if (!src) throw new Error('aucun dépôt source : lancer depuis la copie de travail du socle');
      const rev = (x) => { const r = git(src, ['rev-parse', '--short=12', '--verify', `${x}^{commit}`]); return r.status === 0 ? sortie(r) : null; };
      const commit = rev(ref);
      if (!commit) throw new Error(`commit inconnu dans ${src} : ${ref}`);
      const cible = path.join(dossier(accueil), commit);
      const nouvelle = !fs.existsSync(path.join(cible, FICHE));
      if (nouvelle) {
        if (commit !== rev('HEAD')) throw new Error(`${ref} n'est pas HEAD et n'a pas de copie : seule une copie déjà posée se repose`);
        const etat = git(src, ['status', '--porcelain']);
        if (etat.status !== 0 || sortie(etat)) throw new Error('copie de travail non propre : commiter d\'abord, la copie se tire d\'un commit vérifié');
        if (!npm) throw new Error('npm introuvable dans le PATH');
        const t = lancer(npm, ['test'], { cwd: src, env });
        if (t.status !== 0) throw new Error(`npm test rouge (${echec(t)}) : rien n'est posé`);
        fs.rmSync(cible, { recursive: true, force: true });
        installer(src, commit, cible);
      }
      const precedent = copieEnService(accueil)?.commit ?? null;
      // Bascule d'un coup : un lien neuf renommé sur l'ancien.
      const l = lien(accueil); const tmp = `${l}.pose-${process.pid}`;
      fs.rmSync(tmp, { force: true }); fs.symlinkSync(commit, tmp); fs.renameSync(tmp, l);
      // Reposer la copie en service ne retire rien : la copie précédente, celle du retour arrière, reste.
      const garder = new Set([commit, precedent]);
      const supprimees = precedent === commit ? [] : fs.readdirSync(dossier(accueil)).filter((d) => COMMIT.test(d) && !garder.has(d));
      for (const d of supprimees) fs.rmSync(path.join(dossier(accueil), d), { recursive: true, force: true });
      return { commit, source: src, nouvelle, precedent: precedent === commit ? null : precedent, supprimees, orphelines, points: pointsDEntree(src) };
    },
  };
}
