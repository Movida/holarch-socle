// Accès distant par projet (étape 3, tranche 1) : un serveur Remote Control de Claude Code par projet, activé à la
// demande. Le runtime fait le travail (`claude remote-control`) ; HOLARCH écrit, démarre et retire un service systemd
// utilisateur par projet, et déclare le dossier de confiance pour Claude Code (sans terminal, un serveur lancé dans un
// dossier non déclaré attendrait une confirmation que personne ne peut donner).
// Un service porte la MARQUE : un service que HOLARCH n'a pas écrit n'est jamais modifié ni retiré.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Catalogue } from './stockage/catalogue.js';
import { projetsDe, localiserProjet, resoudreProjet } from './projets.js';
import { shell, systemd, fichierMarque, lireJson, ecrireJson, trouverOutil, configClaude } from './commun.js';
import { accueil as accueilParDefaut } from './config.js';
import { binaireService } from './service.js';

const MARQUE = '# Écrit par HOLARCH (holarch distant)';
const PREFIXE = 'holarch-distant-';

export const nomDe = (chemin) => path.basename(chemin).replace(/[^A-Za-z0-9_.-]+/g, '-');

// Le PATH d'un service : les dossiers des binaires qu'il lance, puis ceux du poste (~/.local/bin compris), comme dans un
// terminal ; un service au PATH réduit ne voit pas les mêmes outils.
export const pathService = (...bins) => [...new Set([...bins.map((b) => path.dirname(b)), path.join(os.homedir(), '.local', 'bin'), '/usr/local/bin', '/usr/bin', '/bin'])].join(':');

/**
 * Services utilisateur marqués : écrire, démarrer, retirer une unité systemd ; une unité qui ne porte pas la MARQUE n'est
 * jamais modifiée ni retirée. Partagé par l'accès distant et l'interface.
 */
function services({ unites, systemctl }) {
  const geree = (f) => fichierMarque(f, MARQUE);
  const lancer = (args) => { const r = systemctl(args); if (r.status !== 0) throw new Error(`systemctl --user ${args.join(' ')} : ${(r.stderr || '').trim() || `code ${r.status}`}`); return r; };
  return {
    unites, geree, lancer,
    actif: (f) => fs.existsSync(f) && systemctl(['is-active', path.basename(f)]).stdout?.trim() === 'active',
    // Écrit l'unité et la démarre ; une unité déjà active dont le texte change est redémarrée.
    poser(f, texte) {
      if (fs.existsSync(f) && !geree(f)) throw new Error(`${f} existe et n'a pas été écrit par HOLARCH : rien n'est modifié`);
      const avant = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
      fs.mkdirSync(unites, { recursive: true }); fs.writeFileSync(f, texte);
      lancer(['daemon-reload']); lancer(['enable', '--now', path.basename(f)]);
      if (avant != null && avant !== texte) lancer(['restart', path.basename(f)]);
    },
    // Écrit une unité sans la démarrer (le service d'un minuteur), même garde que `poser` ; vrai si le texte a changé.
    ecrire(f, texte) {
      if (fs.existsSync(f) && !geree(f)) throw new Error(`${f} existe et n'a pas été écrit par HOLARCH : rien n'est modifié`);
      if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === texte) return false;
      fs.mkdirSync(unites, { recursive: true }); fs.writeFileSync(f, texte); return true;
    },
    retirer(f, absente) {
      if (!fs.existsSync(f)) throw new Error(absente);
      if (!geree(f)) throw new Error(`${f} n'a pas été écrit par HOLARCH : rien n'est retiré`);
      lancer(['disable', '--now', path.basename(f)]); fs.rmSync(f); lancer(['daemon-reload']);
    },
  };
}
const UNITES = path.join(os.homedir(), '.config', 'systemd', 'user');
const SYSTEMCTL = (args) => spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' });

// Au démarrage, le serveur reprend la dernière session du dossier (`--continue`, si elle date de moins de quatre heures
// environ) ; sinon il en crée une. Sans cette reprise, chaque redémarrage laissait une session vide dans l'application.
export function uniteDe({ nom, chemin, claude, mode }) {
  const options = ['--name', nom, '--remote-control-session-name-prefix', nom, ...(mode ? ['--permission-mode', mode] : [])].map(shell).join(' ');
  const script = `${shell(claude)} remote-control --continue ${options} || exec ${shell(claude)} remote-control ${options}`;
  return `${MARQUE} : accès distant au projet ${nom}. Retiré par \`holarch distant desactiver ${nom}\`.
[Unit]
Description=Claude Code Remote Control : ${nom}
After=network-online.target

[Service]
WorkingDirectory=${chemin}
Environment=${systemd(`PATH=${pathService(claude, process.execPath)}`)}
ExecStart=/bin/sh -c ${systemd(script)}
Restart=on-failure
RestartSec=30
StandardOutput=null

[Install]
WantedBy=default.target
`;
}

// Déclare un dossier de confiance dans la configuration de Claude Code (`projects.<chemin>.hasTrustDialogAccepted`),
// sans toucher au reste ; écriture atomique.
export function declarerConfiance(fichier, chemin) {
  const c = lireJson(fichier, {}, { strict: true });
  const p = ((c.projects ||= {})[chemin] ||= {});
  if (p.hasTrustDialogAccepted === true) return false;
  p.hasTrustDialogAccepted = true;
  ecrireJson(fichier, c);
  return true;
}

// Reprise après une veille du poste : le serveur Remote Control reste en vie mais n'est plus joignable, et aucune règle
// `Restart=` n'y peut rien (rien ne s'arrête) ; WSL ne voit pas la veille de Windows. Un minuteur passe chaque minute :
// un écart de plus de SEUIL_REVEIL depuis son passage précédent dit que le poste a dormi, et les accès distants actifs
// sont redémarrés. Posé avec le premier accès distant, retiré avec le dernier. Nom hors PREFIXE : ce n'est pas un projet.
const UNITE_REVEIL = 'holarch-reveil';
const SEUIL_REVEIL = 5 * 60e3;
export function uniteReveil({ node = process.execPath, holarch, accueil }) {
  return `${MARQUE} : reprise des accès distants après une veille, lancée par ${UNITE_REVEIL}.timer. Retirée avec le dernier accès distant.
[Unit]
Description=HOLARCH : reprise des accès distants après une veille

[Service]
Type=oneshot
Environment=${systemd(`HOLARCH_HOME=${accueil}`)}
Environment=${systemd(`PATH=${pathService(node)}`)}
ExecStart=${systemd(node)} --no-warnings ${systemd(holarch)} distant reveil
`;
}
const MINUTEUR_REVEIL = `${MARQUE} : reprise des accès distants, chaque minute. Retiré avec le dernier accès distant.
[Unit]
Description=HOLARCH : reprise des accès distants après une veille

[Timer]
OnCalendar=minutely

[Install]
WantedBy=timers.target
`;

export function creerDistant(config, {
  unites = UNITES, systemctl = SYSTEMCTL,
  claude = config.acces_distant?.claude || null,
  projets = projetsDe(new Catalogue(config.donnees, config.site).lire({ site: config.site })),
  accueil = config.accueil || accueilParDefaut(), holarch = binaireService(accueil), node = process.execPath, maintenant = Date.now,
} = {}) {
  const sv = services({ unites, systemctl });
  const fichierUnite = (nom) => path.join(unites, `${PREFIXE}${nom}.service`);
  const reveil = { service: path.join(unites, `${UNITE_REVEIL}.service`), minuteur: path.join(unites, `${UNITE_REVEIL}.timer`), passage: path.join(accueil, 'distant-reveil') };
  const poserReveil = () => {
    for (const x of [reveil.service, reveil.minuteur]) if (fs.existsSync(x) && !sv.geree(x)) return;
    if (sv.ecrire(reveil.service, uniteReveil({ node, holarch, accueil }))) sv.lancer(['daemon-reload']);
    sv.poser(reveil.minuteur, MINUTEUR_REVEIL);
  };
  const retirerReveil = () => {
    if (fs.existsSync(reveil.minuteur) && sv.geree(reveil.minuteur)) sv.retirer(reveil.minuteur);
    if (fs.existsSync(reveil.service) && sv.geree(reveil.service)) { fs.rmSync(reveil.service); sv.lancer(['daemon-reload']); }
  };

  // Un projet du catalogue, désigné par son identifiant, son nom ou un chemin (module projets, comme partout ailleurs).
  const resoudre = (ref) => {
    if (!ref) throw new Error('projet manquant : un nom, un chemin ou un identifiant');
    const p = resoudreProjet(projets, ref);
    if (!p?.location) throw new Error(`projet inconnu du catalogue : ${ref} (un dépôt neuf y entre par holarch inventaire)`);
    return p;
  };
  const projetDe = localiserProjet(projets);

  return {
    liste() {
      if (!fs.existsSync(unites)) return [];
      return fs.readdirSync(unites).filter((f) => f.startsWith(PREFIXE) && f.endsWith('.service') && sv.geree(path.join(unites, f))).map((f) => {
        const texte = fs.readFileSync(path.join(unites, f), 'utf8');
        const chemin = texte.match(/^WorkingDirectory=(.*)$/m)?.[1] ?? null;
        return { nom: f.slice(PREFIXE.length, -'.service'.length), chemin, projet: projetDe(chemin)?.id ?? null, actif: sv.actif(path.join(unites, f)) };
      });
    },
    activer(ref) {
      const p = resoudre(ref); const chemin = p.location;
      if (!fs.existsSync(chemin)) throw new Error(`dossier absent : ${chemin}`);
      // Le chemin trouvé, pas sa cible : un lien (~/.local/bin/claude) survit aux mises à jour de Claude Code.
      const binaire = claude || trouverOutil('claude');
      if (!binaire) throw new Error('claude introuvable dans le PATH (acces_distant.claude pour le préciser)');
      const nom = nomDe(chemin); const f = fichierUnite(nom);
      if (fs.existsSync(f) && !sv.geree(f)) throw new Error(`${f} existe et n'a pas été écrit par HOLARCH : rien n'est modifié`);
      const confiance = declarerConfiance(config.inventaire?.['claude-code']?.config || configClaude(path.join(os.homedir(), '.claude')), chemin);
      sv.poser(f, uniteDe({ nom, chemin, claude: binaire, mode: config.acces_distant?.mode_permissions || null }));
      poserReveil();
      return { nom, chemin, projet: p.id, unite: path.basename(f), confiance_declaree: confiance };
    },
    // Le service d'un projet sorti du catalogue doit rester retirable : à défaut de projet, la référence est son nom.
    desactiver(ref) {
      let p = null; try { p = resoudreProjet(projets, ref); } catch { /* nom ambigu : pris tel quel */ }
      const nom = p?.location ? nomDe(p.location) : String(ref).includes('/') ? nomDe(ref) : ref; const f = fichierUnite(nom);
      sv.retirer(f, `aucun accès distant actif pour ${nom}`);
      if (!this.liste().length) retirerReveil();
      return { nom, unite: path.basename(f) };
    },
    // Passage du minuteur : note l'heure ; après un écart (veille du poste), redémarre les accès distants actifs.
    reveil() {
      const t = maintenant(); let avant = null;
      try { avant = Date.parse(fs.readFileSync(reveil.passage, 'utf8').trim()); } catch { /* premier passage */ }
      fs.mkdirSync(path.dirname(reveil.passage), { recursive: true }); fs.writeFileSync(reveil.passage, `${new Date(t).toISOString()}\n`);
      const ecart = Number.isFinite(avant) ? t - avant : 0;
      if (ecart <= SEUIL_REVEIL) return { ecart_s: Math.round(ecart / 1e3), relances: [] };
      const relances = this.liste().filter((x) => x.actif).map((x) => { sv.lancer(['restart', `${PREFIXE}${x.nom}.service`]); return x.nom; });
      return { ecart_s: Math.round(ecart / 1e3), relances };
    },
  };
}

// Interface web en service (accès depuis le téléphone, par un relais HTTPS d'un réseau privé comme Tailscale Serve) :
// `holarch voir` tenu par un service utilisateur marqué, qui relit la même configuration (HOLARCH_HOME figé).
const UNITE_INTERFACE = 'holarch-interface.service';
export function uniteInterface({ node = process.execPath, holarch, accueil }) {
  return `${MARQUE} : interface web de HOLARCH. Retirée par \`holarch interface desactiver\`.
[Unit]
Description=HOLARCH : interface web
After=network-online.target

[Service]
Environment=${systemd(`HOLARCH_HOME=${accueil}`)}
Environment=${systemd(`PATH=${pathService(node)}`)}
ExecStart=${systemd(node)} --no-warnings ${systemd(holarch)} voir
Restart=on-failure
RestartSec=30
StandardOutput=null

[Install]
WantedBy=default.target
`;
}

export function creerInterface({ holarch, accueil }, { unites = UNITES, systemctl = SYSTEMCTL, node = process.execPath } = {}) {
  const sv = services({ unites, systemctl }); const f = path.join(unites, UNITE_INTERFACE);
  return {
    etat: () => ({ unite: UNITE_INTERFACE, presente: fs.existsSync(f), geree: sv.geree(f), actif: sv.actif(f) }),
    activer() { sv.poser(f, uniteInterface({ node, holarch, accueil })); return { unite: UNITE_INTERFACE }; },
    desactiver() { sv.retirer(f, 'interface en service : non activée'); return { unite: UNITE_INTERFACE }; },
    // Après une pose de la copie de service : réécrit l'unité si elle est de HOLARCH, et la relance (même code chargé
    // sinon) ; absente ou écrite à la main, rien n'est touché.
    relancer() {
      if (!fs.existsSync(f)) return { unite: UNITE_INTERFACE, etat: 'absente' };
      if (!sv.geree(f)) return { unite: UNITE_INTERFACE, etat: 'non écrite par HOLARCH : à relancer à la main' };
      const avant = fs.readFileSync(f, 'utf8'); const texte = uniteInterface({ node, holarch, accueil });
      sv.poser(f, texte); if (avant === texte) sv.lancer(['restart', UNITE_INTERFACE]);
      return { unite: UNITE_INTERFACE, etat: 'relancée' };
    },
  };
}

// Inventaire et import toutes les heures (décision copie-de-service) : un minuteur marqué et son service, qui lancent
// la copie de service. Le minuteur posé à la main avant cette décision ne porte pas la MARQUE : il n'est pas touché.
const UNITE_IMPORT = 'holarch-import';
export function uniteImport({ node = process.execPath, holarch, accueil }) {
  return `${MARQUE} : inventaire et import du journal, lancés par ${UNITE_IMPORT}.timer. Réécrit par \`holarch service poser\`.
[Unit]
Description=HOLARCH : inventaire et import du journal

[Service]
Type=oneshot
Environment=${systemd(`HOLARCH_HOME=${accueil}`)}
Environment=${systemd(`PATH=${pathService(node)}`)}
ExecStart=${systemd(node)} --no-warnings ${systemd(holarch)} inventaire
ExecStart=${systemd(node)} --no-warnings ${systemd(holarch)} importer
`;
}
const MINUTEUR_IMPORT = `${MARQUE} : inventaire et import toutes les heures. Réécrit par \`holarch service poser\`.
[Unit]
Description=HOLARCH : inventaire et import toutes les heures

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
`;

// Un service marqué et son minuteur, posés ensemble ; rien ne s'écrit si l'une des unités est de la main de l'auteur.
function creerMinuteur(nom, unite, minuteur, { unites, systemctl }) {
  const sv = services({ unites, systemctl });
  const f = path.join(unites, `${nom}.service`); const m = path.join(unites, `${nom}.timer`);
  return {
    poser() {
      for (const x of [f, m]) if (fs.existsSync(x) && !sv.geree(x)) throw new Error(`${x} existe et n'a pas été écrit par HOLARCH : rien n'est modifié`);
      const change = sv.ecrire(f, unite);
      if (change) sv.lancer(['daemon-reload']);
      sv.poser(m, minuteur);
      return { unite: `${nom}.timer`, etat: change ? 'posé' : 'inchangé' };
    },
  };
}

export function creerImport({ holarch, accueil }, { unites = UNITES, systemctl = SYSTEMCTL, node = process.execPath } = {}) {
  return creerMinuteur(UNITE_IMPORT, uniteImport({ node, holarch, accueil }), MINUTEUR_IMPORT, { unites, systemctl });
}

// Récolte chaque semaine (décision recolte, accord de l'auteur du 2026-10-08) : les redites nouvelles deviennent des
// règles brouillon, que la reprise annonce. Le lundi matin ; un poste éteint la rattrape au démarrage.
const UNITE_RECOLTE = 'holarch-recolte';
export function uniteRecolte({ node = process.execPath, holarch, accueil }) {
  return `${MARQUE} : récolte des consignes redites, lancée par ${UNITE_RECOLTE}.timer. Réécrit par \`holarch service poser\`.
[Unit]
Description=HOLARCH : récolte des consignes redites

[Service]
Type=oneshot
Environment=${systemd(`HOLARCH_HOME=${accueil}`)}
Environment=${systemd(`PATH=${pathService(node)}`)}
ExecStart=${systemd(node)} --no-warnings ${systemd(holarch)} recolte --proposer
ExecStart=${systemd(node)} --no-warnings ${systemd(holarch)} inventaire
`;
}
const MINUTEUR_RECOLTE = `${MARQUE} : récolte chaque lundi matin. Réécrit par \`holarch service poser\`.
[Unit]
Description=HOLARCH : récolte chaque semaine

[Timer]
OnCalendar=Mon *-*-* 08:00
Persistent=true

[Install]
WantedBy=timers.target
`;
export function creerRecolte({ holarch, accueil }, { unites = UNITES, systemctl = SYSTEMCTL, node = process.execPath } = {}) {
  return creerMinuteur(UNITE_RECOLTE, uniteRecolte({ node, holarch, accueil }), MINUTEUR_RECOLTE, { unites, systemctl });
}
