#!/usr/bin/env node
// Épreuve d'un test, l'habitude des corrections : un test neuf doit échouer sur le code d'avant, et une branche nouvelle
// sur le mutant qui la retire. Sur une copie de la copie de travail (sans `.git`, `node_modules` lié), dans un dossier
// temporaire retiré ensuite ; les tests du motif doivent d'abord passer sur la copie telle quelle.
//   npm run eprouver -- parent "<motif de test>" <fichier>…    fichiers remis à leur état de HEAD (absents : retirés)
//   npm run eprouver -- mutant "<motif de test>" <fichier> "<expression>" "<remplacement>"    (RegExp JS, drapeau s)
// Code de sortie : 0 si les tests du motif échouent (le test prouve), 1 s'ils passent ou si seul le chargement d'un
// fichier de test échoue (il ne prouve rien : éprouver par un mutant), 2 si l'épreuve ne peut pas se faire.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git } from '../src/commun.js';

const USAGE = 'usage : eprouver parent "<motif>" <fichier>… | eprouver mutant "<motif>" <fichier> "<expression>" "<remplacement>"';

// Les tests du motif dans `dossier` : { n, echecs, erreur }. Le contexte d'un lanceur de tests parent est retiré (sans
// quoi le lanceur enfant lui parlerait au lieu d'écrire son rapport).
function lancer(dossier, motif) {
  const tests = fs.readdirSync(path.join(dossier, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('test', f));
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--no-warnings', '--test-reporter=spec', `--test-name-pattern=${motif}`, ...tests],
    { cwd: dossier, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900e3 });
  if (r.error) return { erreur: r.error.message };
  // Un fichier de test se dit comme un test : sans test retenu par le motif, ou s'il ne se charge pas.
  const [avant, apres = ''] = `${r.stdout || ''}${r.stderr || ''}`.split(/^✖ failing tests:/m);
  const noms = (t, m) => [...new Set(t.match(m) || [])].map((l) => l.slice(2).replace(/ \([\d.]+m?s\)$/, ''));
  return { n: noms(avant, /^[✔✖] .+$/gm).filter((x) => !x.endsWith('.test.js')).length, echecs: noms(apres, /^✖ .+$/gm) };
}

export function eprouver({ racine, mode, motif, fichiers = [], fichier = null, expression = null, remplacement = '' }) {
  if (!['parent', 'mutant'].includes(mode) || !motif || (mode === 'parent' ? !fichiers.length : !fichier || !expression)) return { code: 2, message: USAGE };
  const copie = fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-eprouver-'));
  try {
    fs.cpSync(racine, copie, { recursive: true, filter: (s) => !['.git', 'node_modules'].includes(path.relative(racine, s).split(path.sep)[0]) });
    if (fs.existsSync(path.join(racine, 'node_modules'))) fs.symlinkSync(path.join(racine, 'node_modules'), path.join(copie, 'node_modules'));
    const temoin = lancer(copie, motif);
    if (temoin.erreur) return { code: 2, message: `tests non lancés : ${temoin.erreur}` };
    if (!temoin.n) return { code: 2, message: `aucun test ne correspond au motif « ${motif} »` };
    if (temoin.echecs.length) return { code: 2, message: `déjà rouge sur la copie telle quelle : ${temoin.echecs.join(' ; ')}` };
    if (mode === 'parent') {
      for (const f of fichiers) {
        const r = git(racine, ['show', `HEAD:${f}`]);
        if (r.status === 0) fs.writeFileSync(path.join(copie, f), r.stdout);
        else fs.rmSync(path.join(copie, f), { force: true });
      }
    } else {
      const f = path.join(copie, fichier); const avant = fs.readFileSync(f, 'utf8');
      const apres = avant.replace(new RegExp(expression, 's'), remplacement);
      if (apres === avant) return { code: 2, message: 'mutation sans effet : l’expression ne trouve rien' };
      fs.writeFileSync(f, apres);
    }
    const r = lancer(copie, motif);
    if (r.erreur) return { code: 2, message: `tests non lancés : ${r.erreur}` };
    const chargement = r.echecs.filter((e) => e.endsWith('.test.js'));
    if (r.echecs.length && chargement.length === r.echecs.length) return { code: 1, message: `seul le chargement échoue (${chargement.join(', ')}) : l’épreuve ne prouve rien, éprouver par un mutant` };
    if (!r.echecs.length) return { code: 1, message: `${r.n} test(s) vert(s) : le test ne prouve rien` };
    return { code: 0, message: `rouge, comme attendu : ${r.echecs.join(' ; ')}` };
  } finally {
    fs.rmSync(copie, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, motif, ...reste] = process.argv.slice(2);
  const o = mode === 'mutant' ? { fichier: reste[0], expression: reste[1], remplacement: reste[2] ?? '' } : { fichiers: reste };
  const r = eprouver({ racine: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), mode, motif, ...o });
  console.log(r.message);
  process.exit(r.code);
}
