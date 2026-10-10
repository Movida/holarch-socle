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

// Un rapport se lit dans la fin de la transcription du sous-agent : sa remise est son dernier geste.
const FIN_RAPPORT = 4 * 1024 * 1024;

/**
 * Le rapport final d'un sous-agent (`agent-<id>.jsonl`, dans les transcriptions des comptes `homes`) : le message qu'il
 * a remis par l'outil `SubagentHandback` (sous-agent de fond ; il n'est pas dans un texte), sinon son dernier texte.
 * L'identifiant se donne entier ou par un début qui n'en désigne qu'un. Une session reprise sous un autre identifiant
 * garde une copie de ses sous-agents (mesure du 2026-10-10 : 16 identifiants sur 461 en double) : la copie la plus
 * récente est lue, les autres sont dites. { id, description, transcription, copies, rapport } ; une erreur dit un
 * identifiant inconnu, ambigu, ou un sous-agent sans rapport.
 */
export function rapportSousAgent(homes, id) {
  const voulu = String(id ?? '').trim().replace(/^agent-/, '');
  if (!voulu) throw new Error('identifiant du sous-agent attendu');
  const nomDe = (f) => path.basename(f, '.jsonl').slice('agent-'.length);
  const trouves = [...new Set(homes.flatMap((h) => transcriptions(h)))].filter((f) => path.basename(f, '.jsonl').startsWith(`agent-${voulu}`));
  const noms = [...new Set(trouves.map(nomDe))];
  if (!noms.length) throw new Error(`aucun sous-agent ${voulu}`);
  if (noms.length > 1) throw new Error(`identifiant ambigu, ${noms.length} sous-agents : ${noms.join(', ')}`);
  const date = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  const [f, ...copies] = trouves.sort((a, b) => date(b) - date(a)); const nom = noms[0];
  let description = null;
  try { description = JSON.parse(fs.readFileSync(f.replace(/\.jsonl$/, '.meta.json'), 'utf8')).description ?? null; } catch { /* sans méta */ }
  for (const e of evenements(finDeTranscription(f, FIN_RAPPORT), '"assistant"')) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    const blocs = e.message.content;
    const remise = blocs.find((b) => b.type === 'tool_use' && b.name === 'SubagentHandback' && typeof b.input?.message === 'string');
    const texte = blocs.filter((b) => b.type === 'text' && b.text?.trim()).map((b) => b.text).join('\n');
    if (remise || texte) return { id: nom, description, transcription: f, copies, rapport: remise ? remise.input.message : texte };
  }
  throw new Error(`sous-agent ${nom} sans rapport lisible (${f})`);
}
