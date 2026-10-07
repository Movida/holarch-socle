// Garde avant commit (décision controles-de-regles) : un crochet `pre-commit` de git, posé par projet, qui appelle
// `holarch garde avant-commit`. Git l'exécute pour quiconque commite dans le clone (agents et humain). Le crochet est
// local au clone, jamais versionné ; il porte une MARQUE, et un crochet non marqué n'est jamais remplacé ni retiré.
// HOLARCH injoignable, le crochet laisse passer et le dit : l'audit rattrape ce qui serait passé.
import fs from 'node:fs';
import path from 'node:path';
import { shell as sh, porteMarque, git } from './commun.js';

export const MARQUE = '# Généré par HOLARCH (holarch regles appliquer) : garde avant commit.';

/** Texte du crochet : le binaire node, la ligne de commande HOLARCH et son répertoire de travail, figés à l'écriture. */
export function crochetDe({ node = process.execPath, holarch, accueil }) {
  return `#!/bin/sh
${MARQUE}
# Retiré par holarch regles appliquer quand plus aucune règle ne le demande.
N=${sh(node)}
H=${sh(holarch)}
if [ -x "$N" ] && [ -f "$H" ]; then HOLARCH_HOME=${sh(accueil)} exec "$N" --no-warnings "$H" garde avant-commit; fi
echo "HOLARCH injoignable : commit non contrôlé (l'audit le verra)" >&2
exit 0
`;
}

/** Chemin du crochet d'un clone (`core.hooksPath` et worktrees compris) ; null hors d'un dépôt git. */
export function fichierCrochet(depot) {
  const r = git(depot, ['rev-parse', '--git-path', 'hooks/pre-commit']);
  return r.status === 0 ? path.resolve(depot, r.stdout.trim()) : null;
}

/**
 * Pose, met à jour ou retire le crochet selon `voulu` (son texte, ou null) : { etat, fichier } avec `etat` parmi
 * pose · modifie · inchange · retire · absent · ignore (crochet non marqué) · hors-git · erreur (emplacement non inscriptible,
 * par exemple un `core.hooksPath` qui vise un chemin d'un autre montage : `raison` le dit). `ecrire: false` : dit seulement.
 */
export function poserCrochet(depot, voulu, { ecrire = true } = {}) {
  const fichier = fichierCrochet(depot);
  if (!fichier) return { etat: 'hors-git', fichier: null };
  const present = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : null;
  if (present != null && !porteMarque(present, MARQUE)) return { etat: 'ignore', fichier };
  if (!voulu) {
    if (present == null) return { etat: 'absent', fichier };
    if (ecrire) fs.unlinkSync(fichier);
    return { etat: 'retire', fichier };
  }
  if (present === voulu) return { etat: 'inchange', fichier };
  if (ecrire) {
    try { fs.mkdirSync(path.dirname(fichier), { recursive: true }); fs.writeFileSync(fichier, voulu, { mode: 0o755 }); fs.chmodSync(fichier, 0o755); } catch (e) { return { etat: 'erreur', fichier, raison: e.code || e.message }; }
  }
  return { etat: present == null ? 'pose' : 'modifie', fichier };
}
