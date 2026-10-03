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
    const avant = new Set(precedent.map((f) => f.id));
    const apres = new Set(valides.map((f) => f.id));
    return { fiches: valides.length, refusees, apparues: [...apres].filter((i) => !avant.has(i)), disparues: [...avant].filter((i) => !apres.has(i)) };
  }

  lire({ site = null } = {}) {
    if (!fs.existsSync(this.dossier)) return [];
    const fichiers = fs.readdirSync(this.dossier).filter((f) => f.endsWith('.json') && (!site || f === `${site}.json`));
    return fichiers.flatMap((f) => JSON.parse(fs.readFileSync(path.join(this.dossier, f), 'utf8')).fiches);
  }
}
