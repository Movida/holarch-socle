// Identité de commit (décision identite-par-contexte) : git choisit déjà une identité par dépôt (réglage local) ;
// HOLARCH y pose celle que déclare la configuration effective, là où l'identité que git prendrait en diffère. Ce qu'il a
// posé est noté dans le même réglage local (`holarch.identite`) : un réglage local posé à la main n'est jamais remplacé
// ni retiré, il est dit. La note restée sans réglage local dit un retrait à la main : l'identité n'est pas reposée (dit
// aussi) tant que la note reste ; la retirer (`NOTE_IDENTITE`) la fait reposer.
import { git } from './commun.js';
import { memeIdentite } from './controles.js';

export const NOTE_IDENTITE = 'holarch.identite';
const texte = (i) => `${i.nom} <${i.email}>`;

/**
 * Pose, met à jour ou retire l'identité locale d'un dépôt selon `voulue` ({nom, email}, ou null) : { etat } avec `etat`
 * parmi pose · modifie · inchange · retire · absent · ignore (réglage local posé à la main ; `note` : HOLARCH avait posé
 * le sien) · retire-a-la-main (celle que HOLARCH avait posée) · hors-git. `ecrire: false` : dit seulement.
 */
export function poserIdentite(depot, voulue, { ecrire = true } = {}) {
  if (git(depot, ['rev-parse', '--git-dir']).status !== 0) return { etat: 'hors-git' };
  const lire = (cle, ...o) => (git(depot, ['config', ...o, '--get', cle]).stdout || '').trim();
  const locale = { nom: lire('user.name', '--local'), email: lire('user.email', '--local') };
  const effective = { nom: lire('user.name'), email: lire('user.email') };
  const note = lire(NOTE_IDENTITE, '--local');
  // Le réglage local est le nôtre s'il est exactement ce que HOLARCH a noté avoir posé.
  const notre = Boolean(note) && note === texte(locale);
  const fixer = (...args) => { const r = git(depot, ['config', '--local', ...args]); if (r.status !== 0 && args[0] !== '--unset') throw new Error((r.stderr || '').trim() || 'git config en échec'); };
  if (!voulue) {
    if (!notre) return { etat: 'absent' };
    if (ecrire) { fixer('--unset', 'user.name'); fixer('--unset', 'user.email'); fixer('--unset', NOTE_IDENTITE); }
    return { etat: 'retire' };
  }
  if (memeIdentite(effective, voulue)) return { etat: 'inchange' };
  if (!notre && (locale.nom || locale.email)) return { etat: 'ignore', note: Boolean(note) };
  if (note && !notre) return { etat: 'retire-a-la-main' };
  if (ecrire) { fixer('user.name', voulue.nom); fixer('user.email', voulue.email); fixer(NOTE_IDENTITE, texte(voulue)); }
  return { etat: notre ? 'modifie' : 'pose' };
}
