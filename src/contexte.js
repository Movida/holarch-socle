// Économie du contexte (étape 3, tranche 7, décision passation-sereine) : ce que disent les crochets de Claude Code.
// `alerte` : au-delà d'un seuil, demander une passation (arbre à jour, puis /clear). `resume` : au démarrage d'une
// session, l'état du projet du dossier de travail, court, tiré des mêmes lectures que la vue Projets.
import fs from 'node:fs';
import path from 'node:path';
import { projetsDe, localiserProjet } from './projets.js';
import { etatDepot, integrationContinue } from './inventaire/depots-git.js';

/**
 * Taille du contexte d'une session : l'usage de sa dernière réponse (entrée + cache lu + cache écrit), lu à la fin de
 * la transcription ; null si rien n'est lisible. La transcription s'écrit en différé : un tour de retard est possible.
 */
export function tailleContexte(transcription, { octets = 1024 * 1024 } = {}) {
  let fd;
  try {
    fd = fs.openSync(transcription, 'r');
    const taille = fs.fstatSync(fd).size; const n = Math.min(taille, octets);
    const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, taille - n);
    const lignes = b.toString('utf8').split('\n');
    for (let i = lignes.length - 1; i >= 0; i--) {
      if (!lignes[i].includes('"usage"')) continue;
      let e; try { e = JSON.parse(lignes[i]); } catch { continue; } // première ligne coupée
      const u = e.type === 'assistant' ? e.message?.usage : null;
      if (u) return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    }
    return null;
  } catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

const k = (n) => `${Math.round(n / 1000)} k`;

/**
 * Avis de passation pour un message, ou null sous le seuil (crochet `UserPromptSubmit`). `regles` donne la règle
 * effective du dossier de travail, lue seulement au-delà du seuil : l'avis ne demande la leçon de clôture que si sa
 * règle s'applique, sans en recopier le texte (une seule source).
 */
export function alerte({ transcription, seuil, regles = () => [] }) {
  const t = tailleContexte(transcription);
  if (t == null || !(seuil > 0) || t < seuil) return null;
  let lecon = false; try { lecon = regles().some((e) => e.id === 'lecon-de-cloture' && e.applicable); } catch { /* l'avis passe sans elle */ }
  return {
    tokens: t,
    agent: `Contexte de ${k(t)} tokens, relu à chaque tour (seuil de passation : ${k(seuil)}). Termine la tâche en cours, `
      + 'mets à jour le journal et l’avancement du projet (passation), '
      + (lecon ? 'applique la règle `lecon-de-cloture`, ' : '')
      + 'puis propose à l’auteur de lancer /clear : la session suivante reprendra sur un résumé du projet.',
    auteur: `HOLARCH : contexte de ${k(t)} tokens relu à chaque tour — passation puis /clear conseillés.`,
  };
}

const court = (t, n) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

/** Règle effective du dossier de travail : celle de son projet, sinon ce qui vaut au compte. */
export function reglesDuDossier(s, dossier) {
  const p = localiserProjet(projetsDe(s.fiches({ kind: 'project' })))(path.resolve(dossier));
  return p ? s.regles({ projet: p.id }).regles : s.regles().compte.regles;
}

/** Résumé de reprise du projet d'un dossier (crochet `SessionStart`), `max` caractères au plus ; null hors projet. */
export function resume(s, dossier, { max = 1500 } = {}) {
  const p = localiserProjet(projetsDe(s.fiches({ kind: 'project' })))(path.resolve(dossier));
  if (!p) return null;
  const v = s.projets().projets.find((x) => x.id === p.id);
  if (!v) return null;
  const ecarts = s.ecartsOuverts().filter((o) => o.projet === p.id);
  const l = [`HOLARCH — reprise du projet ${v.nom} (résumé au démarrage ; le détail est dans son journal et l’avancement de l’étape).`];
  if (v.etape) {
    l.push(`Étape ${v.etape.numero} : ${court(v.etape.titre, 90)}${v.etape.close ? ' (close)' : ''}.`);
    if (v.etape.dernier_fait) l.push(`Dernier fait${v.etape.dernier_fait.date ? ` (${v.etape.dernier_fait.date})` : ''} : ${court(v.etape.dernier_fait.texte, 260)}`);
    if (v.etape.reste.length) l.push(`Reste : ${v.etape.reste.slice(0, 3).map((x) => court(x, 160).replace(/[.;]+$/, '')).join(' ; ')}.`);
  }
  if (ecarts.length) l.push(`Écarts ouverts : ${ecarts.length} (${ecarts.slice(0, 3).map((e) => court(e.message, 70)).join(' ; ')}).`);
  if (v.questions.length) l.push(`Questions ouvertes : ${v.questions.map((q) => q.id).join(', ')}.`);
  if (v.decisions.length) l.push(`Décisions à approuver : ${v.decisions.map((d) => court(d.titre, 60)).join(' ; ')}.`);
  // L'état du dépôt se lit en direct : celui de l'inventaire peut dater de l'heure précédente.
  const direct = v.chemin && fs.existsSync(v.chemin);
  const t = direct ? etatDepot(v.chemin) : v.technique;
  if (t.fichiers_modifies || t.en_avance) l.push(`Dépôt : ${t.fichiers_modifies} fichier(s) non commité(s), ${t.en_avance || 0} commit(s) non poussé(s).`);
  const ci = direct ? integrationContinue(v.chemin) : v.technique.integration_continue;
  if (ci) l.push(ci.length ? `Intégration continue : ${ci.join(', ')} (lire son résultat après un envoi).` : 'Intégration continue : aucune (rien à lire après un envoi).');
  const texte = l.join('\n');
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}
