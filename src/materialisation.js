// Matérialisation de la règle effective (contrat règle §2 ; décisions arbre-des-regles et controles-de-regles) : ce qui
// s'écrit pour Claude Code et pour git, au compte et par projet. Une seule définition : `holarch regles appliquer`
// l'exécute (`ecrire: true`), l'audit la lit à blanc (`ecrire: false`) et en tire ses écarts.
import { fileURLToPath } from 'node:url';
import { planifier, appliquer, dossierCompte, dossierProjet, lecturesRefusees, avantCommit, appliquerPermissions } from './regles-claude-code.js';
import { crochetDe, poserCrochet } from './garde-git.js';

/** La ligne de commande que le crochet de git appelle. */
export const BIN = fileURLToPath(new URL('../bin/holarch.js', import.meta.url));

/**
 * Compte : pour chaque compte Claude Code du site, les fichiers de règles (`<compte>/rules/holarch/`) et les lectures
 * refusées (`<compte>/settings.json`). Un `settings.json` illisible n'est jamais réécrit : `permissions.erreur` le dit.
 */
export function materialiserCompte(regles, comptes, { ecrire = true } = {}) {
  const plan = planifier(regles, { portee: 'compte' });
  const lectures = regles.filter((e) => e.applicable).flatMap((e) => lecturesRefusees(e).map((entree) => ({ entree, regle: e })));
  return comptes.filter((c) => c.home).map((c) => {
    let permissions;
    try { permissions = appliquerPermissions(c.home, lectures.map((x) => x.entree), { ecrire }); } catch (e) { permissions = { erreur: e.message }; }
    return { compte: c.nom, home: c.home, plan, fichiers: appliquer(dossierCompte(c.home), plan, { ecrire }), lectures, permissions };
  });
}

/** Projet : les fichiers de règles (`.claude/rules/holarch/`) et le crochet de git, si une règle bloquante le demande. */
export function materialiserProjet(r, chemin, { accueil, holarch = BIN, ecrire = true } = {}) {
  const plan = planifier(r.regles, { portee: 'projet', classificationDepot: r.arbre?.classification });
  const demande = r.regles.find((e) => e.applicable && avantCommit(e)) || null;
  return { plan, fichiers: appliquer(dossierProjet(chemin), plan, { ecrire }),
    crochet: { demande, ...poserCrochet(chemin, demande ? crochetDe({ holarch, accueil }) : null, { ecrire }) } };
}
