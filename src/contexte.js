// Économie du contexte (étape 3, tranche 7, décision passation-sereine) : ce que disent les crochets de Claude Code.
// `alerte` : au-delà d'un seuil, demander une passation (arbre à jour, puis /clear). `resume` : au démarrage d'une
// session, l'état du projet du dossier de travail, court, tiré des mêmes lectures que la vue Projets.
import fs from 'node:fs';
import path from 'node:path';
import { projetsDe, localiserProjet } from './projets.js';
import { etatDepot, integrationContinue } from './inventaire/depots-git.js';
import { copieEnService, retard } from './service.js';
import { aApprouver } from './regles.js';

/** Lignes JSON de la fin d'une transcription (les `octets` derniers), de la plus récente à la plus ancienne. */
function finDeTranscription(transcription, octets) {
  let fd;
  try {
    fd = fs.openSync(transcription, 'r');
    const taille = fs.fstatSync(fd).size; const n = Math.min(taille, octets);
    const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, taille - n);
    return b.toString('utf8').split('\n').reverse();
  } catch { return []; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

const evenements = function* (lignes, filtre = '') {
  for (const l of lignes) {
    if (!l.includes(filtre)) continue;
    try { yield JSON.parse(l); } catch { /* première ligne coupée */ }
  }
};

/**
 * Taille du contexte d'une session : l'usage de sa dernière réponse (entrée + cache lu + cache écrit), lu à la fin de
 * la transcription ; null si rien n'est lisible. La transcription s'écrit en différé : un tour de retard est possible.
 */
export function tailleContexte(transcription, { octets = 1024 * 1024 } = {}) {
  for (const e of evenements(finDeTranscription(transcription, octets), '"usage"')) {
    const u = e.type === 'assistant' ? e.message?.usage : null;
    if (u) return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  }
  return null;
}

/**
 * Sessions du même dossier arrêtées en route depuis `heures` : leur dernier message est un appel d'outil resté sans
 * résultat (veille du poste, redémarrage d'un accès distant). La session en cours est exclue. Une interruption voulue
 * (Échap) laisse un message de l'auteur après l'appel : elle n'en est pas une. Une coupure n'est annoncée qu'une fois :
 * une autre session du dossier ouverte après elle l'a déjà reçue à sa reprise.
 */
export function sessionsCoupees(transcription, { heures = 24, maintenant = Date.now(), octets = 1024 * 1024 } = {}) {
  if (!transcription) return [];
  const dossier = path.dirname(transcription); let noms;
  try { noms = fs.readdirSync(dossier).filter((n) => n.endsWith('.jsonl') && path.join(dossier, n) !== path.resolve(transcription)); } catch { return []; }
  const coupees = []; const debuts = [];
  for (const n of noms) {
    const f = path.join(dossier, n);
    let m; try { m = fs.statSync(f).mtimeMs; } catch { continue; }
    if (maintenant - m > heures * 3600 * 1000) continue;
    debuts.push({ fichier: f, debut: debutDeTranscription(f) });
    for (const e of evenements(finDeTranscription(f, octets))) {
      if ((e.type !== 'user' && e.type !== 'assistant') || e.isSidechain) continue;
      const appels = e.type === 'assistant' && Array.isArray(e.message?.content) ? e.message.content.filter((c) => c.type === 'tool_use') : [];
      if (appels.length) {
        const q = appels.find((c) => c.name === 'AskUserQuestion')?.input?.questions?.[0]?.question;
        coupees.push({ fichier: f, date: e.timestamp || new Date(m).toISOString(), question: q || null, outil: appels[0].name, quoi: appels[0].input?.description || null });
      }
      break;
    }
  }
  const annoncee = (c) => debuts.some((d) => d.fichier !== c.fichier && d.debut > Date.parse(c.date));
  return coupees.filter((c) => !annoncee(c)).sort((a, b) => b.date.localeCompare(a.date));
}

/** Date du premier événement daté d'une transcription (ses `octets` premiers), en millisecondes ; NaN sinon. */
function debutDeTranscription(transcription, octets = 64 * 1024) {
  let fd;
  try {
    fd = fs.openSync(transcription, 'r');
    const b = Buffer.alloc(octets); const n = fs.readSync(fd, b, 0, octets, 0);
    for (const e of evenements(b.subarray(0, n).toString('utf8').split('\n'), '"timestamp"')) {
      const t = Date.parse(e.timestamp); if (!Number.isNaN(t)) return t;
    }
  } catch { /* illisible : ne masque rien */ } finally { if (fd !== undefined) fs.closeSync(fd); }
  return NaN;
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
export function resume(s, dossier, { max = 1500, transcription = null, maintenant = Date.now() } = {}) {
  const p = localiserProjet(projetsDe(s.fiches({ kind: 'project' })))(path.resolve(dossier));
  if (!p) return null;
  const v = s.projets().projets.find((x) => x.id === p.id);
  if (!v) return null;
  const ecarts = s.ecartsOuverts().filter((o) => o.projet === p.id);
  const l = [`HOLARCH — reprise du projet ${v.nom} (résumé au démarrage ; le détail est dans son journal et l’avancement de l’étape).`];
  // Avant le reste : une question restée sans réponse ne doit pas tomber sous la troncature.
  const coupees = sessionsCoupees(transcription, { maintenant });
  if (coupees.length) {
    const heure = (d) => new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    l.push(`Session(s) arrêtée(s) en route (24 h) : ${coupees.slice(0, 3).map((c) => `${heure(c.date)}, ${c.question ? `question restée sans réponse : « ${court(c.question, 120)} »` : `pendant ${c.outil}${c.quoi ? ` (${court(c.quoi, 60)})` : ''}`}`).join(' ; ')}. À signaler à l’auteur.`);
  }
  if (v.etape) {
    l.push(`Étape ${v.etape.numero} : ${court(v.etape.titre, 90)}${v.etape.close ? ' (close)' : ''}.`);
    if (v.etape.dernier_fait) l.push(`Dernier fait${v.etape.dernier_fait.date ? ` (${v.etape.dernier_fait.date})` : ''} : ${court(v.etape.dernier_fait.texte, 260)}`);
    if (v.etape.reste.length) l.push(`Reste : ${v.etape.reste.slice(0, 3).map((x) => court(x, 160).replace(/[.;]+$/, '')).join(' ; ')}.`);
  }
  if (ecarts.length) l.push(`Écarts ouverts : ${ecarts.length} (${ecarts.slice(0, 3).map((e) => court(e.message, 70)).join(' ; ')}).`);
  if (v.questions.length) l.push(`Questions ouvertes : ${v.questions.map((q) => q.id).join(', ')}.`);
  if (v.idees.length) l.push(`Idées pour l’étape ${v.etape.numero} (\`arbre/idees.md\`) : ${v.idees.map((i) => i.id).join(', ')}.`);
  if (v.decisions.length) l.push(`Décisions à approuver : ${v.decisions.map((d) => court(d.titre, 60)).join(' ; ')}.`);
  // Règles proposées (récolte, décision recolte) que ce projet recevrait : celles de son nœud et de ses couches.
  const proposees = s.regles({ projet: p.id }).regles.filter(aApprouver);
  if (proposees.length) l.push(`Règles à approuver : ${proposees.length} (${proposees.slice(0, 4).map((e) => e.id).join(', ')}${proposees.length > 4 ? '…' : ''}), page « Règles ».`);
  // L'état du dépôt se lit en direct : celui de l'inventaire peut dater de l'heure précédente.
  const direct = v.chemin && fs.existsSync(v.chemin);
  const t = direct ? etatDepot(v.chemin) : v.technique;
  if (t.fichiers_modifies || t.en_avance) l.push(`Dépôt : ${t.fichiers_modifies} fichier(s) non commité(s), ${t.en_avance || 0} commit(s) non poussé(s).`);
  // La copie que lancent les services, quand ce projet en est la source (décision copie-de-service).
  const copie = s.config?.accueil ? copieEnService(s.config.accueil) : null;
  if (direct && copie?.source && path.resolve(copie.source) === path.resolve(v.chemin)) {
    const n = retard(copie); if (n) l.push(`Copie de service : ${n} commit(s) de retard sur HEAD (\`holarch service poser\`).`);
  }
  const ci = direct ? integrationContinue(v.chemin) : v.technique.integration_continue;
  if (ci) l.push(ci.length ? `Intégration continue : ${ci.join(', ')} (lire son résultat après un envoi).` : 'Intégration continue : aucune (rien à lire après un envoi).');
  const texte = l.join('\n');
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}
