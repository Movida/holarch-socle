#!/usr/bin/env node
// Ligne de commande HOLARCH (étape 1) : inventaire, importer, indexer, etat, voir.
import { Socle } from '../src/socle.js';
import { chargerConfig, ecrireConfigExemple, accueil } from '../src/config.js';
import { creerServeur } from '../src/web/serveur.js';

const [cmd = 'aide', ...args] = process.argv.slice(2);
const json = args.includes('--json');
const afficher = (o) => console.log(json ? JSON.stringify(o, null, 2) : o);

const AIDE = `holarch — socle autour des agents d'IA (étape 1 : voir)

  holarch init         écrit une configuration d'exemple dans ${accueil()}/config.yaml
  holarch inventaire   recense ce qui est en place (catalogue)
  holarch importer     importe le journal (transcriptions Claude Code…)
  holarch etat         résumé : catalogue, sessions, tokens
  holarch voir         rafraîchit puis sert l'interface web (http://127.0.0.1:4280, --port N pour un autre port)

Options : --json (sortie brute). Répertoire de travail : HOLARCH_HOME (défaut ~/.holarch).`;

const socle = () => new Socle(chargerConfig());

switch (cmd) {
  case 'init': console.log(ecrireConfigExemple() ? `configuration écrite : ${accueil()}/config.yaml` : 'configuration déjà présente'); break;
  case 'inventaire': { const s = socle(); const r = s.inventaire(); s.indexer(); afficher(json ? r : `${r.fiches} fiches (${r.apparues.length} apparues, ${r.disparues.length} disparues, ${r.refusees.length} refusées)${r.erreurs.length ? `\nerreurs : ${r.erreurs.join(' ; ')}` : ''}`); break; }
  case 'importer': { const s = socle(); const r = s.importer(); s.indexer(); afficher(json ? r : Object.entries(r).map(([k, v]) => `${k} : ${v.fichiers_lus} fichier(s) lu(s), ${v.ajoutes} événement(s) ajouté(s), ${v.ignores} déjà connu(s), ${v.refuses} refusé(s), ${v.en_cours_ignores} session(s) en cours laissée(s) pour plus tard`).join('\n')); break; }
  case 'indexer': afficher(socle().indexer()); break;
  case 'etat': { const s = socle(); s.indexer(); const e = s.etat(); if (json) { afficher(e); break; }
    console.log(`site ${e.site} · ${e.evenements} événements · sessions ${e.sessions.total} (dont ${e.sessions.sept_jours} sur 7 jours)`);
    console.log(`catalogue : ${e.fiches_par_type.map((f) => `${f.kind} ${f.n}`).join(' · ')}`);
    for (const t of e.tokens) console.log(`${t.jours} j : sortie ${t.sortie ?? 0} tokens, cache lu ${t.cache_lu ?? 0}${t.usd != null ? `, ${t.usd.toFixed(2)} USD liste` : e.tarifs_configures ? '' : ' (coût inconnu : aucun tarif configuré)'}`);
    break; }
  case 'voir': {
    const s = socle(); const r = s.rafraichir();
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
