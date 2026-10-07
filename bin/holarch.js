#!/usr/bin/env node
// Ligne de commande HOLARCH (étape 1) : inventaire, importer, indexer, etat, voir.
import { Socle } from '../src/socle.js';
import { chargerConfig, ecrireConfigExemple, accueil, comptesClaudeCode } from '../src/config.js';
import { creerServeur } from '../src/web/serveur.js';
import { servirStdio } from '../src/mcp/serveur.js';
import { lancerPont } from '../src/pont.js';
import { creerDistant, creerInterface } from '../src/distant.js';
import { materialiserCompte, materialiserProjet } from '../src/materialisation.js';
import * as affichage from './affichage.js';
import { alerte, resume, reglesDuDossier } from '../src/contexte.js';
import { creerProjet } from '../src/creation.js';
import { creerService, binaireService } from '../src/service.js';
import { readFileSync as lire } from 'node:fs';
import { readFileSync } from 'node:fs';

const [cmd = 'aide', ...args] = process.argv.slice(2);
const json = args.includes('--json');
const afficher = (o) => console.log(json ? JSON.stringify(o, null, 2) : o);

const AIDE = `holarch — socle autour des agents d'IA

  holarch init         écrit une configuration d'exemple dans ${accueil()}/config.yaml
  holarch inventaire   recense ce qui est en place (catalogue)
  holarch importer     importe le journal (transcriptions Claude Code…)
  holarch etat         résumé : catalogue, sessions, tokens
  holarch voir         rafraîchit puis sert l'interface web (http://127.0.0.1:4280, --port N pour un autre port)
  holarch mcp          sert HOLARCH en MCP sur stdio, en lecture (claude mcp add holarch -- holarch mcp)
  holarch distant [activer|desactiver <projet>]
                       accès distant par projet : un serveur Remote Control de Claude Code par projet, à la demande ;
                       sans argument, liste les projets dont l'accès est actif (<projet> : projet du catalogue, par
                       son nom, un chemin ou son identifiant) ; reveil : lancé chaque minute par un minuteur, redémarre
                       les accès actifs après une veille du poste
  holarch interface [activer|desactiver]
                       l'interface web en service utilisateur (pour un relais HTTPS d'un réseau privé, Tailscale Serve
                       par exemple, dont le nom se déclare dans web.hotes_admis) ; sans argument, son état
  holarch service [poser [<commit>]]
                       copie de service : ce que lancent l'import horaire, l'interface, les crochets, le serveur MCP
                       et la garde (une copie du socle tirée d'un commit, jamais la copie de travail) ; sans argument,
                       la copie en service et son retard ; poser : HEAD d'une copie de travail propre aux tests verts,
                       ou une copie déjà posée (retour arrière), puis relance de l'interface et de l'import
  holarch regles [<projet>]
                       règle effective d'un projet (profil, contexte, types, projet ; provenance, où Claude Code la
                       lit) ; sans projet, ce qui vaut pour tout le compte et les projets qui ont des règles
  holarch regles appliquer [<projet>…]
                       écrit les règles applicables : compte (<compte>/rules/holarch/, lectures refusées dans
                       <compte>/settings.json) et chaque projet cité (.claude/rules/holarch/, à commiter ; crochet
                       pre-commit de git si une règle bloquante le demande) ; ne touche ni CLAUDE.md ni un fichier non marqué
  holarch projet creer <nom> [--contexte <c>] [--type <t>]… [--description <phrase>] [--a-blanc]
                       crée un projet ou complète un projet existant : dépôt et identité, fichiers de base,
                       déclaration au contexte, règles et crochet, dépôt GitHub, clé de déploiement, accès distant,
                       audit ; rejouée, fait ce qui manque et rien d'autre ; ce que seul l'auteur peut faire sort en
                       geste réservé ; --a-blanc dit ce qui serait fait et n'écrit rien
  holarch audit [<projet>]
                       audit de conformité : contrôles des règles bloquantes et vérifiées, fichiers générés, crochet,
                       permissions, mémoires remplacées ; les écarts apparus ou résolus vont au journal (aussi après
                       chaque inventaire)
  holarch recolte [--jours N] [--jusqua AAAA-MM-JJ] [--modele m] [--budget usd] [--a-blanc | --proposer]
                       consignes de l'auteur redites d'une session ou d'un projet à l'autre (messages et mémoires de
                       retour de la période, 30 jours par défaut), regroupées par sens par claude -p, comptées par le
                       socle ; les candidats où gitleaks voit un secret ne partent pas ; --a-blanc : les candidats seuls
  holarch garde avant-commit
                       appelée par le crochet de git : refuse le commit si une règle bloquante du projet n'est pas tenue
  holarch contexte alerte --seuil <tokens> | contexte debut
                       appelés par les crochets de Claude Code (entrée JSON du crochet) : avis de passation au-delà du
                       seuil ; résumé du projet au démarrage d'une session
  holarch pont <url> --cle <fichier>
                       pont stdio vers le hub HTTP d'un site (pour un client stdio comme Claude Desktop) : reprend une
                       session expirée, ferme la sienne en partant ; la clé est lue dans le fichier

Options : --json (sortie brute), --help. Répertoire de travail : HOLARCH_HOME (défaut ~/.holarch).`;

// Une option inconnue arrête la commande avant qu'elle n'agisse : lancée « pour voir l'aide », elle n'écrit rien.
const OPTIONS = { pont: ['--cle'], voir: ['--port'], contexte: ['--seuil'], recolte: ['--jours', '--jusqua', '--modele', '--budget', '--a-blanc', '--proposer'], projet: ['--contexte', '--type', '--description', '--a-blanc'] };
if (args.includes('--help') || args.includes('-h')) { console.log(AIDE); process.exit(0); }
const inconnue = args.find((a) => a.startsWith('-') && a !== '--json' && !(OPTIONS[cmd] || []).includes(a));
if (inconnue) { console.error(`holarch ${cmd} : option inconnue ${inconnue} (holarch --help)`); process.exit(2); }

const socle = () => new Socle(chargerConfig());

switch (cmd) {
  // Rien ne s'écrit sur la sortie standard en mode MCP : c'est le canal du protocole.
  case 'mcp': servirStdio(socle(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); break;
  // Pont stdio → hub : la sortie standard est le canal du protocole, les traces vont sur stderr.
  case 'pont': { const i = args.indexOf('--cle'); await lancerPont({ url: args.find((a) => /^https?:\/\//.test(a)), fichierCle: i >= 0 ? args[i + 1] : null }); break; }
  case 'init': console.log(ecrireConfigExemple() ? `configuration écrite : ${accueil()}/config.yaml` : 'configuration déjà présente'); break;
  case 'inventaire': { const s = socle(); const r = await s.inventaire(); s.indexer(); const a = s.audit({ journaliser: true }); r.audit = { ouverts: a.cibles.reduce((t, c) => t + c.ecarts.length, 0), ...a.journal }; afficher(json ? r : affichage.inventaire(r)); break; }
  case 'importer': { const s = socle(); const r = s.importer(); s.indexer(); afficher(json ? r : affichage.importer(r)); break; }
  case 'indexer': afficher(socle().indexer()); break;
  case 'distant': {
    const d = creerDistant(chargerConfig()); const [action, projet] = args.filter((a) => !a.startsWith('--'));
    try {
      if (action === 'activer') { const r = d.activer(projet); afficher(json ? r : `accès distant actif : ${r.nom} (${r.chemin}), service ${r.unite}${r.confiance_declaree ? ' ; dossier déclaré de confiance pour Claude Code' : ''}`); }
      else if (action === 'desactiver') { const r = d.desactiver(projet); afficher(json ? r : `accès distant retiré : ${r.nom}`); }
      else if (action === 'reveil') { const r = d.reveil(); if (json || r.relances.length) afficher(json ? r : `veille de ${r.ecart_s} s : redémarré ${r.relances.join(', ')}`); }
      else { const l = d.liste(); afficher(json ? l : l.length ? l.map((p) => `${p.actif ? 'actif  ' : 'arrêté '} ${p.nom}  ${p.chemin}`).join('\n') : 'aucun accès distant par projet (holarch distant activer <projet>)'); }
    } catch (e) { console.error(`holarch distant : ${e.message}`); process.exit(1); }
    break; }
  case 'interface': {
    const [action] = args.filter((a) => !a.startsWith('--'));
    const { accueil } = chargerConfig(); const i = creerInterface({ holarch: binaireService(accueil), accueil });
    try {
      if (action === 'activer') afficher(json ? i.activer() : `interface en service : ${i.activer().unite}`);
      else if (action === 'desactiver') afficher(json ? i.desactiver() : `interface retirée du service : ${i.desactiver().unite}`);
      else { const e = i.etat(); afficher(json ? e : !e.presente ? 'interface hors service (holarch interface activer)' : `${e.actif ? 'active' : 'arrêtée'} : ${e.unite}${e.geree ? '' : ' (non écrite par HOLARCH)'}`); }
    } catch (e) { console.error(`holarch interface : ${e.message}`); process.exit(1); }
    break; }
  case 'service': {
    const config = chargerConfig(); const [action, ref] = args.filter((a) => !a.startsWith('--'));
    const sv = creerService({ accueil: config.accueil, comptes: comptesClaudeCode(config, config.inventaire['claude-code'] || {}) });
    try {
      if (action === 'poser') { const r = sv.poser(ref); afficher(json ? r : affichage.posee(r)); if (r.points.some((p) => p.etat === 'erreur')) process.exit(1); }
      else if (action) throw new Error(`action inconnue : ${action}`);
      else { const e = sv.etat(); afficher(json ? e : affichage.service(e)); }
    } catch (e) { console.error(`holarch service : ${e.message}`); process.exit(1); }
    break; }
  case 'regles': {
    const s = socle(); s.indexer(); const [action, ...refs] = args.filter((a) => !a.startsWith('--'));
    try {
      if (action === 'appliquer') {
        // Toutes les références d'abord : rien ne s'écrit si l'une d'elles est fausse. Puis le compte, puis les projets.
        const effectives = refs.map((ref) => { const r = s.regles({ projet: ref }); if (!r.chemin) throw new Error(`projet sans emplacement sur ce site : ${ref}`); return r; });
        const comptes = materialiserCompte(s.regles().compte, comptesClaudeCode(s.config, s.config.inventaire['claude-code'] || {}), { accueil: s.config.accueil });
        const projets = effectives.map((r) => ({ nom: r.nom, m: materialiserProjet(r, r.chemin, { accueil: s.config.accueil }) }));
        const texte = affichage.appliquer({ comptes, projets });
        afficher(json ? texte.split('\n') : texte);
        // Un settings.json illisible n'est jamais réécrit, et la commande échoue (comme avant la consolidation).
        if (comptes.some((m) => m.permissions.erreur || m.reglages.erreur)) process.exit(1);
      } else if (action) {
        const r = s.regles({ projet: action });
        afficher(json ? r : affichage.reglesProjet(r));
      } else {
        const r = s.regles();
        afficher(json ? r : affichage.reglesCompte(r));
      }
    } catch (e) { console.error(`holarch regles : ${e.message}`); process.exit(1); }
    break; }
  // Crochets de Claude Code (décision passation-sereine) : ne jamais faire échouer un message ni un démarrage.
  case 'contexte': {
    try {
      const entree = JSON.parse(lire(0, 'utf8') || '{}');
      if (args[0] === 'alerte') {
        const i = args.indexOf('--seuil'); const a = alerte({ transcription: entree.transcript_path, seuil: +args[i + 1], regles: () => reglesDuDossier(socle(), entree.cwd || process.cwd()) });
        if (a) console.log(JSON.stringify({ systemMessage: a.auteur, hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: a.agent } }));
      } else if (args[0] === 'debut') {
        const s = socle(); const r = resume(s, entree.cwd || process.cwd());
        if (r) console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: r } }));
      }
    } catch (e) { console.error(`holarch contexte : ${e.message}`); }
    break; }
  case 'projet': {
    // Les options à valeur prennent l'argument suivant ; --type se répète.
    const o = { types: [], positionnels: [] };
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--contexte') o.contexte = args[++i]; else if (a === '--type') o.types.push(args[++i]);
      else if (a === '--description') o.description = args[++i]; else if (a === '--a-blanc') o.aBlanc = true;
      else if (a !== '--json') o.positionnels.push(a);
    }
    const [action, nom] = o.positionnels;
    try {
      if (action !== 'creer') throw new Error('action attendue : creer (holarch --help)');
      const s = socle(); s.indexer();
      const r = await creerProjet(s, { nom, contexte: o.contexte, types: o.types, description: o.description, aBlanc: Boolean(o.aBlanc) });
      afficher(json ? r : affichage.creation(r));
      if (r.etapes.some((e) => e.etat === 'echec')) process.exit(1);
    } catch (e) { console.error(`holarch projet : ${e.message}`); process.exit(1); }
    break; }
  case 'recolte': {
    const val = (o) => { const i = args.indexOf(o); return i >= 0 ? args[i + 1] : undefined; };
    try {
      if (val('--jusqua') !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(val('--jusqua'))) throw new Error('--jusqua attend une date AAAA-MM-JJ');
      const jusqua = val('--jusqua') ? new Date(`${val('--jusqua')}T00:00:00Z`).toISOString() : null;
      const jours = +(val('--jours') ?? 30);
      if (!(jours > 0)) throw new Error('--jours attend un nombre de jours');
      const depuis = new Date((jusqua ? Date.parse(jusqua) : Date.now()) - jours * 864e5).toISOString();
      const s = socle(); s.indexer();
      const r = s.recolte({ depuis, jusqua, aBlanc: args.includes('--a-blanc'), proposer: args.includes('--proposer'), modele: val('--modele'), budget: val('--budget') });
      if (r.propositions?.ecrites.length) { await s.inventaire(); s.indexer(); }
      afficher(json ? r : affichage.recolte(r));
    } catch (e) { console.error(`holarch recolte : ${e.message}`); process.exit(1); }
    break; }
  case 'audit': {
    const s = socle(); s.indexer(); const [projet] = args.filter((a) => !a.startsWith('--'));
    try {
      const a = s.audit({ projet: projet || null, journaliser: true });
      afficher(json ? a : affichage.audit(a));
    } catch (e) { console.error(`holarch audit : ${e.message}`); process.exit(1); }
    break; }
  // Appelée par le crochet de git : une panne de HOLARCH laisse passer le commit et le dit (l'audit rattrape).
  case 'garde': {
    try {
      const r = socle().garde({ depot: process.cwd(), moment: args[0] || 'avant-commit', journaliser: true });
      for (const x of r.indisponibles) console.error(`HOLARCH : contrôle ${x.id} non disponible (${x.raison}) : non vérifié`);
      if (r.refus.length) {
        if (r.journal_erreur) console.error(`HOLARCH : refus non écrit au journal (${r.journal_erreur})`);
        for (const x of r.refus) console.error(`HOLARCH : commit refusé par la règle ${x.regle} — ${x.enonce}\n${x.ecarts.map((e) => `  ${e.fichier ? `${e.fichier}${e.ligne ? `:${e.ligne}` : ''} : ` : ''}${e.message}`).join('\n')}`);
        process.exit(1);
      }
    } catch (e) { console.error(`HOLARCH : garde en échec (${e.message}) : commit non contrôlé`); }
    break; }
  case 'etat': { const s = socle(); s.indexer(); const e = s.etat(); if (json) { afficher(e); break; }
    console.log(`site ${e.site} · ${e.evenements} événements · sessions ${e.sessions.total} (dont ${e.periode.sessions} sur ${e.periode.jours} jours)`);
    console.log(`catalogue : ${e.fiches_par_type.map((f) => `${f.kind} ${f.n}`).join(' · ')}`);
    for (const t of e.tokens) console.log(`${t.jours} j : sortie ${t.sortie ?? 0} tokens, cache lu ${t.cache_lu ?? 0}${t.usd != null ? `, ${t.usd.toFixed(2)} USD liste` : e.tarifs_configures ? '' : ' (coût inconnu : aucun tarif configuré)'}`);
    if (e.periode.par_compte.length) console.log(`comptes sur ${e.periode.jours} j : ${e.periode.par_compte.map((c) => `${c.cle ?? 'non attribué'} ${c.sessions} session(s)${c.usd != null ? ` ${c.usd.toFixed(2)} USD` : ''}`).join(' · ')}`);
    if (e.periode.degradations.length) console.log(`ATTENTION passerelle, cibles ignorées sur ${e.periode.jours} j : ${e.periode.degradations.map((x) => `${x.cle} ${x.n}${x.demarrage ? ` (dont ${x.demarrage} au démarrage)` : ''}, dernière ${x.dernier.slice(0, 16).replace('T', ' ')}`).join(' · ')}`);
    const nl = e.dernier_inventaire?.comptes_non_lus || [];
    if (nl.length) console.log(`ATTENTION comptes Claude Code non lus : ${nl.join(', ')} (comptes_claude_code dans la configuration)`);
    if (e.tarifs_configures) console.log(`tarifs : grille du ${e.tarifs.releve ?? '?'} (${e.tarifs.source ?? 'source non citée'})${e.periode.sans_tarif.length ? ` ; sans tarif sur ${e.periode.jours} j : ${e.periode.sans_tarif.map((m) => m.model).join(', ')}` : ''}`);
    break; }
  case 'voir': {
    const s = socle(); const r = await s.rafraichir();
    console.log(`rafraîchi : ${r.inventaire.fiches} fiches, ${r.index.evenements} événements`);
    const { hote } = s.config.web;
    const i = args.indexOf('--port'); const port = i >= 0 ? +args[i + 1] : s.config.web.port;
    const serveur = creerServeur(s);
    serveur.on('error', (e) => {
      if (e.code !== 'EADDRINUSE') throw e;
      console.error(`Le port ${port} est déjà pris : l'interface tourne peut-être déjà (http://${hote}:${port}).\nSinon : holarch voir --port ${port + 1}`);
      process.exit(1);
    });
    serveur.listen(port, hote, () => console.log(`HOLARCH · interface : http://${hote}:${port}`));
    break; }
  default: console.log(AIDE);
}
