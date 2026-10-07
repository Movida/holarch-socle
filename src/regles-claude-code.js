// Adaptateur Claude Code de la règle effective (contrat règle, matérialisation ; décision arbre-des-regles) : un fichier
// par règle dans les portées que Claude Code lit déjà, `<compte>/rules/holarch/` pour ce qui vaut sur tout le site et
// `<projet>/.claude/rules/holarch/` pour ce qui est propre au projet. Un fichier écrit porte la MARQUE ; un fichier sans
// elle n'est jamais touché, `CLAUDE.md` non plus. S'écrivent les règles stables, non dérogées, de niveau `reminder`, ou
// `guided` limitées à des chemins (chargées à la demande). Une règle `blocking` ou `verified` ne s'écrit pas en consigne :
// ses contrôles passent par le crochet de git et l'audit, ses lectures refusées par les permissions du compte (décision
// controles-de-regles). Les autres sont dites non appliquées, avec la raison.
import fs from 'node:fs';
import path from 'node:path';
import { CLASSIFICATIONS } from './regles.js';
import { CONTROLES } from './controles.js';
import { lireJson, ecrireJson, fichierMarque } from './commun.js';

export const MARQUE = '<!-- Généré par HOLARCH (holarch regles appliquer) : ne pas modifier ici, changer la règle à sa source. -->';
const SOUS_DOSSIER = path.join('rules', 'holarch');
export const dossierCompte = (home) => path.join(home, SOUS_DOSSIER);
export const dossierProjet = (depot) => path.join(depot, '.claude', SOUS_DOSSIER);
const nomFichier = (id) => `${String(id).toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}.md`;

/** Portée Claude Code d'une règle effective : { portee, fichier } ou { non: raison }. */
export function destination(e, { classificationDepot = 'internal' } = {}) {
  const portee = e.origine === 'profil' || e.origine === 'contexte' ? 'compte' : 'projet';
  if (e.statut !== 'stable') return { portee, non: e.statut === 'draft' ? 'à approuver' : `statut ${e.statut}` };
  if (e.derogee) return { portee, non: 'dérogée' };
  const chemins = e.applique_a?.paths;
  if (e.niveau === 'blocking' || e.niveau === 'verified') {
    // Une règle contrôlée ne s'écrit pas en consigne : le crochet de git, les permissions et l'audit la tiennent.
    const lectures = lecturesRefusees(e);
    if (!e.controles?.length && !lectures.length) return { portee, non: `niveau ${e.niveau} sans contrôle ni permission` };
    if (lectures.length && portee === 'projet') return { portee, non: 'permissions de projet : à venir' };
    const par = [];
    if (e.niveau === 'blocking' && avantCommit(e)) par.push('crochet git');
    if (lectures.length) par.push('permissions');
    if (e.controles?.length) par.push('audit');
    return { portee, par };
  }
  if (e.niveau === 'guided' && !chemins) return { portee, non: 'guidée sans chemins : skill, à venir' };
  if (portee === 'projet' && CLASSIFICATIONS.indexOf(e.classification) > CLASSIFICATIONS.indexOf(classificationDepot)) {
    return { portee, non: `classification ${e.classification} plus fermée que le dépôt (${classificationDepot}) : portée locale, à venir` };
  }
  return { portee, fichier: nomFichier(e.id) };
}

/** Entrées `Read(...)` qu'une règle bloquante demande (`match: { action: read, paths }`). */
export function lecturesRefusees(e) {
  if (e.niveau !== 'blocking' || e.match?.action !== 'read') return [];
  return [].concat(e.match.paths || []).map((p) => `Read(${p})`);
}

/** Une règle bloquante dont un contrôle s'exécute avant un commit : elle demande le crochet de git. */
export const avantCommit = (e) => e.niveau === 'blocking' && (e.controles || []).some((c) => CONTROLES[c]?.moments.includes('avant-commit'));

/**
 * Permissions de lecture refusées à la portée du compte (`<home>/settings.json`, `permissions.deny`) : ajoute les
 * entrées voulues, retire celles que HOLARCH avait posées et qui ne le sont plus (manifeste à côté des règles générées) ;
 * une entrée posée par quelqu'un d'autre n'est jamais retirée. `ecrire: false` : dit seulement ce qui changerait.
 */
export function appliquerPermissions(home, entrees, { ecrire = true } = {}) {
  const settings = path.join(home, 'settings.json'); const manifeste = path.join(dossierCompte(home), 'permissions.json');
  const c = lireJson(settings, {}, { strict: true }); const nos = new Set(lireJson(manifeste, { deny: [] }, { strict: true }).deny || []);
  const deny = c.permissions?.deny || []; const voulues = new Set(entrees);
  const ajoutees = entrees.filter((x) => !deny.includes(x));
  const retirees = [...nos].filter((x) => !voulues.has(x) && deny.includes(x));
  const r = { fichier: settings, ajoutees, retirees, inchangees: entrees.filter((x) => deny.includes(x)) };
  if (!ecrire) return r;
  if (ajoutees.length || retirees.length) {
    c.permissions = { ...(c.permissions || {}), deny: [...deny.filter((x) => !retirees.includes(x)), ...ajoutees] };
    ecrireJson(settings, c);
  }
  const notees = entrees.filter((x) => nos.has(x) || ajoutees.includes(x));
  if (notees.length || fs.existsSync(manifeste)) ecrireJson(manifeste, { deny: notees });
  return r;
}

/** Texte du fichier d'une règle. */
export function contenu(e) {
  const chemins = e.applique_a?.paths ? [].concat(e.applique_a.paths) : null;
  const tete = chemins ? `---\npaths:\n${chemins.map((c) => `  - ${JSON.stringify(String(c))}`).join('\n')}\n---\n` : '';
  const prevaut = (e.recouvre || []).some((r) => r.origine === 'profil' || r.origine === 'contexte') ? '\n\nDans ce projet, cette règle prévaut sur celle du même nom posée au niveau du compte.' : '';
  return `${tete}${MARQUE}\n<!-- source : ${e.provenance.arbre}:${e.provenance.noeud} (${e.origine}) -->\n${e.enonce}${e.pourquoi ? `\n\nPourquoi : ${e.pourquoi}` : ''}${prevaut}\n`;
}

/**
 * Ce qu'une portée recevrait : { fichiers: [{ fichier, contenu, regle }], non: [{ regle, raison }], signaux }.
 * `regles` : règles effectives (module regles) ; seules celles de la portée demandée sont retenues.
 */
export function planifier(regles, { portee, classificationDepot } = {}) {
  const fichiers = []; const non = []; const signaux = [];
  for (const e of regles) {
    const d = destination(e, { classificationDepot });
    if (d.portee !== portee) {
      // Claude Code additionne les portées : une règle du compte reste chargée dans le projet qui y déroge.
      if (portee === 'projet' && e.derogee) signaux.push(`dérogation à ${e.id} sans effet dans Claude Code : la règle reste chargée au niveau du compte (portée locale, à venir)`);
      continue;
    }
    if (d.non) non.push({ regle: e.id, raison: d.non }); else if (d.fichier) fichiers.push({ fichier: d.fichier, contenu: contenu(e), regle: e.id });
  }
  return { fichiers, non, signaux };
}

const marque = (f) => fichierMarque(f, MARQUE);

/**
 * Écrit un plan dans un dossier de règles : crée ou met à jour les fichiers prévus, retire les fichiers marqués que le
 * plan ne prévoit plus ; un fichier non marqué n'est jamais touché. `ecrire: false` : dit seulement ce qui changerait.
 */
export function appliquer(dossier, plan, { ecrire = true } = {}) {
  const r = { dossier, crees: [], modifies: [], retires: [], inchanges: [], ignores: [] };
  const prevus = new Set(plan.fichiers.map((x) => x.fichier));
  for (const { fichier, contenu: c } of plan.fichiers) {
    const f = path.join(dossier, fichier);
    if (!fs.existsSync(f)) { r.crees.push(fichier); if (ecrire) { fs.mkdirSync(dossier, { recursive: true }); fs.writeFileSync(f, c); } continue; }
    if (!marque(f)) { r.ignores.push(fichier); continue; }
    if (fs.readFileSync(f, 'utf8') === c) { r.inchanges.push(fichier); continue; }
    r.modifies.push(fichier); if (ecrire) fs.writeFileSync(f, c);
  }
  let presents = []; try { presents = fs.readdirSync(dossier).filter((x) => x.endsWith('.md')); } catch { /* dossier absent */ }
  for (const x of presents) {
    if (prevus.has(x) || !marque(path.join(dossier, x))) continue;
    r.retires.push(x); if (ecrire) fs.unlinkSync(path.join(dossier, x));
  }
  return r;
}
