// Conteneur généré (décision environnement-d-execution, livraison C) : le `devcontainer.json` d'un projet, tiré de la clé
// `conteneur` de sa configuration effective. Les couches (profil, contexte, types, racine du projet) apportent
// `conteneur.devcontainer`, clés du format telles quelles (P2), fusionnées comme les autres réglages ; le socle pose
// ensuite les siennes, qu'aucune couche ne remplace : le nom, la connexion Claude (`connexion_claude`), les
// transcriptions du projet et les règles du compte en lecture, le volume ssh, les variables de Claude Code, la clé d'API
// vidée et la reprise de propriété des volumes. Une couche qui en pose une ne se génère pas, et c'est dit. Lecture pure :
// `holarch projet creer` écrit le texte, l'audit le compare au fichier.
import { dossierClaude } from './projets.js';

export const FICHIER = '.devcontainer/devcontainer.json';
export const MARQUE = '// Généré par HOLARCH (holarch projet creer) : ne pas modifier ici, changer la clé conteneur de l’arbre.';
// `requis` et `optionnel` comme les lit le CLI Dev Containers (`hostRequirements.gpu` : true ou "optional").
const GPU = new Map([['non', null], ['optionnel', 'optional'], ['requis', true]]);
const CONNEXIONS = ['volume', 'hote'];
// Les clés que pose le socle, dans l'ordre du fichier, après celles des couches.
const SOCLE = ['initializeCommand', 'mounts', 'containerEnv', 'remoteEnv', 'onCreateCommand'];

const objet = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
// La cible d'un montage, chaîne (`target=`, `dst=`, `destination=`) ou objet.
const cible = (m) => (objet(m) ? m.target : String(m).match(/(?:^|,)\s*(?:target|dst|destination)=([^,]+)/)?.[1]?.trim());

// Commentaires fixes sur les parts du socle, au-dessus de leur clé.
const COMMENTAIRES = {
  volume: {
    initializeCommand: 'Socle : les dossiers de l’hôte montés ci-dessous, créés s’ils manquent.',
    mounts: 'Socle : Claude Code dans un volume propre au conteneur, jamais le ~/.claude de l’hôte (identifiants de tous les projets, crochets que l’hôte exécute) ; la connexion s’y fait une fois. De l’hôte, seulement : les transcriptions et la mémoire de ce projet (HOLARCH les lit), et les règles du compte en lecture. La clé de déploiement dans un volume propre au projet.',
  },
  hote: {
    mounts: 'Socle : le ~/.claude de l’hôte (connexion_claude: hote), une dérogation : le contrôle montage-sensible le dit tant qu’une exception du profil ne le lève pas. La clé de déploiement dans un volume propre au projet.',
  },
  containerEnv: 'Socle : toute session, ouverte dans un sous-dossier ou un worktree comprise, range ses transcriptions dans le dossier de ce projet (CLAUDE_CODE_PROJECT_DIR_NAME, Claude Code 2.1.234 et suivants, avec CLAUDE_CONFIG_DIR).',
  remoteEnv: 'Socle : la connexion Claude du conteneur sert, jamais une clé d’API reçue de l’hôte.',
  onCreateCommand: 'Socle : un volume neuf appartient à root ; il est rendu à l’utilisateur avant que l’éditeur se connecte et y écrive (onCreateCommand passe avant updateContentCommand et postCreateCommand).',
};

// Un commentaire en lignes de 120 caractères au plus, à l'indentation donnée.
function commenter(texte, retrait = '') {
  const lignes = []; let l = '';
  for (const mot of texte.split(' ')) {
    if (l && `${retrait}// ${l} ${mot}`.length > 120) { lignes.push(l); l = mot; } else l = l ? `${l} ${mot}` : mot;
  }
  return [...lignes, l].map((x) => `${retrait}// ${x}`);
}

/**
 * Le `devcontainer.json` d'un projet : { texte, conteneur } ou { erreur }. `nom` : le nom du dossier du projet (volumes
 * et dossier de transcriptions en dérivent) ; `config` : sa configuration effective. `remoteUser` est attendu dans
 * `conteneur.devcontainer` (le profil le pose avec l'image de base) : les montages et la reprise de propriété visent son
 * dossier personnel.
 */
export function genererConteneur({ nom, config = {} }) {
  const c = config?.conteneur ?? {};
  if (!objet(c)) return { erreur: 'conteneur : un objet attendu' };
  const d = c.devcontainer ?? {};
  if (!objet(d)) return { erreur: 'conteneur.devcontainer : un objet attendu' };
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nom || '')) return { erreur: `nom de projet qui ne nomme pas un volume : ${nom}` };
  const gpu = c.gpu ?? 'non';
  if (!GPU.has(gpu)) return { erreur: `conteneur.gpu inconnu : ${gpu} (non, optionnel, requis)` };
  const connexion = c.connexion_claude ?? 'volume';
  if (!CONNEXIONS.includes(connexion)) return { erreur: `conteneur.connexion_claude inconnu : ${connexion} (${CONNEXIONS.join(', ')})` };
  const u = d.remoteUser;
  if (typeof u !== 'string' || !/^[a-z_][a-z0-9_-]*$/.test(u)) return { erreur: `conteneur.devcontainer.remoteUser ${u === undefined ? 'absent' : `invalide : ${u}`} : le profil le pose avec l’image de base` };
  for (const k of ['containerEnv', 'remoteEnv', 'onCreateCommand']) {
    if (d[k] !== undefined && !objet(d[k])) return { erreur: `conteneur.devcontainer.${k} : un objet attendu${k === 'onCreateCommand' ? ' (commandes nommées : le socle y pose la sienne)' : ''}` };
  }
  if (d.mounts !== undefined && !Array.isArray(d.mounts)) return { erreur: 'conteneur.devcontainer.mounts : une liste attendue' };

  const maison = u === 'root' ? '/root' : `/home/${u}`;
  const volume = nom.toLowerCase(); const dossier = dossierClaude(`/workspaces/${nom}`);
  const montages = connexion === 'volume'
    ? [`source=${volume}-claude,target=${maison}/.claude,type=volume`,
      `source=\${localEnv:HOME}/.claude/projects/${dossier},target=${maison}/.claude/projects/${dossier},type=bind`,
      `source=\${localEnv:HOME}/.claude/rules,target=${maison}/.claude/rules,type=bind,readonly`]
    : [`source=\${localEnv:HOME}/.claude,target=${maison}/.claude,type=bind`];
  montages.push(`source=${volume}-ssh,target=${maison}/.ssh,type=volume`);
  const proprietaire = u === 'root' ? [] : connexion === 'volume' ? [`${maison}/.claude`, `${maison}/.claude/projects`, `${maison}/.ssh`] : [`${maison}/.ssh`];
  const socle = {
    name: nom,
    ...(connexion === 'volume' && { initializeCommand: `mkdir -p \${localEnv:HOME}/.claude/projects/${dossier} \${localEnv:HOME}/.claude/rules` }),
    mounts: montages,
    containerEnv: { CLAUDE_CONFIG_DIR: `${maison}/.claude`, CLAUDE_CODE_PROJECT_DIR_NAME: dossier },
    remoteEnv: { ANTHROPIC_API_KEY: '' },
    ...(proprietaire.length && { onCreateCommand: { holarch: `sudo chown ${u}:${u} ${proprietaire.join(' ')}` } }),
  };

  // Ce que pose le socle, aucune couche ne le remplace : une couche qui le pose ne se génère pas.
  const poses = [...['name', 'initializeCommand'].filter((k) => d[k] !== undefined),
    ...['containerEnv', 'remoteEnv', 'onCreateCommand'].flatMap((k) => Object.keys(socle[k] || {}).filter((x) => Object.hasOwn(d[k] || {}, x)).map((x) => `${k}.${x}`)),
    ...(d.mounts || []).map(cible).filter((t) => socle.mounts.some((m) => cible(m) === t)).map((t) => `mounts (cible ${t})`)];
  if (poses.length) return { erreur: `posé par le socle, qu’aucune couche ne remplace : ${poses.join(', ')}` };

  const propres = Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'name' && !SOCLE.includes(k)));
  if (GPU.get(gpu) !== null) propres.hostRequirements = { ...(objet(propres.hostRequirements) ? propres.hostRequirements : {}), gpu: GPU.get(gpu) };
  const conteneur = { name: socle.name, ...propres };
  for (const k of SOCLE) {
    const v = Array.isArray(socle[k]) ? [...(d[k] || []), ...socle[k]] : objet(socle[k]) ? { ...d[k], ...socle[k] } : socle[k];
    if (v !== undefined) conteneur[k] = v;
  }

  const commentaires = { ...COMMENTAIRES, ...COMMENTAIRES[connexion] };
  const corps = JSON.stringify(conteneur, null, 2).split('\n')
    .flatMap((l) => { const k = l.match(/^ {2}"(\w+)":/)?.[1]; return k && SOCLE.includes(k) && typeof commentaires[k] === 'string' ? [...commenter(commentaires[k], '  '), l] : [l]; });
  const entete = [MARQUE, ...commenter(`Source : la clé conteneur de la configuration effective du projet (profil, contexte, types, racine de son arbre), où se disent les raisons de ses réglages ; \`holarch projet creer ${nom}\` réécrit ce fichier.`)];
  return { texte: `${[...entete, ...corps].join('\n')}\n`, conteneur };
}
