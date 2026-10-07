// Copie de service (décision copie-de-service, idée I16) : les points d'entrée de HOLARCH (import horaire, interface,
// crochets de Claude Code, serveur MCP, garde avant commit) lancent une copie du socle tirée d'un commit, jamais la copie
// de travail. Les outils font le travail (`git archive`, `npm ci`) ; HOLARCH exporte, installe et bascule un lien.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { git, lireJson, ecrireJson, trouverOutil, configClaude } from './commun.js';
import { creerInterface, creerImport, creerRecolte } from './distant.js';

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

export function creerService({ accueil, comptes = [] }, {
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

  // Points d'entrée tenus par cette commande ; la garde et les crochets suivent `regles appliquer` (l'audit les voit).
  function pointsDEntree() {
    const holarch = binaireService(accueil); const o = { unites, systemctl, node };
    const essai = (point, f) => { try { return { point, ...f() }; } catch (e) { return { point, etat: 'erreur', message: e.message }; } };
    return [
      essai('interface', () => creerInterface({ holarch, accueil }, o).relancer()),
      essai('import', () => creerImport({ holarch, accueil }, o).poser()),
      essai('recolte', () => creerRecolte({ holarch, accueil }, o).poser()),
      ...comptes.filter((c) => c.home).map((c) => essai(`mcp ${c.nom || c.home}`, () => {
        const f = configClaude(c.home); const cfg = lireJson(f, null, { strict: true });
        const s = cfg?.mcpServers?.holarch;
        if (!s || !Array.isArray(s.args)) return { etat: 'absent' };
        const i = s.args.findIndex((a) => /(^|\/)bin\/holarch\.js$/.test(a));
        if (i < 0 || s.args[i] === holarch) return { etat: i < 0 ? 'non reconnu' : 'inchangé' };
        s.args[i] = holarch; ecrireJson(f, cfg);
        return { etat: 'posé (effet à la prochaine session de Claude Code)' };
      })),
    ];
  }

  return {
    etat() {
      const copie = copieEnService(accueil);
      const copies = fs.existsSync(dossier(accueil)) ? fs.readdirSync(dossier(accueil)).filter((d) => COMMIT.test(d)) : [];
      return { copie, retard: retard(copie), copies, binaire: binaireService(accueil) };
    },

    /**
     * Pose `ref` (défaut HEAD). Une copie neuve se tire seulement de `HEAD` d'une copie de travail propre aux tests
     * verts ; une copie déjà présente se repose sans condition (retour arrière). Garde la copie posée et la précédente.
     */
    poser(ref = 'HEAD') {
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
      const garder = new Set([commit, precedent]);
      const supprimees = fs.readdirSync(dossier(accueil)).filter((d) => COMMIT.test(d) && !garder.has(d));
      for (const d of supprimees) fs.rmSync(path.join(dossier(accueil), d), { recursive: true, force: true });
      return { commit, source: src, nouvelle, precedent: precedent === commit ? null : precedent, supprimees, points: pointsDEntree() };
    },
  };
}
