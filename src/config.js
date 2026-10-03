// Configuration d'une installation : un fichier YAML dans le répertoire de travail (hors dépôt), fusionné sur des
// défauts. Toute option est une donnée (principe P3) ; rien de personnel n'est codé ici.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';

export const accueil = () => process.env.HOLARCH_HOME || path.join(os.homedir(), '.holarch');

const DEFAUTS = () => ({
  site: 'local',
  donnees: accueil(),
  web: { hote: '127.0.0.1', port: 4280 },
  inventaire: {
    'claude-code': { actif: true, home: path.join(os.homedir(), '.claude'), config: path.join(os.homedir(), '.claude.json') },
    'depots-git': { actif: true, racines: [os.homedir()], profondeur: 3, ignorer: ['node_modules', '.cache', '.npm', '.local'] },
    arbre: { actif: true, depots: [] },
  },
  import: {
    'claude-code-transcriptions': { actif: true, home: path.join(os.homedir(), '.claude'), calme_minutes: 10 },
  },
  // Tarifs en USD par million de tokens, par identifiant de modèle : { entree, cache_ecrit, cache_lu, sortie }.
  // Vide par défaut : aucun tarif n'est inventé ; sans tarif, le coût reste inconnu et seuls les tokens sont comptés.
  tarifs: {},
});

const fusion = (a, b) => {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b === undefined ? a : b;
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) r[k] = k in r ? fusion(r[k], v) : v;
  return r;
};
const developper = (v) => (typeof v === 'string' && v.startsWith('~') ? path.join(os.homedir(), v.slice(1)) : Array.isArray(v) ? v.map(developper) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, developper(x)])) : v);

export function chargerConfig(fichier = path.join(accueil(), 'config.yaml')) {
  let utilisateur = {};
  if (fs.existsSync(fichier)) utilisateur = YAML.parse(fs.readFileSync(fichier, 'utf8')) || {};
  return developper(fusion(DEFAUTS(), utilisateur));
}

export function ecrireConfigExemple(fichier = path.join(accueil(), 'config.yaml')) {
  if (fs.existsSync(fichier)) return false;
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, `# Configuration HOLARCH de ce site (hors dépôt). Toute clé absente prend sa valeur par défaut.
site: local
web: { hote: 127.0.0.1, port: 4280 }
inventaire:
  depots-git:
    racines: ["~"]        # répertoires où chercher des dépôts Git (guillemets : en YAML, ~ seul vaut null)
  arbre:
    depots: []            # dépôts qui portent un arbre HOLARCH (dossier arbre/)
# tarifs:                 # USD par million de tokens, à renseigner depuis la grille officielle du fournisseur
#   claude-opus-5-5: { entree: 0, cache_ecrit: 0, cache_lu: 0, sortie: 0 }
`);
  return true;
}
