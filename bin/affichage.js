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
