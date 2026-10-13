// Économie du contexte (étape 3, tranche 7, décision passation-sereine) : ce que disent les crochets de Claude Code.
// `alerte` : au-delà d'un seuil, demander une passation (arbre à jour, puis /clear). `resume` : au démarrage d'une
// session, l'état du projet du dossier de travail, court, tiré des mêmes lectures que la vue Projets.
import fs from 'node:fs';
import path from 'node:path';
import { projetsDe } from './projets.js';
import { etatDepot, integrationContinue, projetDuDepot, racine, tireDuCommit } from './inventaire/depots-git.js';
import { gitInventaire } from './inventaire/outils.js';
import { copieEnService, retard } from './service.js';
import { aApprouver } from './regles.js';
import { finDeTranscription, evenements } from './transcription.js';
import { heureLocale, lireJson, ecrireJson } from './commun.js';

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
 * `annoncees` ({ fichier: date de la coupure annoncée }, `coupuresAnnoncees`) écarte celles qu'une reprise a déjà dites.
 */
export function sessionsCoupees(transcription, { heures = 24, maintenant = Date.now(), octets = 1024 * 1024, annoncees = {} } = {}) {
  if (!transcription) return [];
  const dossier = path.dirname(transcription); let noms;
  try { noms = fs.readdirSync(dossier).filter((n) => n.endsWith('.jsonl') && path.join(dossier, n) !== path.resolve(transcription)); } catch { return []; }
  const coupees = [];
  for (const n of noms) {
    const f = path.join(dossier, n);
    let m; try { m = fs.statSync(f).mtimeMs; } catch { continue; }
    if (maintenant - m > heures * 3600 * 1000) continue;
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
  const annoncee = (c) => Date.parse(annoncees[c.fichier]) >= Date.parse(c.date);
  return coupees.filter((c) => !annoncee(c)).sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Les coupures déjà annoncées, marque durable écrite par la reprise qui les dit (une session ouverte après une coupure ne
 * prouve pas qu'elle l'a reçue : son crochet a pu échouer, ou elle s'est ouverte hors du projet). `noter` : ajoute les
 * coupures dites ; les marques de plus de 48 h s'oublient (au-delà de 24 h, une coupure ne s'annonce plus).
 */
export function coupuresAnnoncees(accueil, { maintenant = Date.now() } = {}) {
  const f = path.join(accueil, 'reprise-coupures.json');
  const lues = lireJson(f, {}) || {};
  return {
    lues,
    noter(coupees) {
      const gardees = Object.fromEntries(Object.entries(lues).filter(([, d]) => maintenant - Date.parse(d) <= 48 * 3600e3));
      ecrireJson(f, { ...gardees, ...Object.fromEntries(coupees.map((c) => [c.fichier, c.date])) });
    },
  };
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

// Le projet du dossier de travail. Le catalogue date du dernier inventaire : un worktree, ou un dépôt déplacé depuis, se
// rattache par son worktree principal ou son premier commit (`projetDuDepot`, comme la garde avant commit).
const projetDuDossier = (s, dossier) => projetDuDepot(projetsDe(s.projetsDuSite()), path.resolve(dossier));

/** Règle effective du dossier de travail : celle de son projet, sinon ce qui vaut au compte. */
export function reglesDuDossier(s, dossier) {
  const p = projetDuDossier(s, dossier);
  return p ? s.regles({ projet: p.id }).regles : s.regles().compte.regles;
}

/** Résumé de reprise du projet d'un dossier (crochet `SessionStart`), `max` caractères au plus ; null hors projet. */
export function resume(s, dossier, { max = 1500, transcription = null, maintenant = Date.now() } = {}) {
  const p = projetDuDossier(s, dossier);
  if (!p) return null;
  const v = s.projets().projets.find((x) => x.id === p.id);
  if (!v) return null;
  const ecarts = s.ecartsOuverts().filter((o) => o.projet === p.id);
  const l = [`HOLARCH — reprise du projet ${v.nom} (résumé au démarrage ; le détail est dans son journal et l’avancement de l’étape).`];
  // Avant le reste : une question restée sans réponse ne doit pas tomber sous la troncature. Les coupures dites sont
  // marquées (`coupuresAnnoncees`), sans accueil elles se redisent.
  const marques = s.config?.accueil ? coupuresAnnoncees(s.config.accueil, { maintenant }) : null;
  const coupees = sessionsCoupees(transcription, { maintenant, annoncees: marques?.lues }).slice(0, 3);
  if (coupees.length) {
    l.push(`Session(s) arrêtée(s) en route (24 h) : ${coupees.map((c) => `${heureLocale(c.date)}, ${c.question ? `question restée sans réponse : « ${court(c.question, 120)} »` : `pendant ${c.outil}${c.quoi ? ` (${court(c.quoi, 60)})` : ''}`}`).join(' ; ')}. À signaler à l’auteur.`);
    try { marques?.noter(coupees); } catch { /* marque non écrite : la coupure se redira à la reprise suivante */ }
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
  // L'état du dépôt se lit en direct : celui de l'inventaire peut dater de l'heure précédente. Il se lit dans le dépôt du
  // dossier de travail (`--show-toplevel`) quand c'est celui du projet (même premier commit) : le chemin du catalogue est
  // l'ancien pour un dépôt déplacé, le worktree principal pour un worktree ; un dépôt imbriqué étranger ne parle pas pour lui.
  const direct = v.chemin && fs.existsSync(v.chemin);
  const ici = gitInventaire(path.resolve(dossier), ['rev-parse', '--show-toplevel']);
  const depot = ici && tireDuCommit(p.id, racine(ici)) ? ici : direct ? v.chemin : null;
  const t = depot ? etatDepot(depot) : v.technique;
  if (t.fichiers_modifies || t.en_avance) l.push(`Dépôt : ${t.fichiers_modifies} fichier(s) non commité(s), ${t.en_avance || 0} commit(s) non poussé(s).`);
  // La copie que lancent les services, quand ce projet en est la source (décision copie-de-service).
  const copie = s.config?.accueil ? copieEnService(s.config.accueil) : null;
  if (direct && copie?.source && path.resolve(copie.source) === path.resolve(v.chemin)) {
    const n = retard(copie); if (n) l.push(`Copie de service : ${n} commit(s) de retard sur HEAD (\`holarch service poser\`).`);
  }
  const ci = depot ? integrationContinue(depot) : v.technique.integration_continue;
  if (ci) l.push(ci.length ? `Intégration continue : ${ci.join(', ')} (lire son résultat après un envoi).` : 'Intégration continue : aucune (rien à lire après un envoi).');
  const texte = l.join('\n');
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}
