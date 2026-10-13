// Création de projet (décision creation-de-projet, étape 3, tranche 10) : les étapes de mise en place d'un projet,
// chacune rejouable sans risque. Une étape regarde ce qui est en place et fait ce qui manque, rien d'autre ; un fichier
// présent n'est jamais réécrit, sauf un fichier généré qui porte sa marque (le conteneur). Ce que l'agent ne peut pas faire sort en geste réservé, avec la commande ou le lien
// prêts, et la commande rejouée le reprend. Le reste est fait par ce qui existe déjà : git, gh, l'identité de commit,
// `regles appliquer`, `distant activer`, l'audit.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { git, trouverOutil, porteMarque, ecrireSansLien, lireSansLien } from './commun.js';
import { configAvantProjet, fusionnerConfig } from './regles.js';
import { identiteDeclaree } from './controles.js';
import { poserIdentite } from './identite-git.js';
import { racineArbre } from './inventaire/arbre.js';
import { materialiserProjet } from './materialisation.js';
import { creerDistant } from './distant.js';
import { genererConteneur, maisonDe, NOM_UTILISATEUR, FICHIER as CONTENEUR, MARQUE as MARQUE_CONTENEUR } from './conteneur.js';
import { ETIQUETTE_DEVCONTAINER } from './inventaire/docker.js';
import { projetsDe, localiserProjet } from './projets.js';

const MODELES = fileURLToPath(new URL('../modeles/projet/', import.meta.url));
// Valeurs par défaut, tirées de la mesure des 9 dépôts du poste (décision) ; la clé `creation` du registre de
// configuration les change, portée par le profil, le contexte ou un type (depot-public : public et licence).
const DEFAUTS = { dossier: null, visibilite: 'private', licence: null, journal: null, proprietaire: null, etapes: { github: true, conteneur: true, distant: true } };
const BRANCHE = 'main';
const SCRIPT_CLE = '.devcontainer/deploy-key.sh';

// Un outil en ligne de commande, cherché par `trouverOutil` ; absent, un échec qui le dit.
const outil = (nom, delai) => (args) => { const b = trouverOutil(nom); return b ? spawnSync(b, args, { encoding: 'utf8', timeout: delai }) : { status: 127, stdout: '', stderr: `${nom} introuvable` }; };
const GH = outil('gh', 60e3); const DOCKER = outil('docker', 30e3);
const modele = (f, valeurs = {}) => fs.readFileSync(path.join(MODELES, f), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => valeurs[k] ?? '');
const erreur = (r) => (r.stderr || r.stdout || '').trim().split('\n')[0] || `code ${r.status}`;
const depuisGithub = (url) => String(url || '').match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\/?$/)?.slice(1) || null;
// Type et corps d'une clé publique, sans son commentaire : ce que GitHub garde d'une clé de déploiement.
const corpsCle = (k) => String(k).trim().split(/\s+/).slice(0, 2).join(' ');

// L'utilisateur d'un conteneur construit par le CLI Dev Containers, lu dans son étiquette de métadonnées (rendue par
// `json` dans `docker ps` : le texte d'une liste de configurations, image et features d'abord, `devcontainer.json` en
// dernier). Le dernier `remoteUser` l'emporte, à défaut le dernier `containerUser`, comme le résout le CLI (0.89.0) ;
// undefined si l'étiquette manque ou ne se lit pas, null si elle n'en nomme aucun.
const METADONNEES = 'devcontainer.metadata';
function utilisateurDe(etiquette) {
  let l; try { l = JSON.parse(JSON.parse(etiquette)); } catch { return undefined; }
  if (!Array.isArray(l)) return undefined;
  const dernier = (k) => l.findLast((x) => typeof x?.[k] === 'string')?.[k];
  return dernier('remoteUser') || dernier('containerUser') || null;
}

// L'utilisateur du conteneur lui-même (`.Config.User` de `docker inspect` : celui de son image, à défaut d'un `-u` au
// lancement), root s'il est vide, la part utilisateur d'un `utilisateur:groupe`, comme le résout le CLI (0.89.0) ; null
// si Docker ne le dit pas, ou si ce n'est pas un nom (un uid n'a pas de dossier personnel qui se déduise).
function utilisateurDuConteneur(docker, id) {
  const r = docker(['inspect', '--type', 'container', '--format', '{{json .Config.User}}', id]);
  let u; try { u = r.status === 0 ? JSON.parse(r.stdout) : null; } catch { return null; }
  if (typeof u !== 'string') return null;
  u = u.split(':')[0] || 'root';
  return NOM_UTILISATEUR.test(u) ? u : null;
}

// Les clés de déploiement des conteneurs du projet en marche (`~/.ssh/id_ed25519.pub` de leur utilisateur, que crée
// `deploy-key.sh`) : { conteneurs: [{ id, cle, fichier } ou { id, fichier, erreur }] }, ou { non_verifiee } qui dit
// pourquoi aucune ne se lit (aucun conteneur construit, tous arrêtés, Docker injoignable). Un conteneur se trouve par son
// étiquette de dossier, rattachée au projet comme le fait l'inventaire (`localiserProjet`) ; son utilisateur, par son
// étiquette de métadonnées (un fichier écrit à la main y a mis le sien) ; une étiquette qui n'en nomme aucun laisse celui
// du conteneur (`utilisateurDuConteneur`), que le CLI prend alors ; sans étiquette lisible, le `remoteUser` de la
// configuration, à défaut celui du conteneur. Docker n'est que lu (`ps`, `inspect`, `exec … cat`).
export function clesDesConteneurs(docker, projets, projet, utilisateur) {
  const ps = docker(['ps', '--all', '--filter', `label=${ETIQUETTE_DEVCONTAINER}`, '--format', `{{.ID}}\t{{.State}}\t{{.Label "${ETIQUETTE_DEVCONTAINER}"}}\t{{json (.Label "${METADONNEES}")}}`]);
  if (ps.status !== 0) return { non_verifiee: 'Docker injoignable' };
  const lieu = localiserProjet(projets);
  const siens = (ps.stdout || '').split('\n').map((l) => l.split('\t')).filter(([i, , d]) => i && lieu(d)?.id === projet);
  if (!siens.length) return { non_verifiee: 'aucun conteneur construit' };
  const enMarche = siens.filter(([, etat]) => etat === 'running');
  if (!enMarche.length) return { non_verifiee: 'conteneur arrêté' };
  return { conteneurs: enMarche.map(([id, , , etiquette]) => {
    const lu = utilisateurDe(etiquette);
    const u = lu || (lu === undefined && utilisateur) || utilisateurDuConteneur(docker, id);
    if (!u) return { id, erreur: 'remoteUser inconnu' };
    const fichier = `${maisonDe(u)}/.ssh/id_ed25519.pub`;
    const c = docker(['exec', id, 'cat', fichier]);
    return c.status === 0 ? { id, cle: corpsCle(c.stdout), fichier } : { id, fichier, erreur: erreur(c) };
  }) };
}

function claudeMd({ nom, description, contexte, types, journal }) {
  return `# ${nom}

${description}

Les règles de ce dépôt viennent de l'arbre des règles HOLARCH (profil, contexte \`${contexte}\`${types.length ? `, types ${types.map((t) => `\`${t}\``).join(', ')}` : ''}) ;
\`holarch regles appliquer ${nom}\` les écrit dans \`.claude/rules/holarch/\`. Une règle se change à sa source, jamais dans un
fichier généré.
${journal ? `
- Journal (\`${journal}\`) : \`## AAAA-MM-JJ\` puis \`* **Sujet** : détail\`, le plus récent en premier.
` : ''}`;
}

export function racineIndex({ nom, description, types, journal }) {
  return `---
type: guideline
id: ${nom}
types: [${types.join(', ')}]
${journal ? `config:\n  journal: ${journal}\n` : ''}title: ${nom}
description: ${JSON.stringify(description)}
status: draft
---

# ${nom}

Racine de l'arbre du projet.
`;
}

// Ajoute un projet à la liste `projects` d'un contexte, sans toucher au reste du fichier (commentaires compris).
export function declarer(texte, id, nom) {
  const l = texte.split('\n'); const fin = l.indexOf('---', 1);
  const i = l.findIndex((x, n) => n < fin && /^projects:/.test(x));
  if (i < 0) { l.splice(fin, 0, 'projects:', `  - ${id}   # ${nom}`); return l.join('\n'); }
  const enLigne = l[i].match(/^projects:\s*\[(.*)\]\s*(#.*)?$/);
  if (enLigne) { l[i] = `projects: [${[enLigne[1].trim(), id].filter(Boolean).join(', ')}]${enLigne[2] ? ` ${enLigne[2]}` : ''}`; return l.join('\n'); }
  let j = i + 1; while (j < fin && /^\s+-\s/.test(l[j])) j++;
  l.splice(j, 0, `  - ${id}   # ${nom}`);
  return l.join('\n');
}

/**
 * Crée ou complète un projet : { nom, dossier, projet, contexte, types, etapes } ; chaque étape dit son état parmi
 * faite · deja · a-faire (à blanc) · desactivee · geste (réservé à l'auteur, avec `geste`) · echec · ecarts.
 * `outils` : gh, docker, accès distant et adresse du dépôt distant, remplaçables pour les tests.
 */
export async function creerProjet(socle, { nom, contexte = null, types = [], description = null, aBlanc = false }, {
  gh = GH, docker = DOCKER, distant = null, urlDepot = (proprietaire, n) => `git@github.com:${proprietaire}/${n}.git`, maintenant = new Date(),
} = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(nom || '')) throw new Error(`nom de projet invalide : ${nom ?? '(absent)'} (lettres, chiffres, . _ -)`);
  // L'arbre relu s'il a changé depuis l'inventaire : un geste fait dans le profil (« puis relancer ») vaut tout de suite.
  const noeuds = () => socle.arbreFrais();
  const avant = configAvantProjet(noeuds(), { contexte, types, profil: socle.profil() });
  const cfg = fusionnerConfig(DEFAUTS, avant.config.creation || {});
  const identite = identiteDeclaree(avant.config);
  const dossier = path.join(cfg.dossier ? String(cfg.dossier).replace(/^~(?=$|\/)/, os.homedir()) : os.homedir(), nom);
  description = description || `[À COMPLÉTER : objet du projet ${nom}, en une phrase]`;
  const etapes = []; const noter = (etape, etat, detail, geste = null) => etapes.push({ etape, etat, detail, ...(geste && { geste }) });
  const r = { nom, dossier, projet: null, contexte: avant.contexte.nom, types, a_blanc: aBlanc, etapes };
  const g = (...args) => git(dossier, args);
  const commiter = (message, fichiers) => {
    const c = g('commit', '-q', '-m', message, '--', ...fichiers);
    if (c.status !== 0) throw new Error(`commit refusé : ${erreur(c)}`);
  };

  // Une licence sans modèle arrête tout avant le premier geste : rien n'est créé.
  if (cfg.licence && (!/^[A-Za-z0-9.-]+$/.test(String(cfg.licence)) || !fs.existsSync(path.join(MODELES, 'licences', String(cfg.licence))))) { noter('fichiers', 'echec', `licence sans modèle : ${cfg.licence}`); return r; }

  // 1. Dépôt local et identité de commit, avant tout commit.
  const estGit = fs.existsSync(path.join(dossier, '.git'));
  if (!estGit && fs.existsSync(dossier) && fs.readdirSync(dossier).length) {
    noter('depot', 'echec', `${dossier} existe, n'est pas un dépôt git et n'est pas vide : rien n'est touché`);
    return r;
  }
  if (estGit) noter('depot', 'deja', dossier);
  else if (aBlanc) noter('depot', 'a-faire', `${dossier}, branche ${BRANCHE}`);
  else {
    fs.mkdirSync(dossier, { recursive: true });
    const i = g('init', '-q', '-b', BRANCHE); if (i.status !== 0) { noter('depot', 'echec', erreur(i)); return r; }
    noter('depot', 'faite', `${dossier}, branche ${BRANCHE}`);
  }
  if (!identite) noter('identite', 'geste', 'aucune identité de commit déclarée pour ce contexte', { quoi: 'déclarer `identite: {nom, email}` dans le profil ou le contexte, puis relancer' });
  else if (!estGit && aBlanc) noter('identite', 'a-faire', 'identité du contexte en réglage local');
  else {
    const e = poserIdentite(dossier, identite, { ecrire: !aBlanc }).etat;
    if (e === 'ignore') noter('identite', 'geste', 'un réglage local posé à la main diffère de l’identité déclarée', { quoi: 'le retirer', commande: `git -C ${dossier} config --local --unset user.name && git -C ${dossier} config --local --unset user.email` });
    else noter('identite', e === 'inchange' ? 'deja' : aBlanc ? 'a-faire' : 'faite', 'identité du contexte en réglage local');
  }

  // 2. Fichiers de base ; un fichier présent n'est jamais réécrit.
  const typee = types.length > 0;
  const arbreExistant = racineArbre(dossier);
  const fichiers = [
    ['README.md', () => `# ${nom}\n\n${description}\n`],
    ['.gitignore', () => modele('gitignore')],
    ['CLAUDE.md', () => claudeMd({ nom, description, contexte: avant.contexte.nom, types, journal: cfg.journal })],
    ...(cfg.licence ? [['LICENSE', () => modele(`licences/${cfg.licence}`, { annee: maintenant.getFullYear(), titulaire: identite?.nom ?? '[À COMPLÉTER : titulaire du droit d’auteur]' })]] : []),
    // L'arbre et son journal ne s'écrivent que pour un projet qui n'a pas encore d'arbre : un arbre existant tient le sien.
    ...(typee && !arbreExistant ? [['arbre/index.md', () => racineIndex({ nom, description, types, journal: cfg.journal })],
      ...(cfg.journal ? [[cfg.journal, () => `# Journal de l'arbre\n\n## ${maintenant.toISOString().slice(0, 10)}\n\n* **Création** : projet créé par \`holarch projet creer\`.\n`]] : [])] : []),
  ];
  const manquants = fichiers.filter(([f]) => !fs.existsSync(path.join(dossier, f)));
  // Un fichier présent mais jamais commité (commit refusé à un passage précédent) n'est pas réécrit : il est commité.
  const commite = (f) => g('cat-file', '-e', `HEAD:${f}`).status === 0;
  const aCommiter = fichiers.filter(([f]) => !fs.existsSync(path.join(dossier, f)) || (fs.existsSync(path.join(dossier, '.git')) && !commite(f)));
  if (typee && arbreExistant) {
    const declares = [].concat(noeuds().find((n) => n.location === arbreExistant.fichier)?.attributes?.types || []);
    const absents = types.filter((t) => !declares.includes(t));
    if (absents.length) noter('types', 'geste', `la racine de l'arbre existe (${path.relative(dossier, arbreExistant.fichier)}) sans déclarer ${absents.join(', ')}`, { quoi: `ajouter ${absents.join(', ')} à sa liste \`types\`, puis relancer` });
  }
  if (!aCommiter.length) noter('fichiers', 'deja', fichiers.map(([f]) => f).join(', '));
  else if (aBlanc) noter('fichiers', 'a-faire', aCommiter.map(([f]) => f).join(', '));
  else {
    const premier = g('rev-parse', '--verify', '-q', 'HEAD').status !== 0;
    try {
      for (const [f, contenu, mode] of manquants) ecrireSansLien(dossier, f, contenu(), mode);
      const a = g('add', '--', ...aCommiter.map(([f]) => f)); if (a.status !== 0) throw new Error(erreur(a));
      commiter(premier ? 'Créer le projet' : 'Compléter les fichiers de base du projet', aCommiter.map(([f]) => f));
      noter('fichiers', 'faite', aCommiter.map(([f]) => f).join(', '));
    } catch (e) { noter('fichiers', 'echec', e.message); return r; }
  }

  // 3. Déclaration dans le contexte. Le projet entre au catalogue par l'inventaire (son identifiant vient de son dépôt).
  const projetIci = () => socle.fiches({ kind: 'project' }).find((p) => p.location === dossier) || null;
  // À blanc, rien ne s'écrit, pas même le catalogue : un projet que l'inventaire n'a pas encore vu s'arrête là.
  if (aBlanc && !projetIci()) { for (const e of ['declaration', 'regles', 'conteneur', 'github', 'cle', 'distant', 'audit']) noter(e, 'a-faire', estGit ? 'après l’inventaire' : 'après la création du dépôt'); return r; }
  if (!projetIci()) { await socle.inventaire(); socle.indexer(); }
  const projet = projetIci();
  if (!projet) { noter('declaration', 'echec', `${dossier} n'entre pas au catalogue : hors des racines de l'inventaire (inventaire.depots-git.racines) ou sans commit`); return r; }
  r.projet = projet.id;
  const fichierContexte = avant.contexte.fichier;
  const texte = fs.readFileSync(fichierContexte, 'utf8');
  if (texte.includes(projet.id)) noter('declaration', 'deja', `contexte ${avant.contexte.nom}`);
  else if (aBlanc) noter('declaration', 'a-faire', `contexte ${avant.contexte.nom}, commit dans le profil`);
  else {
    const profil = path.dirname(fichierContexte); const relatif = path.basename(fichierContexte);
    if ((git(profil, ['status', '--porcelain', '--', relatif]).stdout || '').trim()) { noter('declaration', 'echec', `${fichierContexte} a des modifications en cours : rien n'est touché`); return r; }
    // Le contexte s'écrit, et se remet en l'état, dans le dépôt du profil sans suivre de lien symbolique.
    const dansProfil = path.relative(socle.profil(), fichierContexte);
    try {
      ecrireSansLien(socle.profil(), dansProfil, declarer(texte, projet.id, nom));
      const c = git(profil, ['commit', '-q', '-m', `Déclarer le projet ${nom}`, '--', relatif]);
      if (c.status !== 0) { ecrireSansLien(socle.profil(), dansProfil, texte); throw new Error(`commit dans le profil refusé : ${erreur(c)}`); }
    } catch (e) { noter('declaration', 'echec', e.message); return r; }
    noter('declaration', 'faite', `contexte ${avant.contexte.nom}, commit dans le profil`);
    await socle.inventaire(); socle.indexer();
  }

  // 4. Règles, crochet et identité du projet déclaré (`regles appliquer`), puis commit des fichiers générés. L'arbre écrit
  // plus haut (racine et ses types) entre au catalogue d'abord, sans quoi les règles du type manqueraient.
  if (!aBlanc && await socle.arbreAJour()) socle.indexer();
  const re = socle.regles({ projet: projet.id });
  if (!re.declare) noter('regles', aBlanc ? 'a-faire' : 'echec', aBlanc ? 'après la déclaration' : 'projet toujours non déclaré après l’inventaire');
  // Règles illisibles : rien ne s'écrit (materialisation) ; l'étape le dit et la suite attend un rejeu.
  else if (re.illisibles.length) { noter('regles', 'echec', `règles illisibles, rien n'est écrit : ${re.illisibles.join(' ; ')}`); return r; }
  else {
    const m = materialiserProjet(re, dossier, { accueil: socle.config.accueil, ecrire: !aBlanc });
    // Un lien symbolique sur le chemin des règles : rien n'est écrit à travers, l'étape le dit et la suite attend un rejeu.
    if (m.fichiers.erreur) { noter('regles', 'echec', m.fichiers.erreur); return r; }
    const changes = m.fichiers.crees.length + m.fichiers.modifies.length + m.fichiers.retires.length;
    const detail = `${m.fichiers.crees.length} créé(s), ${m.fichiers.modifies.length} modifié(s), ${m.fichiers.retires.length} retiré(s) ; crochet ${m.crochet.etat}`;
    if (m.crochet.etat === 'erreur' || (m.crochet.etat === 'ignore' && m.crochet.demande)) noter('crochet', 'geste', `crochet de git non posé (${m.crochet.fichier}${m.crochet.raison ? ` : ${m.crochet.raison}` : ''})`, { quoi: 'retirer ou fusionner le crochet pre-commit existant, puis relancer' });
    // Des règles écrites mais pas commitées (commit refusé à un passage précédent) restent à commiter.
    const dossierRegles = path.join('.claude', 'rules', 'holarch');
    const enAttente = (g('status', '--porcelain', '--', dossierRegles).stdout || '').trim() !== '';
    if (!changes && !enAttente && ['inchange', 'absent'].includes(m.crochet.etat)) noter('regles', 'deja', detail);
    else if (aBlanc) noter('regles', 'a-faire', detail);
    else {
      g('add', '-A', '--', dossierRegles);
      if (g('diff', '--cached', '--quiet', '--', dossierRegles).status !== 0) {
        try { commiter('Appliquer les règles HOLARCH', [dossierRegles]); } catch (e) { noter('regles', 'echec', e.message); return r; }
      }
      noter('regles', 'faite', detail);
    }
  }

  // 5. Conteneur (décision environnement-d-execution) : `.devcontainer/devcontainer.json` généré depuis la clé `conteneur`
  // de la configuration effective, marqué, réécrit quand il en diffère ; un fichier écrit à la main n'est jamais touché
  // (geste : le migrer). Le script de la clé de déploiement, recopié du modèle, quand la commande générée l'appelle et
  // qu'il manque.
  const gen = re.declare ? genererConteneur({ nom, config: re.config }) : null;
  if (!cfg.etapes.conteneur) noter('conteneur', 'desactivee', 'creation.etapes.conteneur');
  else if (!re.declare) noter('conteneur', aBlanc ? 'a-faire' : 'echec', aBlanc ? 'après la déclaration' : 'projet non déclaré : sa configuration est incomplète');
  else if (gen.erreur) noter('conteneur', 'echec', gen.erreur);
  else {
    // Le conteneur écrit le dépôt : un fichier lu ici (ou un dossier de son chemin) qui est un lien symbolique n'est pas
    // suivi (`lireSansLien`), l'étape échoue et le dit.
    const lire = (f) => lireSansLien(dossier, f);
    try {
      const present = lire(CONTENEUR);
      if (present !== null && !porteMarque(present, MARQUE_CONTENEUR)) {
        noter('conteneur', 'geste', `${CONTENEUR} écrit à la main : rien n’est touché`, { quoi: 'reporter ce qui lui est propre dans la clé conteneur de la racine de l’arbre du projet, retirer le fichier, puis relancer', commande: `git -C ${dossier} rm -q ${CONTENEUR}` });
      } else {
        const voulus = [[CONTENEUR, gen.texte], ...(JSON.stringify(gen.conteneur).includes(SCRIPT_CLE) && lire(SCRIPT_CLE) === null ? [[SCRIPT_CLE, modele('deploy-key.sh'), 0o755]] : [])];
        const aEcrire = voulus.filter(([f, t]) => lire(f) !== t);
        // Écrits à un passage précédent dont le commit a été refusé : à commiter. Le script, absent de HEAD (le `git add`
        // a pu passer : indexé, pas seulement non suivi).
        const statut = (f) => (g('status', '--porcelain', '--', f).stdout || '').trim();
        const enAttente = [...(statut(CONTENEUR) ? [CONTENEUR] : []), ...(lire(SCRIPT_CLE) !== null && !commite(SCRIPT_CLE) ? [SCRIPT_CLE] : [])];
        const aCommiter = [...new Set([...aEcrire.map(([f]) => f), ...enAttente])];
        if (!aCommiter.length) noter('conteneur', 'deja', CONTENEUR);
        else if (aBlanc) noter('conteneur', 'a-faire', aCommiter.join(', '));
        else {
          for (const [f, t, mode] of aEcrire) ecrireSansLien(dossier, f, t, mode);
          const a = g('add', '--', ...aCommiter); if (a.status !== 0) throw new Error(erreur(a));
          // Une modification jamais commitée, remplacée par le texte déjà commité : rien à commiter.
          const changes = aCommiter.filter(statut);
          if (changes.length) commiter(present === null ? 'Générer la configuration du conteneur' : 'Régénérer la configuration du conteneur', changes);
          noter('conteneur', 'faite', aCommiter.join(', '));
        }
      }
    } catch (e) { noter('conteneur', 'echec', e.message); }
  }

  // 6. Dépôt GitHub, remote `origin` en SSH, premier envoi de la branche.
  let distantGithub = depuisGithub(g('remote', 'get-url', 'origin').stdout?.trim());
  const amont = () => g('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}').status === 0;
  const envoyer = () => { const p = g('push', '-q', '-u', 'origin', BRANCHE); if (p.status !== 0) throw new Error(`envoi refusé : ${erreur(p)}`); };
  if (!cfg.etapes.github) noter('github', 'desactivee', 'creation.etapes.github');
  else if (g('remote', 'get-url', 'origin').status === 0) {
    if (amont()) noter('github', 'deja', g('remote', 'get-url', 'origin').stdout.trim());
    else if (aBlanc) noter('github', 'a-faire', `premier envoi de ${BRANCHE}`);
    else { try { envoyer(); noter('github', 'faite', `premier envoi de ${BRANCHE}`); } catch (e) { noter('github', 'echec', e.message); } }
  } else if (gh(['auth', 'status']).status !== 0) {
    noter('github', 'geste', '`gh` absent ou non connecté', { quoi: 'connecter gh, puis relancer', commande: 'gh auth login' });
  } else {
    const proprietaire = cfg.proprietaire || gh(['api', 'user', '--jq', '.login']).stdout?.trim();
    const visibilite = cfg.visibilite === 'public' ? 'public' : 'private';
    if (!proprietaire) noter('github', 'echec', 'compte GitHub introuvable (creation.proprietaire pour le préciser)');
    else if (aBlanc) { distantGithub = [proprietaire, nom]; noter('github', 'a-faire', `${proprietaire}/${nom} (${visibilite}), premier envoi de ${BRANCHE}`); }
    else {
      try {
        if (gh(['repo', 'view', `${proprietaire}/${nom}`]).status !== 0) {
          const c = gh(['repo', 'create', `${proprietaire}/${nom}`, `--${visibilite}`, '--description', description]);
          if (c.status !== 0) throw new Error(`gh repo create : ${erreur(c)}`);
        }
        const a = g('remote', 'add', 'origin', urlDepot(proprietaire, nom)); if (a.status !== 0) throw new Error(erreur(a));
        distantGithub = [proprietaire, nom];
        envoyer();
        noter('github', 'faite', `${proprietaire}/${nom} (${visibilite}), ${BRANCHE} envoyée`);
      } catch (e) { noter('github', 'echec', e.message); }
    }
  }

  // 7. Clé de déploiement du conteneur : créée dans le conteneur, enregistrée par l'auteur (geste réservé). Celles des
  // conteneurs du projet en marche se comparent aux clés du dépôt : une seule enregistrée suffit ; aucun conteneur en
  // marche ou Docker injoignable, une clé du dépôt suffit, dite non vérifiée (défaut du 2026-10-10 : le volume ssh du
  // socle était vide, l'étape le disait déjà là). Clés du dépôt non lues, rien ne se compte : comme à l'étape github, gh
  // absent ou non connecté est un geste, une autre erreur de gh un échec qui la dit.
  if (!cfg.etapes.conteneur) noter('cle', 'desactivee', 'creation.etapes.conteneur');
  else if (!distantGithub && g('remote', 'get-url', 'origin').status === 0) noter('cle', 'desactivee', 'remote origin hors de GitHub : la clé se gère chez son hébergeur');
  else if (!distantGithub) noter('cle', aBlanc ? 'a-faire' : 'geste', 'sans dépôt GitHub, pas de clé de déploiement', aBlanc ? null : { quoi: 'créer le dépôt GitHub (étape github), puis relancer' });
  else {
    const [o, n] = distantGithub;
    const k = gh(['api', '--paginate', `repos/${o}/${n}/keys`, '--jq', '.[].key']);
    const geste = { quoi: 'ouvrir le dossier dans son conteneur (la clé s’y crée), puis enregistrer la clé affichée, écriture permise', commande: SCRIPT_CLE, lien: `https://github.com/${o}/${n}/settings/keys/new` };
    if (k.status !== 0 && gh(['auth', 'status']).status !== 0) noter('cle', 'geste', `clés de ${o}/${n} non lues : \`gh\` absent ou non connecté`, { quoi: 'connecter gh, puis relancer', commande: 'gh auth login' });
    else if (k.status !== 0) noter('cle', 'echec', `clés de ${o}/${n} non lues : gh api : ${erreur(k)}`);
    else {
      const cles = k.stdout.split('\n').filter((x) => x.trim()).map(corpsCle);
      const lues = clesDesConteneurs(docker, projetsDe(socle.fiches({ kind: 'project' })), projet.id, gen?.conteneur?.remoteUser);
      const enregistre = lues.conteneurs?.find((c) => c.cle && cles.includes(c.cle));
      const dire = (c) => (c.cle ? `${c.id}, clé non enregistrée` : `${c.id}, pas de clé lisible (${c.fichier ? `${c.fichier} : ` : ''}${c.erreur})`);
      if (enregistre) noter('cle', 'deja', `la clé du conteneur ${enregistre.id} est enregistrée sur ${o}/${n}`);
      else if (lues.conteneurs) noter('cle', 'geste', `aucun conteneur du projet en marche n’a sa clé enregistrée sur ${o}/${n} : ${lues.conteneurs.map(dire).join(' ; ')}${cles.length ? ` ; le dépôt porte ${cles.length} autre(s) clé(s) : à retirer si périmée(s)` : ''}`, geste);
      else if (cles.length) noter('cle', 'deja', `${cles.length} clé(s) sur ${o}/${n} ; celle du conteneur non vérifiée (${lues.non_verifiee})`);
      else noter('cle', 'geste', `aucune clé de déploiement sur ${o}/${n}`, geste);
    }
  }

  // 8. Accès distant par projet.
  if (!cfg.etapes.distant) noter('distant', 'desactivee', 'creation.etapes.distant');
  else {
    try {
      const d = distant || creerDistant(socle.config);
      if (d.liste().some((x) => x.projet === projet.id || x.chemin === dossier)) noter('distant', 'deja', 'service actif');
      else if (aBlanc) noter('distant', 'a-faire', 'service Remote Control du projet');
      else { const a = d.activer(projet.id); noter('distant', 'faite', `service ${a.unite}`); }
    } catch (e) { noter('distant', 'echec', e.message); }
  }

  // 9. Audit du projet : aucun écart attendu hors gestes réservés.
  if (aBlanc) noter('audit', 'a-faire', 'audit du projet');
  else {
    const a = socle.audit({ projet: projet.id, journaliser: true });
    const ecarts = a.cibles.find((c) => c.projet === projet.id)?.ecarts || [];
    noter('audit', ecarts.length ? 'ecarts' : 'faite', ecarts.length ? ecarts.map((e) => `${e.controle} : ${e.message}`).join(' ; ') : 'aucun écart');
  }
  return r;
}
