// Journal en ajout seul (contrat événement) : un fichier JSON Lines par site et par mois. Un événement déjà présent
// (même id) n'est jamais réécrit ; un événement invalide est refusé.
import fs from 'node:fs';
import path from 'node:path';
import { valider } from '../contrats/valider.js';

export class Journal {
  constructor(donnees, site) {
    this.racine = path.join(donnees, 'journal');
    this.site = site;
    this.ids = null;
    this.illisibles = 0; // lignes illisibles vues par la dernière lecture
  }

  #fichiers(site = null) {
    if (!fs.existsSync(this.racine)) return [];
    const sites = site ? [site] : fs.readdirSync(this.racine);
    return sites.flatMap((s) => {
      const d = path.join(this.racine, s);
      return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.jsonl')).sort().map((f) => path.join(d, f)) : [];
    });
  }

  // Une ligne illisible (écriture interrompue, ou en cours dans un autre processus) est sautée, pas fatale : elle
  // arrêterait l'inventaire, l'import et la reprise. Elle se compte et se dit sur la sortie d'erreur.
  *lire({ site = null } = {}) {
    this.illisibles = 0;
    for (const f of this.#fichiers(site)) {
      for (const ligne of fs.readFileSync(f, 'utf8').split('\n')) {
        if (!ligne.trim()) continue;
        let e;
        try { e = JSON.parse(ligne); } catch { this.illisibles++; continue; }
        yield e;
      }
    }
    if (this.illisibles) process.stderr.write(`holarch : ${this.illisibles} ligne(s) illisible(s) dans le journal, sautée(s)\n`);
  }

  #connus() {
    if (!this.ids) { this.ids = new Set(); for (const e of this.lire({ site: this.site })) this.ids.add(e.id); }
    return this.ids;
  }

  /** Ajoute les événements nouveaux ; renvoie { ajoutes, ignores, refuses: [{evenement, erreur}] }. */
  ajouter(evenements) {
    const connus = this.#connus();
    const r = { ajoutes: 0, ignores: 0, refuses: [] };
    const parMois = new Map();
    for (const e of evenements) {
      const ev = { site: this.site, ...e };
      const erreur = valider('evenement', ev);
      if (erreur) { r.refuses.push({ evenement: ev, erreur }); continue; }
      if (connus.has(ev.id)) { r.ignores++; continue; }
      connus.add(ev.id);
      const mois = ev.at.slice(0, 7);
      if (!parMois.has(mois)) parMois.set(mois, []);
      parMois.get(mois).push(JSON.stringify(ev));
      r.ajoutes++;
    }
    const d = path.join(this.racine, this.site);
    if (parMois.size) fs.mkdirSync(d, { recursive: true });
    for (const [mois, lignes] of parMois) {
      // Après une écriture interrompue, le fichier ne finit pas par une fin de ligne : sans elle, le premier événement
      // ajouté se collerait à la ligne coupée et serait perdu avec elle.
      const f = path.join(d, `${mois}.jsonl`);
      fs.appendFileSync(f, (finSansRetour(f) ? '\n' : '') + lignes.join('\n') + '\n');
    }
    return r;
  }
}

function finSansRetour(f) {
  let fd;
  try {
    fd = fs.openSync(f, 'r'); const { size } = fs.fstatSync(fd);
    if (!size) return false;
    const b = Buffer.alloc(1); fs.readSync(fd, b, 0, 1, size - 1);
    return b[0] !== 0x0a;
  } catch { return false; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
