// Matérialisation de la règle effective (contrat règle §2 ; décisions arbre-des-regles et controles-de-regles) : ce qui
// s'écrit pour Claude Code et pour git, au compte et par projet. Une seule définition : `holarch regles appliquer`
// l'exécute (`ecrire: true`), l'audit la lit à blanc (`ecrire: false`) et en tire ses écarts.
import { planifier, appliquer, dossierCompte, dossierProjet, lecturesRefusees, avantCommit, appliquerPermissions, reglagesVoulus, appliquerReglages } from './regles-claude-code.js';
import { crochetDe, poserCrochet } from './garde-git.js';
import { poserIdentite } from './identite-git.js';
import { identiteDeclaree } from './controles.js';
import { binaireService } from './service.js';

// La ligne de commande qu'appellent le crochet de git et ceux de Claude Code : la copie de service posée dans l'accueil
// de la configuration (`binaireService`), sinon le code qui s'exécute.

// Une règle effective incomplète (source de règles illisible) ne s'écrit pas : elle retirerait les fichiers, le crochet
// et les lectures refusées des règles qu'elle ne voit plus. De même pour un compte sans profil unique (aucun, ou
// plusieurs) : sa règle est indéterminée (choix de l'auteur, 2026-10-09). Ce qui est posé reste tel quel jusqu'à la
// correction.
function lisible(r) {
  if (r.illisibles?.length) throw new Error(`règles illisibles, rien n'est écrit : ${r.illisibles.join(' ; ')}`);
  if (r.indetermine) throw new Error(`règles du compte indéterminées, rien n'est écrit : ${r.signaux?.[0] || 'aucun profil ou plusieurs'}`);
}

/**
 * `holarch regles appliquer` : tout est lu et vérifié d'abord (références des projets, lisibilité du compte et de chaque
 * projet), puis le compte, puis les projets. Rien ne s'écrit si l'un d'eux est faux ou illisible : sans quoi le compte
 * serait déjà réécrit quand l'erreur d'un projet arrête la commande.
 */
export function appliquerRegles(s, refs, comptes) {
  const effectives = refs.map((ref) => { const r = s.regles({ projet: ref }); if (!r.chemin) throw new Error(`projet sans emplacement sur ce site : ${ref}`); return r; });
  const compte = s.regles().compte;
  const illisibles = [...new Set([compte, ...effectives].flatMap((r) => r.illisibles || []))];
  if (illisibles.length) throw new Error(`règles illisibles, rien n'est écrit : ${illisibles.join(' ; ')}`);
  lisible(compte);
  return { comptes: materialiserCompte(compte, comptes, { accueil: s.config.accueil }),
    projets: effectives.map((r) => ({ nom: r.nom, m: materialiserProjet(r, r.chemin, { accueil: s.config.accueil }) })) };
}

/**
 * Compte : pour chaque compte Claude Code du site, les fichiers de règles (`<compte>/rules/holarch/`), les lectures
 * refusées et les réglages de Claude Code (section `claude_code` de la configuration du compte), dans
 * `<compte>/settings.json`. Un `settings.json` illisible n'est jamais réécrit : `permissions.erreur` et `reglages.erreur`
 * le disent. `compte` : la règle effective du compte (module regles : `regles`, `config`).
 */
/**
 * La veille retardée est voulue au compte : une règle applicable désigne son contrôle (crochets et gardien la suivent) ;
 * null si les règles du compte sont illisibles, ou sans profil unique (rien ne se retire à l'aveugle).
 */
export const veilleVoulue = (compte) => (compte.illisibles?.length || compte.indetermine ? null : (compte.regles || []).some((e) => e.applicable && (e.controles || []).includes('veille-retardee')));

export function materialiserCompte(compte, comptes, { accueil, holarch = binaireService(accueil), ecrire = true } = {}) {
  if (ecrire) lisible(compte);
  const regles = compte.regles;
  const plan = planifier(regles, { portee: 'compte' });
  const lectures = regles.filter((e) => e.applicable).flatMap((e) => lecturesRefusees(e).map((entree) => ({ entree, regle: e })));
  // Veille retardée : les crochets qui notent l'état des sessions viennent avec la règle qui désigne son contrôle.
  const veille = Boolean(veilleVoulue(compte));
  const voulus = reglagesVoulus(compte.config || {}, { holarch, accueil, veille });
  return comptes.filter((c) => c.home).map((c) => {
    let permissions; let reglages;
    try { permissions = appliquerPermissions(c.home, lectures.map((x) => x.entree), { ecrire }); } catch (e) { permissions = { erreur: e.message }; }
    try { reglages = appliquerReglages(c.home, voulus, { ecrire }); } catch (e) { reglages = { erreur: e.message }; }
    return { compte: c.nom, home: c.home, plan, fichiers: appliquer(dossierCompte(c.home), plan, { ecrire }), lectures, permissions, reglages };
  });
}

/**
 * Projet : les fichiers de règles (`.claude/rules/holarch/`), le crochet de git si une règle bloquante le demande, et
 * l'identité de commit que déclare sa configuration, s'il est déclaré par un contexte (décision identite-par-contexte).
 */
export function materialiserProjet(r, chemin, { accueil, holarch = binaireService(accueil), ecrire = true } = {}) {
  if (ecrire) lisible(r);
  const plan = planifier(r.regles, { portee: 'projet', classificationDepot: r.arbre?.classification });
  const demande = r.regles.find((e) => e.applicable && avantCommit(e)) || null;
  return { plan, fichiers: appliquer(dossierProjet(chemin), plan, { ecrire }),
    crochet: { demande, ...poserCrochet(chemin, demande ? crochetDe({ holarch, accueil }) : null, { ecrire }) },
    identite: poserIdentite(chemin, r.declare ? identiteDeclaree(r.config) : null, { ecrire }) };
}
