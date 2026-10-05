// Catalogue dérivé (décision synchronisation) : recalculé par inventaire, un instantané par site. Chaque fiche est
// validée ; une fiche invalide est écartée et signalée, jamais écrite.
import fs from 'node:fs';
import path from 'node:path';
import { valider } from '../contrats/valider.js';

export class Catalogue {
  constructor(donnees, site) {
    this.dossier = path.join(donnees, 'catalogue');
    this.site = site;
  }

  remplacer(fiches) {
    const valides = []; const refusees = [];
    const vus = new Set();
    for (const f of fiches) {
      const erreur = valider('fiche', f);
      if (erreur) { refusees.push({ fiche: f, erreur }); continue; }
      if (vus.has(f.id)) continue;
      vus.add(f.id); valides.push(f);
    }
    fs.mkdirSync(this.dossier, { recursive: true });
    const precedent = this.lire({ site: this.site });
    fs.writeFileSync(path.join(this.dossier, `${this.site}.json`), JSON.stringify({ site: this.site, at: new Date().toISOString(), fiches: valides }, null, 1));
    // Un élément qui change d'emplacement garde son identifiant : c'est un déplacement, pas une disparition suivie d'une
    // création. Un identifiant qui disparaît pendant qu'un autre apparaît au même emplacement, pour le même kind **et sous
    // le même nom**, est le même élément ré-identifié (migration d'un schéma d'identifiants). Les deux deviennent
    // `element.moved`. Le nom compte : plusieurs fiches partagent souvent un emplacement (les serveurs MCP d'un même
    // fichier de configuration), et en remplacer une par une autre n'est pas un déplacement (Q12).
    const avant = new Map(precedent.map((f) => [f.id, f]));
    const apres = new Map(valides.map((f) => [f.id, f]));
    const deplacees = [];
    for (const [id, f] of apres) {
      const p = avant.get(id);
      if (p && p.location && f.location && p.location !== f.location) deplacees.push({ id, de: { id, location: p.location }, vers: { id, location: f.location } });
    }
    let apparues = [...apres.keys()].filter((i) => !avant.has(i)); let disparues = [...avant.keys()].filter((i) => !apres.has(i));
    const cle = (f) => `${f.kind} ${f.location} ${f.name}`;
    const parEmplacement = new Map(disparues.filter((i) => avant.get(i).location).map((i) => [cle(avant.get(i)), i]));
    for (const id of apparues) {
      const f = apres.get(id); const ancien = f.location && parEmplacement.get(cle(f));
      if (!ancien) continue;
      deplacees.push({ id, de: { id: ancien, location: f.location }, vers: { id, location: f.location } });
      parEmplacement.delete(cle(f));
    }
    const reidentifies = new Set(deplacees.filter((d) => d.de.id !== d.id).flatMap((d) => [d.id, d.de.id]));
    apparues = apparues.filter((i) => !reidentifies.has(i)); disparues = disparues.filter((i) => !reidentifies.has(i));
    return { fiches: valides.length, refusees, apparues, disparues, deplacees };
  }

  lire({ site = null } = {}) {
    if (!fs.existsSync(this.dossier)) return [];
    const fichiers = fs.readdirSync(this.dossier).filter((f) => f.endsWith('.json') && (!site || f === `${site}.json`));
    return fichiers.flatMap((f) => JSON.parse(fs.readFileSync(path.join(this.dossier, f), 'utf8')).fiches);
  }
}
