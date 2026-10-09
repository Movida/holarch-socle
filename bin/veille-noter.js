#!/usr/bin/env node
// Crochets de Claude Code (veille retardée) : `veille-noter.js <événement>`, l'entrée JSON du crochet sur l'entrée
// standard. Point d'entrée léger, à part de bin/holarch.js (qui charge tout le socle et ses dépendances installées) : ses
// modules, sans dépendance installée, se chargent dans le `try`. Une erreur ne fait jamais échouer un tour : gardée
// datée dans l'accueil, le contrôle `veille-retardee` la signale, et la note réussie suivante l'efface. Une note non
// faite (entrée vide, identifiant illisible, événement non suivi) est une erreur de même, sauf pour une session locale.
// Si les modules ne se chargent pas, il sort en erreur et la commande du crochet écrit elle-même l'erreur (module
// regles-claude-code).
import { readFileSync } from 'node:fs';

const [evenement] = process.argv.slice(2);
let veille = null; let accueil = null;
try {
  veille = await import('../src/veille.js');
  ({ accueil } = await import('../src/commun.js'));
  const r = veille.noter({ evenement, entree: JSON.parse(readFileSync(0, 'utf8') || '{}'), accueil: accueil() });
  if (r.note) veille.effacerErreur(accueil());
  else if (r.raison !== 'session locale') throw new Error(r.raison);
} catch (e) {
  console.error(`holarch veille : ${e.message}`);
  if (veille && accueil) veille.noterErreur(accueil(), evenement, e); else process.exitCode = 1;
}
