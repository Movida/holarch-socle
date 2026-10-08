// Index SQLite, jetable : reconstruit depuis le journal et le catalogue, pour que l'interface interroge vite. Ce n'est
// jamais une source de vérité (décision synchronisation).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { prix } from '../tarifs.js';

export class Index {
  constructor(donnees) {
    fs.mkdirSync(donnees, { recursive: true });
    this.db = new DatabaseSync(path.join(donnees, 'index.sqlite'));
    // Plusieurs processus ouvrent le même index (un serveur MCP par session d'un hub) : ils attendent le verrou au lieu d'échouer.
    this.db.exec('PRAGMA busy_timeout = 20000');
  }

  // Le coût d'un événement est celui qu'il porte (`usd_list`) ou, à défaut, celui que donne la grille de tarifs.
  reconstruire({ evenements, fiches, tarifs }) {
    const db = this.db;
    // Une seule transaction, prise d'emblée : un lecteur ne voit jamais l'index vide ou à moitié refait.
    db.exec('BEGIN IMMEDIATE');
    // En cas d'échec, la transaction s'annule : laissée ouverte, elle garderait le verrou d'écriture tant que vit le
    // processus (l'interface), et l'import, le serveur MCP, la reprise et la garde échoueraient tous.
    try {
      db.exec(`DROP TABLE IF EXISTS evenements; DROP TABLE IF EXISTS fiches;
        CREATE TABLE evenements (id TEXT PRIMARY KEY, at TEXT, kind TEXT, actor TEXT, site TEXT, context TEXT, node TEXT,
          subject TEXT, correlation TEXT, data TEXT, model TEXT, usd REAL, tok_in INTEGER, tok_cache_write INTEGER,
          tok_cache_read INTEGER, tok_out INTEGER, tok_cache_write_1h INTEGER);
        CREATE TABLE fiches (id TEXT PRIMARY KEY, kind TEXT, name TEXT, description TEXT, node TEXT, context TEXT,
          status TEXT, site TEXT, location TEXT, json TEXT);
        CREATE INDEX ev_kind ON evenements(kind, at); CREATE INDEX ev_corr ON evenements(correlation);`);
      const n = this.inserer(evenements, tarifs);
      const iff = db.prepare('INSERT OR REPLACE INTO fiches VALUES (?,?,?,?,?,?,?,?,?,?)');
      for (const f of fiches) iff.run(f.id, f.kind, f.name, f.description ?? null, f.node ?? null, f.context ?? null, f.status, f.site ?? null, f.location ?? null, JSON.stringify(f));
      db.exec('COMMIT');
      return { evenements: n, fiches: fiches.length };
    } catch (e) {
      // SQLite a pu annuler lui-même (disque plein, erreur d'entrée-sortie) : l'échec du ROLLBACK ne laisse alors rien
      // passer, et l'erreur d'origine reste celle qui se dit.
      try { db.exec('ROLLBACK'); } catch { /* aucune transaction active */ }
      throw e;
    }
  }

  // Ajoute des événements à l'index sans le reconstruire (ceux que le serveur écrit lui-même, comme ui.viewed).
  inserer(evenements, tarifs) {
    const ie = this.db.prepare('INSERT OR IGNORE INTO evenements VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    let n = 0;
    for (const e of evenements) {
      const t = (e.cost && e.cost.tokens) || {};
      ie.run(e.id, e.at, e.kind, e.actor, e.site, e.context ?? null, e.node ?? null, e.subject ?? null, e.correlation ?? null,
        JSON.stringify(e.data || {}), e.cost?.model ?? null, e.cost ? e.cost.usd_list ?? prix(tarifs, e.cost.model, t) : null, t.in ?? null,
        t.cache_write ?? null, t.cache_read ?? null, t.out ?? null, t.cache_write_1h ?? null);
      n++;
    }
    return n;
  }

  requete(sql, ...params) { return this.db.prepare(sql).all(...params); }
}
