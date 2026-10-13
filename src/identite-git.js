// Identité de commit (décision identite-par-contexte) : git choisit déjà une identité par dépôt (réglage local) ;
// HOLARCH y pose celle que déclare la configuration effective, là où l'identité que git prendrait en diffère. Ce qu'il a
// posé est noté dans le même réglage local (`holarch.identite`) : un réglage local posé à la main n'est jamais remplacé
// ni retiré, il est dit. La note restée sans réglage local dit un retrait à la main de ce que HOLARCH avait posé : la
// garde d'identité est bloquante, et sans réglage local git prendrait l'identité du compte, que chaque commit ferait
// refuser ; l'identité est donc reposée, et dite (décision geste-a-la-main) : une autre identité ici se déclare au projet.
import { git, configGit } from './commun.js';
import { memeIdentite } from './controles.js';

export const NOTE_IDENTITE = 'holarch.identite';
/** Ce que disent la création et `regles appliquer` d'une identité reposée (`repose`). */
export const REPOSEE = 'retirée à la main : reposée ; pour une autre identité ici, déclarer `identite` au projet';
const texte = (i) => `${i.nom} <${i.email}>`;

/**
 * Pose, met à jour ou retire l'identité locale d'un dépôt selon `voulue` ({nom, email}, ou null) : { etat } avec `etat`
 * parmi pose · modifie · repose (celle que HOLARCH avait posée, retirée à la main) · inchange · retire · note-retiree
 * (plus voulue, la note d'un réglage local qui n'est plus celui de HOLARCH : lui reste) · absent · ignore (réglage local
 * posé à la main ; `note` : HOLARCH avait posé le sien) · hors-git. `ecrire: false` : dit seulement.
 */
export function poserIdentite(depot, voulue, { ecrire = true } = {}) {
  if (git(depot, ['rev-parse', '--git-dir']).status !== 0) return { etat: 'hors-git' };
  const lire = (cle, ...o) => configGit(depot, cle, ...o);
  const locale = { nom: lire('user.name', '--local'), email: lire('user.email', '--local') };
  const effective = { nom: lire('user.name'), email: lire('user.email') };
  const note = lire(NOTE_IDENTITE, '--local');
  // Le réglage local est le nôtre s'il est exactement ce que HOLARCH a noté avoir posé.
  const notre = Boolean(note) && note === texte(locale);
  const fixer = (...args) => { const r = git(depot, ['config', '--local', ...args]); if (r.status !== 0 && args[0] !== '--unset') throw new Error((r.stderr || '').trim() || 'git config en échec'); };
  if (!voulue) {
    // Plus voulue : la note part toujours (orpheline, elle ferait prendre un retrait à la main pour celui de HOLARCH) ;
    // le réglage local seulement s'il est celui que HOLARCH avait posé.
    if (!note) return { etat: 'absent' };
    if (ecrire) { if (notre) { fixer('--unset', 'user.name'); fixer('--unset', 'user.email'); } fixer('--unset', NOTE_IDENTITE); }
    return { etat: notre ? 'retire' : 'note-retiree' };
  }
  if (memeIdentite(effective, voulue)) return { etat: 'inchange' };
  if (!notre && (locale.nom || locale.email)) return { etat: 'ignore', note: Boolean(note) };
  if (ecrire) { fixer('user.name', voulue.nom); fixer('user.email', voulue.email); fixer(NOTE_IDENTITE, texte(voulue)); }
  return { etat: notre ? 'modifie' : note ? 'repose' : 'pose' };
}
