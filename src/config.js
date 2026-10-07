// Configuration d'une installation : un fichier YAML dans le répertoire de travail (hors dépôt), fusionné sur des
// défauts. Toute option est une donnée (principe P3) ; rien de personnel n'est codé ici.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { configClaude } from './commun.js';

export const accueil = () => process.env.HOLARCH_HOME || path.join(os.homedir(), '.holarch');

const DEFAUTS = () => ({
  site: 'local',
  // Identifiant de la personne qui utilise ce site (contrat acteurs : jamais un nom ni un courriel).
  humain: 'auteur',
  donnees: accueil(),
  web: { hote: '127.0.0.1', port: 4280 },
  inventaire: {
    'claude-code': { actif: true, home: path.join(os.homedir(), '.claude'), config: configClaude(path.join(os.homedir(), '.claude')) },
    'depots-git': { actif: true, racines: [os.homedir()], profondeur: 3, ignorer: ['node_modules', '.cache', '.npm', '.local'] },
    arbre: { actif: true, depots: [] },
    // API Docker Engine, en lecture : `hote` (unix:///… ou tcp://…) ; sinon DOCKER_HOST, sinon le socket local.
    docker: { actif: true, hote: null },
    // Configuration de Claude Desktop : `config` (chemin) ; sinon l'emplacement du système (macOS, Windows, paquet MSIX
    // compris, et depuis WSL).
    'claude-desktop': { actif: true, config: null },
  },
  import: {
    'claude-code-transcriptions': { actif: true, home: path.join(os.homedir(), '.claude'), calme_minutes: 10 },
    // Journal JSON d'une passerelle agentgateway (site qui fédère des serveurs) : `fichier`, et `nom`, le nom sous
    // lequel les clients la connaissent (leurs appels à ce serveur ne sont alors pas repris des transcriptions).
    agentgateway: { actif: false, fichier: null, nom: 'hub' },
  },
  // Comptes Claude Code lus par le site, quand il y en a plusieurs (un répertoire par compte, `CLAUDE_CONFIG_DIR`) :
  // [{ nom, home, config? }], `nom` étant un identifiant choisi (jamais un courriel), `config` valant par défaut
  // `<home>/.claude.json`. Vide : l'inventaire et l'import ne lisent que leur `home`, sans nom de compte.
  comptes_claude_code: [],
  // Accès distant par projet (`holarch distant`) : `claude`, le binaire (sinon celui du PATH) ; `mode_permissions`, le
  // mode des sessions servies (acceptEdits, auto, default…), celui de Claude Code si vide.
  acces_distant: { claude: null, mode_permissions: null },
  // Contrôles de l'audit (décisions controles-de-regles, veille-securite-versions) : outils (chemin, sinon le PATH puis
  // ~/.local/bin), mémoire des sources réseau, fenêtre du journal tenu, délai avant qu'un commit non poussé soit un
  // écart, taille maximale d'un fichier lu, délais, sources.
  controles: { gitleaks: null, osv_scanner: null, cache_heures: 24, journal_jours: 30, non_pousses_heures: 4, taille_max_mo: 2, delai_osv_s: 300, delai_http_s: 20,
    url_github: 'https://api.github.com', url_node: 'https://nodejs.org/dist/index.json' },
  // Grille de tarifs, relevée sur la page officielle du fournisseur : { source, releve, modeles }, où chaque modèle porte
  // { entree, cache_ecrit, cache_ecrit_1h, cache_lu, sortie } en USD par million de tokens (src/tarifs.js).
  // Vide par défaut : aucun tarif n'est inventé ; sans tarif, le coût reste inconnu et seuls les tokens sont comptés.
  tarifs: { source: null, releve: null, modeles: {} },
});

const fusion = (a, b) => {
  if (Array.isArray(b) || typeof b !== 'object' || b === null) return b === undefined ? a : b;
  const r = { ...a };
  for (const [k, v] of Object.entries(b)) r[k] = k in r ? fusion(r[k], v) : v;
  return r;
};
const developper = (v) => (typeof v === 'string' && v.startsWith('~') ? path.join(os.homedir(), v.slice(1)) : Array.isArray(v) ? v.map(developper) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, developper(x)])) : v);

const lireYaml = (f) => (fs.existsSync(f) ? YAML.parse(fs.readFileSync(f, 'utf8')) || {} : {});

// Plusieurs sites peuvent partager un même répertoire de données (décision sources de l'hôte) : `config.yaml` porte ce
// qui est commun (tarifs…), `config.<site>.yaml` ce qui est propre au site. Le site vient de HOLARCH_SITE, sinon de
// `config.yaml`.
export function chargerConfig(fichier = path.join(accueil(), 'config.yaml'), site = process.env.HOLARCH_SITE) {
  const commune = lireYaml(fichier);
  const nom = site || commune.site || DEFAUTS().site;
  const propre = lireYaml(path.join(path.dirname(fichier), `config.${nom}.yaml`));
  // `accueil` : le répertoire de la configuration lue, que le crochet de git rappelle (HOLARCH_HOME) pour relire la même.
  return developper({ ...fusion(fusion(DEFAUTS(), commune), propre), site: nom, accueil: path.dirname(path.resolve(fichier)) });
}

// Les comptes Claude Code qu'un adaptateur doit lire : ceux de `comptes_claude_code`, sinon son seul `home` (sans nom :
// les identifiants des fiches et les événements restent ceux d'un site à un compte).
export function comptesClaudeCode(config, opts = {}) {
  const liste = (config.comptes_claude_code || []).filter((c) => c && c.home);
  if (!liste.length) return [{ nom: null, home: opts.home, config: opts.config }];
  return liste.map((c) => ({ nom: String(c.nom || path.basename(c.home).replace(/^\.claude-?/, '') || 'defaut'), home: c.home,
    config: c.config || configClaude(c.home) }));
}

// Répertoires de compte Claude Code présents sur le poste (`~/.claude`, `~/.claude-<nom>`, avec des transcriptions) que
// le site ne lit pas : sans eux, l'inventaire et l'import sont incomplets sans le moindre message d'erreur.
export function comptesNonLus(comptes, racine = os.homedir()) {
  const lus = new Set(comptes.filter((c) => c.home).map((c) => { try { return fs.realpathSync(c.home); } catch { return path.resolve(c.home); } }));
  let entrees = []; try { entrees = fs.readdirSync(racine, { withFileTypes: true }); } catch { return []; }
  return entrees.filter((e) => e.isDirectory() && /^\.claude(-[^/]+)?$/.test(e.name) && fs.existsSync(path.join(racine, e.name, 'projects')))
    .map((e) => path.join(racine, e.name)).filter((d) => !lus.has(fs.realpathSync(d)));
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
# controles:              # audit : outils (chemins), mémoire des sources (cache_heures), fenêtre du journal tenu
#   gitleaks: null        # (journal_jours), non_pousses_heures, taille_max_mo, delai_osv_s, delai_http_s, url_github, url_node
# Un autre site qui partage ce répertoire (HOLARCH_SITE=<nom>) lit aussi config.<nom>.yaml, qui l'emporte sur ce fichier.
# tarifs:                 # à relever sur la grille officielle du fournisseur, jamais de mémoire
#   source: https://…     # page relevée
#   releve: AAAA-MM-JJ    # date du relevé
#   modeles:              # USD par million de tokens ; « <modèle>:rapide » pour le mode rapide
#     <modele>: { entree: 0, cache_ecrit: 0, cache_ecrit_1h: 0, cache_lu: 0, sortie: 0 }
`);
  return true;
}
