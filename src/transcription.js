// Lecture de la fin d'une transcription de Claude Code (JSON Lines), partagée par l'économie du contexte (taille,
// sessions coupées) et la veille retardée (session qui attend l'auteur) : une transcription peut peser des mégaoctets,
// seule sa fin est lue.
import fs from 'node:fs';

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
