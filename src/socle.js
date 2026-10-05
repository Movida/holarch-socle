// Le socle d'un site : configuration, journal, catalogue, index, et les opérations de l'étape 1. Les fonctions de
// lecture sont celles que l'interface web et, à l'étape 2, le hub MCP exposent.
import { chargerConfig, comptesClaudeCode } from './config.js';
import { Journal } from './stockage/journal.js';
import { Catalogue } from './stockage/catalogue.js';
import { Index } from './stockage/index.js';
import { inventorier } from './inventaire/index.js';
import importerTranscriptions from './import/claude-code-transcriptions.js';
import importerPasserelle from './import/agentgateway.js';
import { tarifsConfigures, prix, modeleTarife } from './tarifs.js';
import { ulid } from './ulid.js';

export const IMPORTS = { 'claude-code-transcriptions': importerTranscriptions, agentgateway: importerPasserelle };

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
    // Une passerelle active fait foi pour les appels qui la traversent : l'import des transcriptions laisse de côté les
    // appels au serveur qui la désigne chez les clients, pour ne pas les compter deux fois.
    const p = this.config.import?.agentgateway;
    const passerelles = p && p.actif !== false && p.fichier ? [p.nom || 'passerelle'] : [];
    for (const [nom, imp] of Object.entries(IMPORTS)) {
      const o = this.config.import?.[nom];
      if (!o || o.actif === false) continue;
      r[nom] = imp(o, { journal: this.journal, donnees: this.config.donnees, passerelles, comptes: comptesClaudeCode(this.config, o) });
    }
    return r;
  }

  indexer() { return this.index.reconstruire({ evenements: this.journal.lire(), fiches: this.catalogue.lire(), tarifs: this.config.tarifs }); }

  async rafraichir() { const inventaire = await this.inventaire(); const imports = this.importer(); const index = this.indexer(); return { inventaire, imports, index }; }

  // Une page de l'interface consultée : la mesure du critère d'usage de l'étape 1 (décision ouverture de l'étape 2).
  noterVue({ page, jours = null }) {
    if (!/^[a-z]{1,30}$/.test(String(page))) return { ajoute: 0 };
    const at = new Date().toISOString();
    const e = { id: ulid(Date.parse(at)), at, kind: 'ui.viewed', actor: `human:${this.config.humain || 'local'}`, data: { page, ...(jours && { jours: +jours }) }, classification: 'internal' };
    const r = this.journal.ajouter([e]);
    if (r.ajoutes) this.index.inserer([{ ...e, site: this.config.site }], this.config.tarifs);
    return { ajoute: r.ajoutes };
  }

  // ---------- lectures ----------
  // État du site, et ce qui s'est passé sur une période (`jours`) : tout ce que montre le tableau de bord.
  etat({ jours = 30 } = {}) {
    const q = (sql, ...p) => this.index.requete(sql, ...p);
    const depuis = (j) => new Date(Date.now() - j * 864e5).toISOString();
    const d = depuis(jours = Math.min(Math.max(+jours || 30, 1), 3650));
    return {
      site: this.config.site,
      donnees: this.config.donnees,
      tarifs_configures: tarifsConfigures(this.config.tarifs),
      tarifs: { source: this.config.tarifs?.source ?? null, releve: this.config.tarifs?.releve ?? null },
      fiches_par_type: q('SELECT kind, COUNT(*) n FROM fiches GROUP BY kind ORDER BY n DESC'),
      dernier_inventaire: q("SELECT at, data FROM evenements WHERE kind='inventory.finished' ORDER BY at DESC LIMIT 1").map((r) => ({ at: r.at, ...JSON.parse(r.data) }))[0] || null,
      sessions: {
        total: q("SELECT COUNT(*) n FROM evenements WHERE kind='session.finished' AND json_extract(data,'$.sous_agent')=0")[0].n,
      },
      periode: {
        jours,
        sessions: q("SELECT COUNT(DISTINCT correlation) n FROM evenements WHERE kind='session.finished' AND json_extract(data,'$.sous_agent')=0 AND at>=?", d)[0].n,
        // Sessions et coût par compte Claude Code (sites à plusieurs comptes) : la part de chacun se suit dans le temps.
        par_compte: q("SELECT json_extract(data,'$.compte') cle, COUNT(DISTINCT CASE WHEN kind='session.finished' AND json_extract(data,'$.sous_agent')=0 THEN correlation END) sessions, SUM(CASE WHEN kind='cost.recorded' THEN usd END) usd FROM evenements WHERE kind IN ('session.finished','cost.recorded') AND at>=? GROUP BY cle ORDER BY sessions DESC", d).filter((r, _, t) => t.some((x) => x.cle != null)),
        tokens: q("SELECT SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd FROM evenements WHERE kind='cost.recorded' AND at>=?", d)[0],
        // Coût liste par type de tokens : ce qui pèse (souvent la relecture du cache) se voit.
        cout_par_type: this.coutParType(d),
        // Tokens dont le modèle n'a pas de tarif : leur coût reste inconnu, et le total affiché est partiel.
        sans_tarif: q("SELECT model, SUM(tok_out) sortie FROM evenements WHERE kind='cost.recorded' AND usd IS NULL AND at>=? GROUP BY model ORDER BY sortie DESC", d),
        // Usage de l'interface : jours où elle a été ouverte, pages consultées.
        ui: {
          jours_actifs: q("SELECT COUNT(DISTINCT substr(at,1,10)) n FROM evenements WHERE kind='ui.viewed' AND at>=?", d)[0].n,
          pages: q("SELECT json_extract(data,'$.page') cle, COUNT(*) n FROM evenements WHERE kind='ui.viewed' AND at>=? GROUP BY cle ORDER BY n DESC", d),
        },
        // Appels MCP par serveur (dont ceux au serveur holarch : le critère d'usage de l'étape 2 ici).
        mcp: q("SELECT json_extract(data,'$.serveur') cle, COUNT(*) n, SUM(json_extract(data,'$.statut')<>'ok') echecs FROM evenements WHERE kind='tool.called' AND at>=? GROUP BY cle ORDER BY n DESC", d),
        refus: {
          par_origine: q("SELECT json_extract(data,'$.origine') cle, COUNT(*) n FROM evenements WHERE kind='tool.denied' AND at>=? GROUP BY cle ORDER BY n DESC", d),
          par_outil: q("SELECT json_extract(data,'$.outil') cle, COUNT(*) n FROM evenements WHERE kind='tool.denied' AND at>=? GROUP BY cle ORDER BY n DESC LIMIT 8", d),
        },
      },
      tokens: ['7', '30'].map((j) => ({ jours: +j, ...q("SELECT SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd FROM evenements WHERE kind='cost.recorded' AND at>=?", depuis(+j))[0] })),
      evenements: q('SELECT COUNT(*) n FROM evenements')[0].n,
      // Mémoires identiques (même nom et même description) dans plusieurs projets : copie oubliée ou savoir à remonter.
      memoires_doubles: q("SELECT name, COUNT(*) n, group_concat(coalesce(json_extract(json,'$.attributes.projet'), json_extract(json,'$.attributes.projet_claude')), ', ') projets FROM fiches WHERE kind='memory' GROUP BY name, coalesce(description,'') HAVING n>1 ORDER BY n DESC"),
      projets_sales: q("SELECT name, json_extract(json,'$.attributes.fichiers_modifies') n FROM fiches WHERE kind='project' AND n>0 ORDER BY n DESC"),
    };
  }

  coutParType(depuis) {
    const t = this.config.tarifs; const r = { entree: 0, cache_ecrit: 0, cache_lu: 0, sortie: 0 };
    for (const m of this.index.requete("SELECT model, SUM(tok_in) i, SUM(tok_cache_write) cw, SUM(tok_cache_write_1h) h, SUM(tok_cache_read) cr, SUM(tok_out) o FROM evenements WHERE kind='cost.recorded' AND at>=? GROUP BY model", depuis)) {
      if (!modeleTarife(t, m.model)) continue;
      r.entree += prix(t, m.model, { in: m.i }); r.cache_ecrit += prix(t, m.model, { cache_write: m.cw, cache_write_1h: m.h });
      r.cache_lu += prix(t, m.model, { cache_read: m.cr }); r.sortie += prix(t, m.model, { out: m.o });
    }
    return r;
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
        (SELECT COUNT(*) FROM evenements c WHERE c.kind='tool.denied' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) refus,
        (SELECT SUM(t) FROM (SELECT json_extract(c.data,'$.tours') t, MAX(c.at) FROM evenements c WHERE c.kind='session.finished' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%') GROUP BY c.correlation)) tours_total
      FROM evenements f WHERE f.kind='session.finished' AND json_extract(f.data,'$.sous_agent')=0 AND f.at>=?
        AND f.at=(SELECT MAX(at) FROM evenements g WHERE g.kind='session.finished' AND g.correlation=f.correlation)
      ORDER BY f.at DESC`, depuis);
    return lignes.map((l) => ({ ...l, data: JSON.parse(l.data) })).filter((l) => !projet || l.data.projet === projet);
  }

  consommation({ jours = 30, par = 'projet' } = {}) {
    // Par modèle : un identifiant passé par un intermédiaire (anthropic/…) se range avec son modèle de base ; `via` le compte.
    const col = { projet: 'projet', modele: "CASE WHEN model LIKE 'anthropic/%' THEN substr(model, 11) ELSE model END", jour: 'substr(at,1,10)' }[par] || 'projet';
    const depuis = new Date(Date.now() - jours * 864e5).toISOString();
    return this.index.requete(`SELECT ${col} cle, SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd, COUNT(*) n, SUM(model LIKE 'anthropic/%') via
      FROM evenements WHERE kind='cost.recorded' AND at>=? GROUP BY cle ORDER BY ${par === 'jour' ? 'cle' : 'sortie DESC'}`, depuis);
  }

  evenements({ kind = null, session = null, sauf = null, limite = 200 } = {}) {
    const p = []; let sql = 'SELECT id, at, kind, actor, site, subject, correlation, data, model, tok_out, usd FROM evenements WHERE 1=1';
    if (kind) { sql += ' AND kind LIKE ?'; p.push(`${kind}%`); }
    if (sauf) { sql += ' AND kind NOT LIKE ?'; p.push(`${sauf}.%`); }
    // Une session et ses sous-agents (corrélation « session » ou « session:… »).
    if (session) { sql += " AND (correlation=? OR correlation LIKE ? || ':%')"; p.push(session, session); }
    return this.index.requete(`${sql} ORDER BY at DESC LIMIT ?`, ...p, Math.min(+limite || 200, 2000)).map((e) => ({ ...e, data: JSON.parse(e.data) }));
  }

  arbre() {
    return this.fiches({ kind: 'node' }).map((f) => ({ id: f.id, chemin: f.node, titre: f.name, description: f.description, type: f.attributes?.type, statut: f.attributes?.statut, version: f.version, depot: f.attributes?.depot, parent: (f.links?.derives_from || [])[0] || null, approuve: f.attributes?.approuve || null }));
  }
}
