// Matérialisation de la règle effective (contrat règle §2 ; décisions arbre-des-regles et controles-de-regles) : ce qui
// s'écrit pour Claude Code et pour git, au compte et par projet. Une seule définition : `holarch regles appliquer`
// l'exécute (`ecrire: true`), l'audit la lit à blanc (`ecrire: false`) et en tire ses écarts.
import { planifier, appliquer, dossierCompte, dossierProjet, lecturesRefusees, avantCommit, appliquerPermissions, reglagesVoulus, appliquerReglages } from './regles-claude-code.js';
import { crochetDe, poserCrochet } from './garde-git.js';
import { poserIdentite } from './identite-git.js';
import { identiteDeclaree } from './controles.js';
import { binaireService } from './service.js';
import { accueil } from './config.js';

/** La ligne de commande qu'appellent le crochet de git et ceux de Claude Code : la copie de service si elle est posée. */
export const BIN = binaireService(accueil());

/**
 * Compte : pour chaque compte Claude Code du site, les fichiers de règles (`<compte>/rules/holarch/`), les lectures
 * refusées et les réglages de Claude Code (section `claude_code` de la configuration du compte), dans
 * `<compte>/settings.json`. Un `settings.json` illisible n'est jamais réécrit : `permissions.erreur` et `reglages.erreur`
 * le disent. `compte` : la règle effective du compte (module regles : `regles`, `config`).
 */
export function materialiserCompte(compte, comptes, { accueil, holarch = BIN, ecrire = true } = {}) {
  const regles = compte.regles;
  const plan = planifier(regles, { portee: 'compte' });
  const lectures = regles.filter((e) => e.applicable).flatMap((e) => lecturesRefusees(e).map((entree) => ({ entree, regle: e })));
  const voulus = reglagesVoulus(compte.config || {}, { holarch, accueil });
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
export function materialiserProjet(r, chemin, { accueil, holarch = BIN, ecrire = true } = {}) {
  const plan = planifier(r.regles, { portee: 'projet', classificationDepot: r.arbre?.classification });
  const demande = r.regles.find((e) => e.applicable && avantCommit(e)) || null;
  return { plan, fichiers: appliquer(dossierProjet(chemin), plan, { ecrire }),
    crochet: { demande, ...poserCrochet(chemin, demande ? crochetDe({ holarch, accueil }) : null, { ecrire }) },
    identite: poserIdentite(chemin, r.declare ? identiteDeclaree(r.config) : null, { ecrire }) };
}
