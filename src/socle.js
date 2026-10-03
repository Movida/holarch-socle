// Le socle d'un site : configuration, journal, catalogue, index, et les opérations de l'étape 1. Les fonctions de
// lecture sont celles que l'interface web et, à l'étape 2, le hub MCP exposent.
import { chargerConfig } from './config.js';
import { Journal } from './stockage/journal.js';
import { Catalogue } from './stockage/catalogue.js';
import { Index } from './stockage/index.js';
import { inventorier } from './inventaire/index.js';
import importerTranscriptions from './import/claude-code-transcriptions.js';
import { tarifsConfigures } from './tarifs.js';

export const IMPORTS = { 'claude-code-transcriptions': importerTranscriptions };

export class Socle {
  constructor(config = chargerConfig()) {
    this.config = config;
    this.journal = new Journal(config.donnees, config.site);
    this.catalogue = new Catalogue(config.donnees, config.site);
    this.index = new Index(config.donnees);
  }

  async inventaire() { return inventorier(this.config, { catalogue: this.catalogue, journal: this.journal }); }

  importer() {
    const r = {};
    for (const [nom, imp] of Object.entries(IMPORTS)) {
      const o = this.config.import[nom];
      if (!o || o.actif === false) continue;
      r[nom] = imp(o, { journal: this.journal, donnees: this.config.donnees });
    }
    return r;
  }

  indexer() { return this.index.reconstruire({ evenements: this.journal.lire(), fiches: this.catalogue.lire(), tarifs: this.config.tarifs }); }

  async rafraichir() { const inventaire = await this.inventaire(); const imports = this.importer(); const index = this.indexer(); return { inventaire, imports, index }; }

  // ---------- lectures ----------
  etat() {
    const q = (sql, ...p) => this.index.requete(sql, ...p);
    const depuis = (j) => new Date(Date.now() - j * 864e5).toISOString();
    return {
      site: this.config.site,
      donnees: this.config.donnees,
      tarifs_configures: tarifsConfigures(this.config.tarifs),
      tarifs: { source: this.config.tarifs?.source ?? null, releve: this.config.tarifs?.releve ?? null },
      // Tokens dont le modèle n'a pas de tarif : leur coût reste inconnu, et le total affiché est partiel.
      sans_tarif_30j: this.index.requete("SELECT model, SUM(tok_out) sortie FROM evenements WHERE kind='cost.recorded' AND usd IS NULL AND at>=? GROUP BY model ORDER BY sortie DESC", depuis(30)),
      fiches_par_type: q('SELECT kind, COUNT(*) n FROM fiches GROUP BY kind ORDER BY n DESC'),
      dernier_inventaire: q("SELECT at, data FROM evenements WHERE kind='inventory.finished' ORDER BY at DESC LIMIT 1").map((r) => ({ at: r.at, ...JSON.parse(r.data) }))[0] || null,
      sessions: {
        total: q("SELECT COUNT(*) n FROM evenements WHERE kind='session.finished' AND json_extract(data,'$.sous_agent')=0")[0].n,
        sept_jours: q("SELECT COUNT(*) n FROM evenements WHERE kind='session.finished' AND json_extract(data,'$.sous_agent')=0 AND at>=?", depuis(7))[0].n,
      },
      tokens: ['7', '30'].map((j) => ({ jours: +j, ...q("SELECT SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd FROM evenements WHERE kind='cost.recorded' AND at>=?", depuis(+j))[0] })),
      evenements: q('SELECT COUNT(*) n FROM evenements')[0].n,
      refus_30j: {
        par_origine: q("SELECT json_extract(data,'$.origine') cle, COUNT(*) n FROM evenements WHERE kind='tool.denied' AND at>=? GROUP BY cle ORDER BY n DESC", depuis(30)),
        par_outil: q("SELECT json_extract(data,'$.outil') cle, COUNT(*) n FROM evenements WHERE kind='tool.denied' AND at>=? GROUP BY cle ORDER BY n DESC LIMIT 8", depuis(30)),
      },
      // Mémoires identiques (même nom et même description) dans plusieurs projets : copie oubliée ou savoir à remonter.
      memoires_doubles: q("SELECT name, COUNT(*) n, group_concat(coalesce(json_extract(json,'$.attributes.projet'), json_extract(json,'$.attributes.projet_claude')), ', ') projets FROM fiches WHERE kind='memory' GROUP BY name, coalesce(description,'') HAVING n>1 ORDER BY n DESC"),
      projets_sales: q("SELECT name, json_extract(json,'$.attributes.fichiers_modifies') n FROM fiches WHERE kind='project' AND n>0 ORDER BY n DESC"),
    };
  }

  fiches({ kind = null, q = null } = {}) {
    let sql = 'SELECT json FROM fiches WHERE 1=1'; const p = [];
    if (kind) { sql += ' AND kind=?'; p.push(kind); }
    if (q) { sql += ' AND (name LIKE ? OR description LIKE ? OR location LIKE ?)'; p.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    return this.index.requete(sql + ' ORDER BY kind, name', ...p).map((r) => JSON.parse(r.json));
  }

  fiche(id) {
    const r = this.index.requete('SELECT json FROM fiches WHERE id=?', id)[0];
    if (!r) return null;
    // L'historique suit les ré-identifications : les événements des identifiants précédents de l'élément en font partie.
    const ids = [id];
    for (let i = 0; i < 20; i++) {
      const p = this.index.requete("SELECT json_extract(data,'$.de.id') ancien FROM evenements WHERE kind='element.moved' AND subject=? AND json_extract(data,'$.de.id')<>subject", ids[ids.length - 1])[0]?.ancien;
      if (!p || ids.includes(p)) break; ids.push(p);
    }
    return { fiche: JSON.parse(r.json), evenements: this.index.requete(`SELECT * FROM evenements WHERE subject IN (${ids.map(() => '?').join(',')}) ORDER BY at DESC LIMIT 50`, ...ids) };
  }

  sessions({ jours = 30, projet = null } = {}) {
    const depuis = new Date(Date.now() - jours * 864e5).toISOString();
    const lignes = this.index.requete(`SELECT f.correlation session, f.at fin, f.data, f.actor,
        (SELECT MIN(at) FROM evenements s WHERE s.kind='session.started' AND s.correlation=f.correlation) debut,
        (SELECT SUM(tok_out) FROM evenements c WHERE c.kind='cost.recorded' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) sortie,
        (SELECT SUM(tok_cache_read) FROM evenements c WHERE c.kind='cost.recorded' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) cache_lu,
        (SELECT SUM(usd) FROM evenements c WHERE c.kind='cost.recorded' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) usd,
        (SELECT COUNT(DISTINCT correlation) FROM evenements c WHERE c.kind='session.finished' AND c.correlation LIKE f.correlation || ':%') sous_agents,
        (SELECT COUNT(*) FROM evenements c WHERE c.kind='tool.denied' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) refus
      FROM evenements f WHERE f.kind='session.finished' AND json_extract(f.data,'$.sous_agent')=0 AND f.at>=?
        AND f.at=(SELECT MAX(at) FROM evenements g WHERE g.kind='session.finished' AND g.correlation=f.correlation)
      ORDER BY f.at DESC`, depuis);
    return lignes.map((l) => ({ ...l, data: JSON.parse(l.data) })).filter((l) => !projet || l.data.projet === projet);
  }

  consommation({ jours = 30, par = 'projet' } = {}) {
    const col = { projet: 'projet', modele: 'model', jour: 'substr(at,1,10)' }[par] || 'projet';
    const depuis = new Date(Date.now() - jours * 864e5).toISOString();
    return this.index.requete(`SELECT ${col} cle, SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd, COUNT(*) n
      FROM evenements WHERE kind='cost.recorded' AND at>=? GROUP BY cle ORDER BY ${par === 'jour' ? 'cle' : 'sortie DESC'}`, depuis);
  }

  evenements({ kind = null, limite = 200 } = {}) {
    const p = []; let sql = 'SELECT id, at, kind, actor, site, subject, correlation, data, model, tok_out, usd FROM evenements';
    if (kind) { sql += ' WHERE kind LIKE ?'; p.push(`${kind}%`); }
    return this.index.requete(`${sql} ORDER BY at DESC LIMIT ?`, ...p, Math.min(+limite || 200, 2000)).map((e) => ({ ...e, data: JSON.parse(e.data) }));
  }

  arbre() {
    return this.fiches({ kind: 'node' }).map((f) => ({ id: f.id, chemin: f.node, titre: f.name, description: f.description, type: f.attributes?.type, statut: f.attributes?.statut, version: f.version, depot: f.attributes?.depot, parent: (f.links?.derives_from || [])[0] || null, approuve: f.attributes?.approuve || null }));
  }
}
