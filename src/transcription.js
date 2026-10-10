// Transcriptions de Claude Code (JSON Lines) : où elles vivent, parcours partagé par l'import et la veille retardée ;
// lecture de leur fin, partagée par l'économie du contexte (taille, sessions coupées) et la veille (session qui attend
// l'auteur) : une transcription peut peser des mégaoctets, seule sa fin est lue.
import fs from 'node:fs';
import path from 'node:path';

// Sous `<home>/projects/<projet>/` : la conversation principale `<session>.jsonl`, et ses sous-agents à tout niveau sous
// `<session>/subagents/` (ceux d'un workflow dans `workflows/wf_<id>/`). Le journal d'un workflow (`wf_<id>/journal.jsonl`,
// ses étapes, sans tour ni usage) n'en est pas une. Mesure du 2026-10-10 : 293 conversations, 288 sous-agents directs,
// 187 agents de workflow et 8 journaux, rien ailleurs. Un dossier illisible est passé, un lien n'est pas suivi.
const PROFONDEUR_SOUS_AGENTS = 4; // `workflows/wf_<id>/` en prend deux
const lister = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } };

/** Les transcriptions des sous-agents d'une session (`<dossier de la session>/subagents/…`), journaux de workflow exclus. */
export function sousAgents(dossierSession) {
  const out = [];
  const marcher = (d, n) => {
    for (const e of lister(d)) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (n < PROFONDEUR_SOUS_AGENTS) marcher(p, n + 1); }
      else if (e.isFile() && e.name.endsWith('.jsonl') && !(e.name === 'journal.jsonl' && path.basename(d).startsWith('wf_'))) out.push(p);
    }
  };
  marcher(path.join(dossierSession, 'subagents'), 0);
  return out;
}

/** Les transcriptions d'un compte (`<home>/projects/…`), sous-agents compris, mémoires exclues. */
export function transcriptions(home) {
  const projets = path.join(home, 'projects'); const out = [];
  for (const p of lister(projets)) {
    if (!p.isDirectory()) continue;
    const d = path.join(projets, p.name);
    for (const e of lister(d)) {
      const f = path.join(d, e.name);
      if (e.isFile() && e.name.endsWith('.jsonl')) out.push(f);
      else if (e.isDirectory() && e.name !== 'memory') out.push(...sousAgents(f));
    }
  }
  return out;
}

/** Lignes JSON de la fin d'une transcription (les `octets` derniers), de la plus récente à la plus ancienne. */
export function finDeTranscription(transcription, octets) {
  let fd;
  try {
    fd = fs.openSync(transcription, 'r');
    const taille = fs.fstatSync(fd).size; const n = Math.min(taille, octets);
    const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, taille - n);
    return b.toString('utf8').split('\n').reverse();
  } catch { return []; } finally { if (fd !== undefined) fs.closeSync(fd); }
}

/** Événements lisibles parmi des lignes, ceux qui contiennent `filtre` ; une ligne coupée est sautée. */
export const evenements = function* (lignes, filtre = '') {
  for (const l of lignes) {
    if (!l.includes(filtre)) continue;
    try { yield JSON.parse(l); } catch { /* première ligne coupée */ }
  }
};
