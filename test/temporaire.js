// Dossiers temporaires des tests : rangés sous une racine propre au fichier de test (`node --test` lance un processus
// par fichier), effacée à sa sortie. TMPDIR y pointe aussi, pour les commandes que les tests lancent. Laissés dans /tmp,
// ils s'entassaient (≈ 6 800 fichiers par `npm test`) et le démarrage suivant de WSL passait des minutes à les vider.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-tests-'));
process.env.TMPDIR = racine;
process.on('exit', () => { try { fs.rmSync(racine, { recursive: true, force: true }); } catch { /* laissé au vidage du démarrage */ } });

export const tmp = (prefixe = 'holarch-') => fs.mkdtempSync(path.join(racine, prefixe));
