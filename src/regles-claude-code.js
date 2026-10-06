// Adaptateur Claude Code de la règle effective (contrat règle, matérialisation ; décision arbre-des-regles) : un fichier
// par règle dans les portées que Claude Code lit déjà, `<compte>/rules/holarch/` pour ce qui vaut sur tout le site et
// `<projet>/.claude/rules/holarch/` pour ce qui est propre au projet. Un fichier écrit porte la MARQUE ; un fichier sans
// elle n'est jamais touché, `CLAUDE.md` non plus. S'écrivent les règles stables, non dérogées, de niveau `reminder`, ou
// `guided` limitées à des chemins (chargées à la demande) ; les autres sont dites non appliquées, avec la raison.
import fs from 'node:fs';
import path from 'node:path';
import { CLASSIFICATIONS } from './regles.js';

export const MARQUE = '<!-- Généré par HOLARCH (holarch regles appliquer) : ne pas modifier ici, changer la règle à sa source. -->';
const SOUS_DOSSIER = path.join('rules', 'holarch');
export const dossierCompte = (home) => path.join(home, SOUS_DOSSIER);
export const dossierProjet = (depot) => path.join(depot, '.claude', SOUS_DOSSIER);
const nomFichier = (id) => `${String(id).toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}.md`;

/** Portée Claude Code d'une règle effective : { portee, fichier } ou { non: raison }. */
export function destination(e, { classificationDepot = 'internal' } = {}) {
  const portee = e.origine === 'profil' || e.origine === 'contexte' ? 'compte' : 'projet';
  if (e.statut !== 'stable') return { portee, non: `${e.statut} : proposée, à approuver` };
  if (e.derogee) return { portee, non: 'dérogée' };
  const chemins = e.applique_a?.paths;
  if (e.niveau === 'blocking' || e.niveau === 'verified') return { portee, non: `niveau ${e.niveau} : hook, à venir` };
  if (e.niveau === 'guided' && !chemins) return { portee, non: 'guidée sans chemins : skill, à venir' };
  if (portee === 'projet' && CLASSIFICATIONS.indexOf(e.classification) > CLASSIFICATIONS.indexOf(classificationDepot)) {
    return { portee, non: `classification ${e.classification} plus fermée que le dépôt (${classificationDepot}) : portée locale, à venir` };
  }
  return { portee, fichier: nomFichier(e.id) };
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
    if (d.non) non.push({ regle: e.id, raison: d.non }); else fichiers.push({ fichier: d.fichier, contenu: contenu(e), regle: e.id });
  }
  return { fichiers, non, signaux };
}

const marque = (f) => { try { return fs.readFileSync(f, 'utf8').includes(MARQUE); } catch { return false; } };

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
