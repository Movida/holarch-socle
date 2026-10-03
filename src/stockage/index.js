// Index SQLite, jetable : reconstruit depuis le journal et le catalogue, pour que l'interface interroge vite. Ce n'est
// jamais une source de vérité (décision synchronisation).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export class Index {
  constructor(donnees) {
    fs.mkdirSync(donnees, { recursive: true });
    this.db = new DatabaseSync(path.join(donnees, 'index.sqlite'));
  }

  reconstruire({ evenements, fiches }) {
    const db = this.db;
    db.exec(`DROP TABLE IF EXISTS evenements; DROP TABLE IF EXISTS fiches;
      CREATE TABLE evenements (id TEXT PRIMARY KEY, at TEXT, kind TEXT, actor TEXT, site TEXT, context TEXT, node TEXT,
        subject TEXT, correlation TEXT, data TEXT, model TEXT, usd REAL, tok_in INTEGER, tok_cache_write INTEGER,
        tok_cache_read INTEGER, tok_out INTEGER, projet TEXT);
      CREATE TABLE fiches (id TEXT PRIMARY KEY, kind TEXT, name TEXT, description TEXT, node TEXT, context TEXT,
        status TEXT, site TEXT, location TEXT, json TEXT);
      CREATE INDEX ev_kind ON evenements(kind, at); CREATE INDEX ev_corr ON evenements(correlation);`);
    const ie = db.prepare('INSERT OR IGNORE INTO evenements VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    let n = 0;
    db.exec('BEGIN');
    for (const e of evenements) {
      const t = (e.cost && e.cost.tokens) || {};
      ie.run(e.id, e.at, e.kind, e.actor, e.site, e.context ?? null, e.node ?? null, e.subject ?? null, e.correlation ?? null,
        JSON.stringify(e.data || {}), e.cost?.model ?? null, e.cost?.usd_list ?? null, t.in ?? null, t.cache_write ?? null,
        t.cache_read ?? null, t.out ?? null, e.data?.projet ?? null);
      n++;
    }
    const iff = db.prepare('INSERT OR REPLACE INTO fiches VALUES (?,?,?,?,?,?,?,?,?,?)');
    for (const f of fiches) iff.run(f.id, f.kind, f.name, f.description ?? null, f.node ?? null, f.context ?? null, f.status, f.site ?? null, f.location ?? null, JSON.stringify(f));
    db.exec('COMMIT');
    return { evenements: n, fiches: fiches.length };
  }

  requete(sql, ...params) { return this.db.prepare(sql).all(...params); }
}
