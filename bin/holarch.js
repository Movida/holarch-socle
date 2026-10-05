#!/usr/bin/env node
// Ligne de commande HOLARCH (étape 1) : inventaire, importer, indexer, etat, voir.
import { Socle } from '../src/socle.js';
import { chargerConfig, ecrireConfigExemple, accueil } from '../src/config.js';
import { creerServeur } from '../src/web/serveur.js';
import { servirStdio } from '../src/mcp/serveur.js';
import { lancerPont } from '../src/pont.js';
import { creerDistant } from '../src/distant.js';
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
                       son nom, un chemin ou son identifiant)
  holarch pont <url> --cle <fichier>
                       pont stdio vers le hub HTTP d'un site (pour un client stdio comme Claude Desktop) : reprend une
                       session expirée, ferme la sienne en partant ; la clé est lue dans le fichier

Options : --json (sortie brute). Répertoire de travail : HOLARCH_HOME (défaut ~/.holarch).`;

const socle = () => new Socle(chargerConfig());

switch (cmd) {
  // Rien ne s'écrit sur la sortie standard en mode MCP : c'est le canal du protocole.
  case 'mcp': servirStdio(socle(), JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version); break;
  // Pont stdio → hub : la sortie standard est le canal du protocole, les traces vont sur stderr.
  case 'pont': { const i = args.indexOf('--cle'); await lancerPont({ url: args.find((a) => /^https?:\/\//.test(a)), fichierCle: i >= 0 ? args[i + 1] : null }); break; }
  case 'init': console.log(ecrireConfigExemple() ? `configuration écrite : ${accueil()}/config.yaml` : 'configuration déjà présente'); break;
  case 'inventaire': { const s = socle(); const r = await s.inventaire(); s.indexer(); afficher(json ? r : `${r.fiches} fiches (${r.apparues.length} apparues, ${r.disparues.length} disparues, ${r.deplacees.length} déplacées, ${r.refusees.length} refusées)${r.erreurs.length ? `\nerreurs : ${r.erreurs.join(' ; ')}` : ''}${r.absentes.length ? `\nnon vues sur cette machine : ${r.absentes.join(' ; ')}` : ''}${r.comptes_non_lus?.length ? `\nATTENTION comptes Claude Code non lus : ${r.comptes_non_lus.join(', ')}` : ''}`); break; }
  case 'importer': { const s = socle(); const r = s.importer(); s.indexer(); afficher(json ? r : Object.entries(r).map(([k, v]) => `${k} : ${v.fichiers_lus} fichier(s) lu(s), ${v.ajoutes} événement(s) ajouté(s), ${v.ignores} déjà connu(s), ${v.refuses} refusé(s)${v.en_cours_ignores ? `, ${v.en_cours_ignores} session(s) en cours laissée(s) pour plus tard` : ''}${v.absent !== undefined ? ` (fichier absent : ${v.absent ?? 'non configuré'})` : ''}`).join('\n')); break; }
  case 'indexer': afficher(socle().indexer()); break;
  case 'distant': {
    const d = creerDistant(chargerConfig()); const [action, projet] = args.filter((a) => !a.startsWith('--'));
    try {
      if (action === 'activer') { const r = d.activer(projet); afficher(json ? r : `accès distant actif : ${r.nom} (${r.chemin}), service ${r.unite}${r.confiance_declaree ? ' ; dossier déclaré de confiance pour Claude Code' : ''}`); }
      else if (action === 'desactiver') { const r = d.desactiver(projet); afficher(json ? r : `accès distant retiré : ${r.nom}`); }
      else { const l = d.liste(); afficher(json ? l : l.length ? l.map((p) => `${p.actif ? 'actif  ' : 'arrêté '} ${p.nom}  ${p.chemin}`).join('\n') : 'aucun accès distant par projet (holarch distant activer <projet>)'); }
    } catch (e) { console.error(`holarch distant : ${e.message}`); process.exit(1); }
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
