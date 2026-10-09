// Mise en forme texte de la ligne de commande (étape 3, tranche 6) : ce que `holarch` affiche hors `--json`.

export const inventaire = (r) => `${r.fiches} fiches (${r.apparues.length} apparues, ${r.disparues.length} disparues, ${r.deplacees.length} déplacées, ${r.refusees.length} refusées)${r.erreurs.length ? `\nerreurs : ${r.erreurs.join(' ; ')}` : ''}${r.absentes.length ? `\nnon vues sur cette machine : ${r.absentes.join(' ; ')}` : ''}${r.comptes_non_lus?.length ? `\nATTENTION comptes Claude Code non lus : ${r.comptes_non_lus.join(', ')}` : ''}\naudit : ${r.audit.ouverts} écart(s) ouvert(s) ; ${r.audit.apparus} apparu(s), ${r.audit.resolus} résolu(s)`;

export const importer = (r) => Object.entries(r).map(([k, v]) => `${k} : ${v.fichiers_lus} fichier(s) lu(s), ${v.ajoutes} événement(s) ajouté(s), ${v.ignores} déjà connu(s), ${v.refuses} refusé(s)${v.en_cours_ignores ? `, ${v.en_cours_ignores} session(s) en cours laissée(s) pour plus tard` : ''}${v.absent !== undefined ? ` (fichier absent : ${v.absent ?? 'non configuré'})` : ''}`).join('\n');

const ligne = (e) => `  [${e.origine}] ${e.id}${e.applicable ? '' : e.derogee ? ' (dérogée)' : ` (${e.statut})`} → ${e.claude_code.non ? `non écrite : ${e.claude_code.non}` : e.claude_code.par ? `${e.niveau} : ${e.claude_code.par.join(', ')}` : `${e.claude_code.portee} : ${e.claude_code.fichier}`}`;

export const bilan = (nom, r) => `${nom} (${r.dossier}) : ${r.crees.length} créé(s), ${r.modifies.length} modifié(s), ${r.retires.length} retiré(s), ${r.inchanges.length} inchangé(s)${r.ignores.length ? ` ; non marqués, laissés : ${r.ignores.join(', ')}` : ''}`;

export const reglesProjet = (r) => [`${r.nom} — types : ${r.arbre?.types.join(', ') || 'aucun'} ; ${r.regles.length} règle(s), ${r.regles.filter((e) => e.applicable).length} appliquée(s) ; rappels : ${r.rappels} caractères à chaque tour${r.rappels_proposes ? ` (+${r.rappels_proposes} si les proposées sont approuvées)` : ''}`,
          ...r.regles.map(ligne), ...r.signaux.map((x) => `ATTENTION ${x}`)].join('\n');

export const reglesCompte = (r) => [`compte — ${r.compte.regles.length} règle(s), ${r.compte.regles.filter((e) => e.applicable).length} appliquée(s) ; rappels : ${r.compte.rappels} caractères à chaque tour${r.compte.rappels_proposes ? ` (+${r.compte.rappels_proposes} si les proposées sont approuvées)` : ''}`,
          ...r.compte.regles.map(ligne), ...r.compte.signaux.map((x) => `ATTENTION ${x}`), '',
          ...(r.projets.length ? r.projets.map((p) => `${p.nom} : ${p.declare ? 'déclaré' : 'non déclaré par un contexte'}, types ${p.types.join(', ') || 'aucun'}, ${p.appliquees} appliquée(s), ${p.proposees} proposée(s)${p.signaux ? `, ${p.signaux} signal(aux)` : ''}`) : ['aucun projet n’a de règles']) ].join('\n');

export const audit = (a) => [...a.cibles.map((c) => [`${c.nom} : ${c.ecarts.length ? `${c.ecarts.length} écart(s)` : 'conforme'}${c.controles.length ? ` ; contrôles : ${c.controles.map((x) => x.etat === 'fait' ? x.id : `${x.id} (non disponible : ${x.raison})`).join(', ')}` : ''}`,
        ...c.ecarts.map((e) => `  [${e.regle_id}] ${e.controle} : ${e.fichier || ''}${e.ligne ? `:${e.ligne}` : ''}${e.n > 1 ? ` (${e.n})` : ''} — ${e.message}`)].join('\n')),
        a.cibles.length ? '' : 'aucun projet n’a de règles', `journal : ${a.journal.apparus} apparu(s), ${a.journal.resolus} résolu(s)`].filter((x) => x !== '').join('\n');

/** Ce que `holarch regles appliquer` a écrit (module materialisation). */
export function appliquer({ comptes, projets }) {
  const sortie = [];
  for (const m of comptes) {
    sortie.push(bilan(`compte${m.compte ? ` ${m.compte}` : ''}`, m.fichiers));
    const p = m.permissions;
    if (p.erreur) sortie.push(`  ATTENTION lectures refusées non posées : ${p.erreur}`);
    else if (p.ajoutees.length || p.retirees.length || p.inchangees.length) sortie.push(`  lectures refusées (${p.fichier}) : ${p.ajoutees.length} ajoutée(s), ${p.retirees.length} retirée(s), ${p.inchangees.length} inchangée(s)`);
    const g = m.reglages;
    if (g.erreur) sortie.push(`  ATTENTION réglages de Claude Code non posés : ${g.erreur}`);
    else if (Object.values(g.cles).some((x) => x.length) || Object.values(g.crochets).some((x) => x.length)) {
      sortie.push(`  réglages de Claude Code : ${g.cles.posees.length} posé(s), ${g.cles.retirees.length} retiré(s), ${g.cles.inchangees.length} inchangé(s)${g.cles.ignorees.length ? `, laissés (posés à la main) : ${g.cles.ignorees.join(', ')}` : ''} ; crochets : ${g.crochets.poses.length} posé(s), ${g.crochets.retires.length} retiré(s), ${g.crochets.inchanges.length} inchangé(s)`);
    }
  }
  for (const { nom, m } of projets) {
    sortie.push(bilan(nom, m.fichiers), ...m.plan.signaux.map((x) => `  ATTENTION ${x}`));
    const c = m.crochet;
    if (c.etat === 'erreur') sortie.push(`  ATTENTION crochet de git non posé : ${c.fichier} (${c.raison}) ; la garde ne s'exécute pas dans ce clone`);
    else if (c.etat === 'ignore' && c.demande) sortie.push(`  ATTENTION un crochet pre-commit non marqué existe (${c.fichier}) : la garde n'est pas posée`);
    else if (c.etat !== 'absent' && c.etat !== 'ignore') sortie.push(`  crochet de git : ${c.etat}`);
    const i = m.identite.etat;
    if (i === 'ignore') sortie.push('  ATTENTION identité de commit posée à la main dans ce dépôt, différente de la déclarée : laissée (git config --local --unset user.name, puis user.email, pour la retirer)');
    else if (['pose', 'modifie', 'retire'].includes(i)) sortie.push(`  identité de commit : ${i === 'pose' ? 'posée' : i === 'modifie' ? 'mise à jour' : 'retirée'} en réglage local`);
  }
  return sortie.join('\n');
}

/** Ce que `holarch projet creer` a fait, étape par étape, puis les gestes réservés à l'auteur. */
export function creation(r) {
  const signe = { faite: '✓', deja: '·', 'a-faire': '→', desactivee: '-', geste: '!', echec: '✗', ecarts: '✗' };
  const libelle = { faite: 'fait', deja: 'déjà là', 'a-faire': 'à faire', desactivee: 'désactivé', geste: 'geste réservé', echec: 'échec', ecarts: 'écarts' };
  const sortie = [`${r.a_blanc ? 'à blanc, rien n’est écrit : ' : ''}projet ${r.nom} (${r.dossier}) ; contexte ${r.contexte}${r.types.length ? ` ; types ${r.types.join(', ')}` : ''}${r.projet ? ` ; ${r.projet}` : ''}`];
  for (const e of r.etapes) sortie.push(`  ${signe[e.etat] || '?'} ${e.etape.padEnd(12)} ${libelle[e.etat] || e.etat} : ${e.detail}`);
  const gestes = r.etapes.filter((e) => e.geste);
  if (gestes.length) {
    sortie.push('', 'gestes réservés (la commande rejouée les reprend) :');
    for (const e of gestes) sortie.push(`  - ${e.etape} : ${e.geste.quoi}${e.geste.commande ? `\n      ${e.geste.commande}` : ''}${e.geste.lien ? `\n      ${e.geste.lien}` : ''}`);
  }
  return sortie.join('\n');
}

export const service = (e) => (e.copie
  ? `copie en service : ${e.copie.commit} (posée le ${new Date(e.copie.pose_le).toLocaleString('sv-SE').slice(0, 16)}, source ${e.copie.source})${e.retard ? ` ; ${e.retard} commit(s) de retard sur HEAD (holarch service poser)` : e.retard === 0 ? ' ; à jour' : ''}\ncopies gardées : ${e.copies.join(', ')}`
  : `aucune copie de service : les points d'entrée lancent ${e.binaire} (holarch service poser)`)
  + `\nroutines : ${e.routines.map((r) => `${r.unite} ${r.etat}`).join(' · ')}${e.routines.some((r) => r.etat === 'coupée') ? ' (une routine coupée reste coupée : systemctl --user enable --now <unité> pour la rallumer)' : ''}`;

export const posee = (r) => [`copie en service : ${r.commit}${r.nouvelle ? ' (nouvelle : tests verts, export, npm ci)' : ' (déjà présente : lien basculé)'}${r.precedent ? ` ; précédente gardée : ${r.precedent}` : ''}${r.supprimees.length ? ` ; supprimée(s) : ${r.supprimees.join(', ')}` : ''}`,
  ...r.points.map((p) => `  ${p.point} : ${p.etat}${p.message ? ` — ${p.message}` : ''}`),
  'garde avant commit et crochets de Claude Code : holarch regles appliquer (l\'audit signale ceux restés sur la copie de travail)'].join('\n');

/** Ce que `holarch recolte` a trouvé (module recolte). */
export function recolte(r) {
  const c = r.candidats;
  const l = [`récolte ${r.periode.depuis?.slice(0, 10) ?? '…'} → ${r.periode.jusqua?.slice(0, 10) ?? 'maintenant'} : ${c.messages} message(s) de l'auteur et ${c.memoires} mémoire(s) de retour, ${c.sessions} session(s), ${c.projets} projet(s), ${c.caracteres} caractères ; ${r.regles} règle(s) connue(s)`];
  if (r.indisponible) return [...l, `rien n'est envoyé : ${r.indisponible}`].join('\n');
  l.push(`secrets possibles retirés avant l'envoi : ${r.secrets_retires}`);
  if (r.a_blanc) return [...l, 'à blanc : rien n’est envoyé'].join('\n');
  l.push(`${r.groupes} groupe(s) rendu(s) par ${r.modele}${r.cout_usd != null ? ` (${r.cout_usd.toFixed(3)} $)` : ''}, ${r.redites.length} redite(s) :`);
  for (const g of r.redites) l.push(`  ${g.couverte_par ? `[couverte : ${g.couverte_par}]` : g.contredit?.length ? `[contredit ${g.contredit.join(', ')}]` : `[nouvelle${g.id ? ` : ${g.id}` : ''}]`} ${g.consigne}\n      ${g.sessions} session(s), ${g.projets.length ? `projets ${g.projets.join(', ')}` : 'aucun projet'}${g.hors_projet ? `, ${g.hors_projet} hors projet` : ''}${g.memoires ? `, ${g.memoires} mémoire(s)` : ''} ; ${g.premiere?.slice(0, 10)} → ${g.derniere?.slice(0, 10)}`);
  const p = r.propositions;
  if (p) {
    l.push(`règles proposées (brouillon, à approuver) : ${p.ecrites.length}${p.deja.length ? `, ${p.deja.length} déjà présente(s)` : ''}`);
    for (const e of p.ecrites) l.push(`  ${e.id} → ${e.fichier}`);
    for (const e of p.sans_noeud) l.push(`  ${e.id} : non écrite, ${e.raison}`);
    if (p.a_trancher.length) l.push(`à trancher par l'auteur (contradictions) : ${p.a_trancher.length}`, ...p.a_trancher.map((g) => `  ${g.consigne} (contredit ${g.contredit.join(', ') || '?'})`));
  }
  return l.join('\n');
}

/** État de la veille retardée : le gardien, le mécanisme, les sessions distantes notées (module veille). */
export function veille(e) {
  const heure = (iso) => new Date(iso).toLocaleString('sv-SE').slice(11, 16);
  const l = [`gardien de veille : ${e.gardien} (${e.unite}) ; mécanisme : ${e.mecanisme ? 'demande d’éveil de Windows' : 'aucun sur ce site'}`];
  if (!e.sessions.length) l.push('aucune session distante notée');
  for (const s of e.sessions) l.push(`  ${s.etat.padEnd(9)} ${s.dossier ? s.dossier.split('/').pop() : '?'}  ${s.session.slice(0, 8)}  depuis ${heure(s.depuis)}${s.etat === 'attend' ? (s.retient ? ` (retient encore ${s.reste_min} min)` : ' (ne retient plus)') : ''}`);
  if (e.finies.length) l.push(`${e.finies.length} session(s) finie(s) sans fin dite (processus disparu)`);
  // Ce que demandent les sessions, et ce que le gardien dit tenir (écrit à chacun de ses passages).
  const vu = e.tenu?.maj ? ` (passage du gardien à ${heure(e.tenu.maj)})` : ' (aucun passage du gardien)';
  l.push(e.besoin ? `une session retient la veille ; demande d’éveil ${e.tenu?.tenue ? 'tenue' : 'non tenue'}${vu}` : `rien ne retient la veille${e.tenu?.tenue ? ` ; demande d’éveil encore tenue${vu}` : ''}`);
  return l.join('\n');
}
