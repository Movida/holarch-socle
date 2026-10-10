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
import { shell, systemd, fichierMarque, lireJson, ecrireJson, binaireClaude, configClaude, claudeIntrouvable } from './commun.js';
import { accueil as accueilParDefaut } from './config.js';
import { binaireService } from './service.js';
import { marquerRelance } from './veille.js';

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
function services({ unites, systemctl, sousSystemd = SOUS_SYSTEMD }) {
  const geree = (f) => fichierMarque(f, MARQUE);
  const lancer = (args) => { const r = systemctl(args); if (r.status !== 0) throw new Error(`systemctl --user ${args.join(' ')} : ${(r.stderr || '').trim() || r.error?.message || `code ${r.status}`}`); return r; };
  return {
    unites, geree, lancer,
    // Le gestionnaire systemd utilisateur : `disponible`, `is-system-running` dit son état (aide de systemctl) ; `absent`,
    // le système n'a pas démarré sous systemd (WSL sans systemd, conteneur, où le faux systemctl des images Dev Containers
    // répond 0 à tout, avec un texte) ; `injoignable`, systemd tourne mais son instance utilisateur ne répond pas (sans
    // `XDG_RUNTIME_DIR` ni bus : `sudo -u`, `env -i`), avec le `message` de systemctl.
    systemd() {
      const r = systemctl(['is-system-running']);
      if (ETATS_SYSTEMD.includes(r.stdout?.trim())) return { etat: 'disponible' };
      if (!sousSystemd()) return { etat: 'absent' };
      return { etat: 'injoignable', message: (r.stderr || '').trim().split('\n')[0] || r.error?.message || `code ${r.status}` };
    },
    actif: (f) => fs.existsSync(f) && systemctl(['is-active', path.basename(f)]).stdout?.trim() === 'active',
    // Coupée à la main (`systemctl --user disable`) : une pose la réécrit sans la rallumer (décision routines-posees).
    coupee: (f) => fs.existsSync(f) && systemctl(['is-enabled', path.basename(f)]).stdout?.trim() === 'disabled',
    // Écrit l'unité et la démarre ; une unité déjà active dont le texte change est redémarrée (`avantRelance` juste avant).
    poser(f, texte, { avantRelance = () => {} } = {}) {
      if (fs.existsSync(f) && !geree(f)) throw new Error(`${f} existe et n'a pas été écrit par HOLARCH : rien n'est modifié`);
      const avant = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
      fs.mkdirSync(unites, { recursive: true }); fs.writeFileSync(f, texte);
      lancer(['daemon-reload']); lancer(['enable', '--now', path.basename(f)]);
      if (avant != null && avant !== texte) { avantRelance(); lancer(['restart', path.basename(f)]); }
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
const ETATS_SYSTEMD = ['initializing', 'starting', 'running', 'degraded', 'maintenance', 'stopping'];
const UNITES = path.join(os.homedir(), '.config', 'systemd', 'user');
const SYSTEMCTL = (args) => spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' });
// Le système a démarré sous systemd : le dossier `/run/systemd/system/` existe (le test de sd_booted(3)).
const SOUS_SYSTEMD = () => fs.existsSync('/run/systemd/system');
// Vrai si systemd utilisateur répond, faux s'il n'existe pas ; injoignable, une erreur : il existe, une unité ne peut ni
// se dire posée ni se dire impossible.
function systemdPresent(sv) {
  const s = sv.systemd();
  if (s.etat === 'injoignable') throw new Error(`systemd utilisateur injoignable : ${s.message}`);
  return s.etat === 'disponible';
}

// Session au démarrage (`acces_distant.session_au_demarrage`, décision environnement-d-execution) : `aucune`, le
// serveur démarre sans session ouverte et l'auteur en ouvre une depuis l'application (contexte neuf, une session
// archivée le reste) ; `reprendre`, il reprend la dernière session du dossier (`--continue`, moins de quatre heures
// environ, et la désarchive), sinon en crée une. Les deux options ne se combinent pas (Claude Code 2.1.295).
// Sortie : l'affichage du serveur, redessiné chaque seconde, est jeté ; ses erreurs vont au journal (sans
// `StandardError`, systemd les envoie avec la sortie standard). De même pour l'interface.
export const SESSIONS_AU_DEMARRAGE = ['aucune', 'reprendre'];
export function uniteDe({ nom, chemin, claude, mode, session = 'aucune' }) {
  if (!SESSIONS_AU_DEMARRAGE.includes(session)) throw new Error(`acces_distant.session_au_demarrage : ${session} inconnu (${SESSIONS_AU_DEMARRAGE.join(' ou ')})`);
  const options = ['--name', nom, '--remote-control-session-name-prefix', nom, ...(mode ? ['--permission-mode', mode] : [])].map(shell).join(' ');
  const script = session === 'reprendre'
    ? `${shell(claude)} remote-control --continue ${options} || exec ${shell(claude)} remote-control ${options}`
    : `exec ${shell(claude)} remote-control --no-create-session-in-dir ${options}`;
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
StandardError=journal

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

// Veille retardée (décision environnement-d-execution, livraison B) : le gardien qui tient la demande d'éveil de Windows
// tant qu'une session distante l'interdit (src/veille.js). Il suit la seule règle `veille-retardee`, comme les crochets
// qui notent les sessions : posé et retiré par `regles appliquer` et la pose de la copie de service, jamais par un accès
// distant (une session reliée par `/remote-control` n'en a pas besoin pour être retenue). Nom hors PREFIXE.
const UNITE_VEILLE = 'holarch-veille.service';
export function uniteVeille({ node = process.execPath, holarch, accueil }) {
  return `${MARQUE} : veille retardée sous une session distante. Posée et retirée avec la règle veille-retardee (holarch regles appliquer).
[Unit]
Description=HOLARCH : veille retardée sous une session distante

[Service]
Environment=${systemd(`HOLARCH_HOME=${accueil}`)}
Environment=${systemd(`PATH=${pathService(node)}`)}
ExecStart=${systemd(node)} --no-warnings ${systemd(holarch)} veille tenir
Restart=on-failure
RestartSec=30
StandardError=journal

[Install]
WantedBy=default.target
`;
}

/**
 * Le réveil et le gardien de veille, après une pose de la copie de service ou des règles : `reecrire`, l'unité de réveil
 * réécrite si elle est de HOLARCH, pour lancer la copie posée (écrite avant, elle lancerait la copie de travail) ; le
 * réveil absent, rien n'est posé (il vient avec le premier accès distant). `gardien`, posé si la règle s'applique, ou
 * réécrit et relancé (une relance relâche puis reprend la demande), retiré sinon. Un gardien coupé à la main est réécrit
 * sans être rallumé (décision routines-posees) ; inchangé, il est relancé, comme l'interface : son chemin est celui du
 * lien de la copie en service.
 */
export function creerReveil({ holarch, accueil }, { unites = UNITES, systemctl = SYSTEMCTL, sousSystemd = SOUS_SYSTEMD, node = process.execPath } = {}) {
  const sv = services({ unites, systemctl, sousSystemd }); const f = path.join(unites, `${UNITE_REVEIL}.service`); const g = path.join(unites, UNITE_VEILLE);
  // `veille` : la règle s'applique (module materialisation, `veilleVoulue`) ; null, règle indéterminée (règles du compte
  // illisibles, aucun profil ou plusieurs) : rien ne se pose ni ne se retire, mais un gardien actif est relancé (il
  // garderait sinon le code d'avant la pose).
  // Une relance se marque juste avant : l'état du gardien la dit pendant le trou (module veille, `marquerRelance`).
  const relancerGardien = () => { marquerRelance(accueil); sv.lancer(['restart', UNITE_VEILLE]); };
  function suivreRegle(veille, relancer) {
    if (veille === null) {
      const etat = 'règle veille-retardee indéterminée (règles du compte illisibles, aucun profil ou plusieurs) : laissé';
      if (!relancer || !sv.geree(g) || !sv.actif(g)) return { unite: UNITE_VEILLE, etat };
      relancerGardien(); return { unite: UNITE_VEILLE, etat: `${etat}, relancé` };
    }
    if (!veille) return { unite: UNITE_VEILLE, etat: retirerVeille(sv, g) };
    // Sans systemd utilisateur, aucun gardien ne peut tourner : rien ne s'écrit, et la commande n'échoue pas (le contrôle
    // dit l'écart là où un mécanisme existe). Injoignable, c'est une erreur.
    if (!systemdPresent(sv)) return { unite: UNITE_VEILLE, etat: `sans systemd utilisateur : ${fs.existsSync(g) ? 'laissé' : 'non posé'}` };
    const etat = poserVeille(sv, g, uniteVeille({ node, holarch, accueil }), () => marquerRelance(accueil));
    // Texte inchangé (le lien `courant` ne change pas de chemin) : le gardien tourne encore l'ancien code.
    if (etat === 'inchangée' && relancer) { relancerGardien(); return { unite: UNITE_VEILLE, etat: 'relancée' }; }
    return { unite: UNITE_VEILLE, etat };
  }
  return {
    reecrire() {
      if (!fs.existsSync(f)) return { unite: path.basename(f), etat: 'absente' };
      if (!sv.geree(f)) return { unite: path.basename(f), etat: 'non écrite par HOLARCH : laissée' };
      if (!sv.ecrire(f, uniteReveil({ node, holarch, accueil }))) return { unite: path.basename(f), etat: 'inchangée' };
      sv.lancer(['daemon-reload']); return { unite: path.basename(f), etat: 'réécrite' };
    },
    // `veille` : la valeur, ou la fonction qui lit la règle au moment de poser. Ne lève jamais : une règle illisible ou
    // un systemctl en échec rendent `erreur` et son message, que la commande appelante dit après ce qu'elle a écrit.
    gardien({ veille = null, relancer = true } = {}) {
      try { return suivreRegle(typeof veille === 'function' ? veille() : veille, relancer); } catch (e) { return { unite: UNITE_VEILLE, etat: 'erreur', message: e.message }; }
    },
  };
}

// Pose du gardien : unité de la main laissée, coupée à la main réécrite sans être rallumée, sinon posée (démarrée,
// relancée si son texte change).
function poserVeille(sv, g, texte, avantRelance) {
  if (fs.existsSync(g) && !sv.geree(g)) return 'non écrite par HOLARCH : laissée';
  if (sv.coupee(g)) { if (sv.ecrire(g, texte)) sv.lancer(['daemon-reload']); return 'coupée à la main : laissée'; }
  const avant = fs.existsSync(g) ? fs.readFileSync(g, 'utf8') : null;
  sv.poser(g, texte, { avantRelance });
  return avant === null ? 'posée' : avant === texte ? 'inchangée' : 'réécrite';
}

// Retrait du gardien quand la règle ne s'applique plus : une unité de la main n'est jamais touchée.
function retirerVeille(sv, g) {
  if (!fs.existsSync(g)) return 'règle veille-retardee non appliquée : non posé';
  if (!sv.geree(g)) return 'non écrite par HOLARCH : laissée';
  if (!systemdPresent(sv)) return 'règle veille-retardee non appliquée, sans systemd utilisateur : laissé';
  sv.retirer(g); return 'règle veille-retardee non appliquée : retiré';
}

// Ce que dit l'état du gardien quand systemd utilisateur ne répond pas : l'unité ne se lit pas.
export const GARDIEN_ILLISIBLE = 'illisible, systemd utilisateur injoignable';

/**
 * État du gardien de veille vu des services : absent (impossible sans systemd utilisateur), actif, arrêté, coupé, écrit à
 * la main, ou illisible (systemd utilisateur injoignable, `systemd` : le message de systemctl).
 */
export function etatVeille({ unites = UNITES, systemctl = SYSTEMCTL, sousSystemd = SOUS_SYSTEMD } = {}) {
  const sv = services({ unites, systemctl, sousSystemd }); const g = path.join(unites, UNITE_VEILLE);
  // systemd d'abord : sans lui, une unité posée avant ne tourne pas (« arrêtée » renverrait à la relancer).
  const s = sv.systemd();
  const gardien = s.etat === 'injoignable' ? GARDIEN_ILLISIBLE : s.etat === 'absent' ? 'impossible sans systemd utilisateur'
    : !fs.existsSync(g) ? 'absent' : !sv.geree(g) ? 'écrit à la main' : sv.actif(g) ? 'actif' : sv.coupee(g) ? 'coupé' : 'arrêté';
  return { unite: UNITE_VEILLE, gardien, ...(s.message && { systemd: s.message }) };
}

/** Les accès distants posés par HOLARCH (unités marquées) et leur dossier de travail, lus sans systemctl. */
export function accesDistants({ unites = UNITES } = {}) {
  if (!fs.existsSync(unites)) return [];
  return fs.readdirSync(unites).filter((f) => f.startsWith(PREFIXE) && f.endsWith('.service') && fichierMarque(path.join(unites, f), MARQUE))
    .map((f) => ({ nom: f.slice(PREFIXE.length, -'.service'.length), chemin: fs.readFileSync(path.join(unites, f), 'utf8').match(/^WorkingDirectory=(.*)$/m)?.[1] ?? null }));
}

export function creerDistant(config, {
  unites = UNITES, systemctl = SYSTEMCTL,
  claude = null,
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
      return accesDistants({ unites }).map((a) => ({ ...a, projet: projetDe(a.chemin)?.id ?? null, actif: sv.actif(path.join(unites, `${PREFIXE}${a.nom}.service`)) }));
    },
    activer(ref) {
      const p = resoudre(ref); const chemin = p.location;
      if (!fs.existsSync(chemin)) throw new Error(`dossier absent : ${chemin}`);
      // Le chemin trouvé, pas sa cible : un lien (~/.local/bin/claude) survit aux mises à jour de Claude Code.
      const binaire = claude || binaireClaude(config);
      if (!binaire) throw new Error(claudeIntrouvable(config));
      const nom = nomDe(chemin); const f = fichierUnite(nom);
      if (fs.existsSync(f) && !sv.geree(f)) throw new Error(`${f} existe et n'a pas été écrit par HOLARCH : rien n'est modifié`);
      // L'unité d'abord : un réglage refusé n'écrit rien, pas même la confiance.
      const texte = uniteDe({ nom, chemin, claude: binaire, mode: config.acces_distant?.mode_permissions || null, session: config.acces_distant?.session_au_demarrage || 'aucune' });
      const confiance = declarerConfiance(config.inventaire?.['claude-code']?.config || configClaude(path.join(os.homedir(), '.claude')), chemin);
      sv.poser(f, texte);
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
    // Passage du minuteur : note l'heure ; après un écart (veille du poste), redémarre les accès distants actifs, un par
    // un : un échec n'arrête pas les suivants, il se dit (un accès en échec n'est plus actif, le passage suivant le laisse).
    reveil() {
      const t = maintenant(); let avant = null;
      try { avant = Date.parse(fs.readFileSync(reveil.passage, 'utf8').trim()); } catch { /* premier passage */ }
      fs.mkdirSync(path.dirname(reveil.passage), { recursive: true }); fs.writeFileSync(reveil.passage, `${new Date(t).toISOString()}\n`);
      const ecart = Number.isFinite(avant) ? t - avant : 0;
      if (ecart <= SEUIL_REVEIL) return { ecart_s: Math.round(ecart / 1e3), relances: [], echecs: [] };
      const relances = []; const echecs = [];
      for (const x of this.liste().filter((u) => u.actif)) {
        try { sv.lancer(['restart', `${PREFIXE}${x.nom}.service`]); relances.push(x.nom); } catch (e) { echecs.push({ nom: x.nom, message: e.message }); }
      }
      return { ecart_s: Math.round(ecart / 1e3), relances, echecs };
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
StandardError=journal

[Install]
WantedBy=default.target
`;
}

/** État des routines que pose la copie de service : absente, activée, coupée (à la main), ou écrite à la main. */
export function etatRoutines({ unites = UNITES, systemctl = SYSTEMCTL } = {}) {
  const sv = services({ unites, systemctl });
  return [UNITE_INTERFACE, `${UNITE_IMPORT}.timer`, `${UNITE_RECOLTE}.timer`, `${UNITE_REVEIL}.timer`, UNITE_VEILLE].map((unite) => {
    const f = path.join(unites, unite);
    return { unite, etat: !fs.existsSync(f) ? 'absente' : !sv.geree(f) ? 'écrite à la main' : sv.coupee(f) ? 'coupée' : 'activée' };
  });
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
      if (sv.coupee(f)) { if (sv.ecrire(f, texte)) sv.lancer(['daemon-reload']); return { unite: UNITE_INTERFACE, etat: 'coupée à la main : laissée' }; }
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
      if (sv.coupee(m)) {
        if ([sv.ecrire(f, unite), sv.ecrire(m, minuteur)].some(Boolean)) sv.lancer(['daemon-reload']);
        return { unite: `${nom}.timer`, etat: 'coupé à la main : laissé' };
      }
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
