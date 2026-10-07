// Le socle d'un site : configuration, journal, catalogue, index, et les opérations de l'étape 1. Les fonctions de
// lecture sont celles que l'interface web et, à l'étape 2, le hub MCP exposent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chargerConfig, comptesClaudeCode, accueil } from './config.js';
import { Journal } from './stockage/journal.js';
import { Catalogue } from './stockage/catalogue.js';
import { Index } from './stockage/index.js';
import { inventorier } from './inventaire/index.js';
import importerTranscriptions from './import/claude-code-transcriptions.js';
import { projetsDe, localiserProjet, resoudreProjet } from './projets.js';
import importerPasserelle from './import/agentgateway.js';
import { tarifsConfigures, prix, modeleTarife } from './tarifs.js';
import { regleEffective, regleDuCompte, projetsDeclares } from './regles.js';
import { destination, planifier, appliquer, dossierCompte, dossierProjet, lecturesRefusees, avantCommit, appliquerPermissions } from './regles-claude-code.js';
import { listePrivee, trouverOutil, executer, CONTROLES } from './controles.js';
import { crochetDe, poserCrochet } from './garde-git.js';
import { racineArbre } from './inventaire/arbre.js';
import { ulid } from './ulid.js';

// Parts d'une session entre ses projets, au prorata des appels : [[id, part, nom]] ; hors projet : [[null, 1, null]].
function parts(projets) {
  const total = projets.reduce((x, p) => x + p.n, 0);
  return total ? projets.map((p) => [p.id, p.n / total, p.nom]) : [[null, 1, null]];
}

// La ligne de commande que le crochet de git appelle.
const BIN = fileURLToPath(new URL('../bin/holarch.js', import.meta.url));
// Un écart se reconnaît d'un audit à l'autre par son projet, sa règle, son contrôle et sa clé (jamais par son contenu).
const cleEcart = (projet, d) => [projet ?? '', d.regle, d.controle, d.cle].join('|');
const donneesEcart = (x) => ({ regle: x.regle, controle: x.controle, cle: x.cle, ...(x.fichier && { fichier: x.fichier }), ...(x.ligne && { ligne: x.ligne }), ...(x.n && { n: x.n }), ...(x.message && { message: x.message }) });

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
    // Les projets du dernier inventaire : une session s'y rattache d'après les chemins de ses appels d'outils.
    const projets = projetsDe(this.catalogue.lire({ site: this.config.site }));
    for (const [nom, imp] of Object.entries(IMPORTS)) {
      const o = this.config.import?.[nom];
      if (!o || o.actif === false) continue;
      r[nom] = imp(o, { journal: this.journal, donnees: this.config.donnees, passerelles, comptes: comptesClaudeCode(this.config, o), projets });
    }
    return r;
  }

  indexer() { return this.index.reconstruire({ evenements: this.journal.lire(), fiches: this.catalogue.lire(), tarifs: this.config.tarifs }); }

  async rafraichir() { const inventaire = await this.inventaire(); const imports = this.importer(); const index = this.indexer(); const audit = this.audit({ journaliser: true }).journal; return { inventaire, imports, index, audit }; }

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
        total: q("SELECT COUNT(DISTINCT correlation) n FROM evenements WHERE kind='session.finished' AND json_extract(data,'$.sous_agent')=0")[0].n,
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
        // Cibles ignorées par la passerelle (`failOpen`) : un serveur absent des clients sans erreur visible.
        degradations: q("SELECT json_extract(data,'$.serveur') cle, COUNT(*) n, SUM(json_extract(data,'$.phase')='demarrage') demarrage, MAX(at) dernier FROM evenements WHERE kind='system.degraded' AND json_extract(data,'$.composant')='passerelle' AND at>=? GROUP BY cle ORDER BY n DESC", d),
        mcp: q("SELECT json_extract(data,'$.serveur') cle, COUNT(*) n, SUM(json_extract(data,'$.statut')<>'ok') echecs FROM evenements WHERE kind='tool.called' AND at>=? GROUP BY cle ORDER BY n DESC", d),
        refus: {
          par_origine: q("SELECT json_extract(data,'$.origine') cle, COUNT(*) n FROM evenements WHERE kind='tool.denied' AND at>=? GROUP BY cle ORDER BY n DESC", d),
          par_outil: q("SELECT json_extract(data,'$.outil') cle, COUNT(*) n FROM evenements WHERE kind='tool.denied' AND at>=? GROUP BY cle ORDER BY n DESC LIMIT 8", d),
        },
      },
      tokens: ['7', '30'].map((j) => ({ jours: +j, ...q("SELECT SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd FROM evenements WHERE kind='cost.recorded' AND at>=?", depuis(+j))[0] })),
      evenements: q('SELECT COUNT(*) n FROM evenements')[0].n,
      // Mémoires identiques (même nom et même description) dans plusieurs projets : copie oubliée ou savoir à remonter.
      memoires_doubles: q("SELECT name, COUNT(*) n, group_concat(coalesce((SELECT p.name FROM fiches p WHERE p.id=json_extract(m.json,'$.links.project[0]')), json_extract(m.json,'$.attributes.projet_claude')), ', ') projets FROM fiches m WHERE kind='memory' GROUP BY name, coalesce(description,'') HAVING n>1 ORDER BY n DESC"),
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

  // Attribution des sessions aux projets (décision rattachement-projet), la seule, partagée par toutes les lectures :
  // racine de corrélation → [{id, nom, n}]. Ce sont les projets touchés (`data.projets`, sous-agents compris, la dernière
  // fin de chaque corrélation qui en porte, complément compris) ; sans projet touché, celui du répertoire de départ
  // (`repli`) ; sinon aucun (« hors projet »).
  attribution() {
    const projets = projetsDe(this.fiches({ kind: 'project' }));
    const noms = new Map(projets.map((p) => [p.id, p.nom]));
    const lieu = localiserProjet(projets);
    const touches = new Map(); const departs = new Map(); const vues = new Set();
    for (const e of this.index.requete("SELECT correlation, data FROM evenements WHERE kind='session.finished' AND correlation IS NOT NULL ORDER BY at DESC, id DESC")) {
      const racine = e.correlation.split(':')[0]; const d = JSON.parse(e.data);
      if (racine === e.correlation && !departs.has(racine)) departs.set(racine, d.cwd);
      if (vues.has(e.correlation) || !d.projets?.length) continue;
      vues.add(e.correlation);
      const m = touches.get(racine) || new Map(); touches.set(racine, m);
      for (const p of d.projets) m.set(p.id, (m.get(p.id) || 0) + p.n);
    }
    return (racine) => {
      const t = touches.get(racine);
      if (t?.size) return [...t].map(([id, n]) => ({ id, nom: noms.get(id) ?? null, n })).sort((a, b) => b.n - a.n);
      const p = lieu(departs.get(racine));
      return p ? [{ id: p.id, nom: p.nom, n: 1, repli: true }] : [];
    };
  }

  // Une référence de projet donnée par une personne ou un agent (identifiant, nom, chemin ; `aucun` : hors projet).
  projetDe(ref) {
    if (!ref || ref === 'aucun') return ref || null;
    const p = resoudreProjet(projetsDe(this.fiches({ kind: 'project' })), ref);
    if (!p) throw new Error(`projet inconnu : ${ref}`);
    return p.id;
  }

  // Sessions d'une période, sous-agents rattachés, chacune avec ses projets (`projets`, attribution ci-dessus). Un
  // `session.finished` complémentaire (`data.complement`) n'apporte que les projets d'une session importée avant eux : il
  // ne compte pas comme une fin. `projet` : identifiant, nom ou chemin ; `aucun` pour les sessions hors projet.
  sessions({ jours = 30, projet = null } = {}) {
    const depuis = new Date(Date.now() - jours * 864e5).toISOString();
    const id = this.projetDe(projet);
    const vraie = "json_extract(%s.data,'$.complement') IS NULL";
    const lignes = this.index.requete(`SELECT f.correlation session, f.at fin, f.data, f.actor,
        (SELECT MIN(at) FROM evenements s WHERE s.kind='session.started' AND s.correlation=f.correlation) debut,
        (SELECT SUM(tok_out) FROM evenements c WHERE c.kind='cost.recorded' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) sortie,
        (SELECT SUM(tok_cache_read) FROM evenements c WHERE c.kind='cost.recorded' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) cache_lu,
        (SELECT SUM(usd) FROM evenements c WHERE c.kind='cost.recorded' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) usd,
        (SELECT COUNT(DISTINCT correlation) FROM evenements c WHERE c.kind='session.finished' AND c.correlation LIKE f.correlation || ':%') sous_agents,
        (SELECT COUNT(*) FROM evenements c WHERE c.kind='tool.denied' AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%')) refus,
        (SELECT SUM(t) FROM (SELECT json_extract(c.data,'$.tours') t, MAX(c.at) FROM evenements c WHERE c.kind='session.finished' AND ${vraie.replace('%s', 'c')} AND (c.correlation=f.correlation OR c.correlation LIKE f.correlation || ':%') GROUP BY c.correlation)) tours_total
      FROM evenements f WHERE f.kind='session.finished' AND json_extract(f.data,'$.sous_agent')=0 AND ${vraie.replace('%s', 'f')} AND f.at>=?
        AND f.id=(SELECT id FROM evenements g WHERE g.kind='session.finished' AND g.correlation=f.correlation AND ${vraie.replace('%s', 'g')} ORDER BY at DESC, id DESC LIMIT 1)
      ORDER BY f.at DESC`, depuis);
    const projetsDeSession = this.attribution();
    return lignes.map((l) => ({ ...l, data: JSON.parse(l.data), projets: projetsDeSession(l.session) }))
      .filter((l) => !id || (id === 'aucun' ? !l.projets.length : l.projets.some((p) => p.id === id)));
  }

  // Vue Projets (étape 3, tranche 2) : par projet, où il en est d'après son arbre, ce qui l'attend, son activité et
  // l'état technique de son dépôt. Le coût d'une session se partage entre ses projets, au prorata des appels.
  projets() {
    const fiches = this.fiches({ kind: 'project' });
    const noeuds = this.fiches({ kind: 'node' });
    // Sessions comptées par projet ; coût et tokens repris de `consommation` (coûts datés dans la période) : la vue et le
    // tableau de bord donnent le même chiffre.
    const j7 = new Date(Date.now() - 7 * 864e5).toISOString();
    const activite = new Map();
    const de = (id) => { if (!activite.has(id)) activite.set(id, { sessions_7: 0, sessions_30: 0, usd_7: null, usd_30: null, sortie_30: 0, derniere_session: null }); return activite.get(id); };
    for (const s of this.sessions({ jours: 30 })) {
      for (const [id] of parts(s.projets)) {
        const a = de(id); a.sessions_30++; if (s.fin >= j7) a.sessions_7++;
        if (!a.derniere_session || s.fin > a.derniere_session) a.derniere_session = s.fin;
      }
    }
    for (const c of this.consommation({ jours: 30, par: 'projet' })) { const a = de(c.cle); a.usd_30 = c.usd; a.sortie_30 = c.sortie; }
    for (const c of this.consommation({ jours: 7, par: 'projet' })) de(c.cle).usd_7 = c.usd;
    const ecarts = new Map();
    for (const o of this.ecartsOuverts()) if (o.projet) ecarts.set(o.projet, (ecarts.get(o.projet) || 0) + 1);
    const liste = fiches.map((f) => {
      const a = f.attributes || {};
      const ns = noeuds.filter((n) => n.links?.project?.includes(f.id));
      const etapes = ns.filter((n) => n.attributes?.etape != null).sort((x, y) => x.attributes.etape - y.attributes.etape);
      const close = (n) => (n.attributes.avancement || []).some((e) => e.etiquette.startsWith('Clôture'));
      const courante = [...etapes].reverse().find((n) => !close(n)) || etapes.at(-1);
      const av = courante?.attributes.avancement || [];
      const faits = av.filter((e) => e.etiquette.startsWith('Fait'));
      const racine = ns.find((n) => n.node === '/arbre/index.md');
      const act = activite.get(f.id) || null;
      const p = {
        id: f.id, nom: f.name, chemin: f.location ?? null, branche: a.branche ?? null,
        technique: { fichiers_modifies: a.fichiers_modifies ?? 0, amont: a.amont ?? null, en_avance: a.en_avance ?? null, en_retard: a.en_retard ?? null, dernier_fetch: a.dernier_fetch ?? null },
        dernier_commit: a.dernier_commit ? { at: a.dernier_commit, sujet: a.dernier_sujet ?? null } : null,
        arbre: ns.length > 0,
        etape: courante ? { id: courante.id, numero: courante.attributes.etape, titre: courante.name, close: close(courante), faits: faits.length,
          dernier_fait: faits.at(-1) || null, reste: av.filter((e) => e.etiquette.startsWith('Reste')).flatMap((e) => (e.sous.length ? e.sous : [e.texte]).filter(Boolean)) } : null,
        questions: racine?.attributes?.questions_ouvertes || [],
        decisions: ns.filter((n) => n.attributes?.type === 'decision' && n.attributes?.statut === 'draft').map((n) => ({ id: n.id, titre: n.name })),
        activite: act,
        ecarts: ecarts.get(f.id) || 0,
      };
      const attente = p.questions.length + p.decisions.length + p.technique.fichiers_modifies + (p.technique.en_avance || 0) + p.ecarts;
      p.calme = !act && !attente;
      p.recent = [act?.derniere_session, p.dernier_commit?.at].filter(Boolean).sort().at(-1) || null;
      return p;
    });
    liste.sort((x, y) => (y.recent || '').localeCompare(x.recent || '') || x.nom.localeCompare(y.nom));
    return { projets: liste, hors_projet: activite.get(null) || null };
  }

  // Par projet : le coût de chaque session va à ses projets (même attribution et même partage que la vue Projets) ; la
  // clé est l'identifiant du projet, `null` hors projet.
  consommation({ jours = 30, par = 'projet' } = {}) {
    const depuis = new Date(Date.now() - jours * 864e5).toISOString();
    const somme = "SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd, COUNT(*) n, SUM(model LIKE 'anthropic/%') via";
    if (par === 'projet') {
      const projetsDeSession = this.attribution(); const r = new Map();
      for (const l of this.index.requete(`SELECT correlation, ${somme} FROM evenements WHERE kind='cost.recorded' AND at>=? GROUP BY correlation`, depuis)) {
        for (const [id, part, nom] of parts(projetsDeSession(String(l.correlation).split(':')[0]))) {
          const x = r.get(id) || { cle: id, nom, sortie: 0, cache_lu: 0, cache_ecrit: 0, entree: 0, usd: null, n: 0, via: 0 }; r.set(id, x);
          for (const k of ['sortie', 'cache_lu', 'cache_ecrit', 'entree', 'n', 'via']) x[k] += (l[k] || 0) * part;
          if (l.usd != null) x.usd = (x.usd || 0) + l.usd * part;
        }
      }
      return [...r.values()].map((x) => ({ ...x, sortie: Math.round(x.sortie), cache_lu: Math.round(x.cache_lu), cache_ecrit: Math.round(x.cache_ecrit), entree: Math.round(x.entree) })).sort((a, b) => b.sortie - a.sortie);
    }
    // Par modèle : un identifiant passé par un intermédiaire (anthropic/…) se range avec son modèle de base ; `via` le compte.
    const col = par === 'jour' ? 'substr(at,1,10)' : "CASE WHEN model LIKE 'anthropic/%' THEN substr(model, 11) ELSE model END";
    return this.index.requete(`SELECT ${col} cle, ${somme} FROM evenements WHERE kind='cost.recorded' AND at>=? GROUP BY cle ORDER BY ${par === 'jour' ? 'cle' : 'sortie DESC'}`, depuis);
  }

  evenements({ kind = null, session = null, sauf = null, limite = 200 } = {}) {
    const p = []; let sql = 'SELECT id, at, kind, actor, site, subject, correlation, data, model, tok_out, usd FROM evenements WHERE 1=1';
    if (kind) { sql += ' AND kind LIKE ?'; p.push(`${kind}%`); }
    if (sauf) { sql += ' AND kind NOT LIKE ?'; p.push(`${sauf}.%`); }
    // Une session et ses sous-agents (corrélation « session » ou « session:… »).
    if (session) { sql += " AND (correlation=? OR correlation LIKE ? || ':%')"; p.push(session, session); }
    return this.index.requete(`${sql} ORDER BY at DESC LIMIT ?`, ...p, Math.min(+limite || 200, 2000)).map((e) => ({ ...e, data: JSON.parse(e.data) }));
  }

  // Règle effective (étape 3, tranche 3, décision arbre-des-regles) d'un projet ; sans projet, ce qui vaut au compte et
  // les projets qui ont des règles. Chaque règle dit où l'adaptateur Claude Code l'écrit, ou pourquoi il ne l'écrit pas.
  regles({ projet = null } = {}) {
    const fiches = [...this.fiches({ kind: 'node' }), ...this.fiches({ kind: 'rule' })];
    const portees = (r, classificationDepot) => ({ ...r, regles: r.regles.map((e) => ({ ...e, claude_code: destination(e, { classificationDepot }) })) });
    const projets = this.fiches({ kind: 'project' });
    const ouverts = this.ecartsOuverts();
    if (projet) {
      const id = this.projetDe(projet); const r = regleEffective(fiches, id);
      return { nom: projets.find((p) => p.id === id)?.name ?? null, chemin: projets.find((p) => p.id === id)?.location ?? null, ...portees(r, r.arbre?.classification),
        ecarts: ouverts.filter((o) => o.projet === id) };
    }
    const declares = projetsDeclares(fiches);
    const resume = projets.map((p) => ({ p, r: regleEffective(fiches, p.id) }))
      .filter(({ p, r }) => declares.has(p.id) || r.arbre?.types.length || r.regles.some((e) => e.origine === 'projet'))
      .map(({ p, r }) => ({ id: p.id, nom: p.name, declare: declares.has(p.id), types: r.arbre?.types || [], appliquees: r.regles.filter((e) => e.applicable).length,
        proposees: r.regles.filter((e) => e.statut === 'draft').length, rappels: r.rappels, signaux: r.signaux.length, ecarts: ouverts.filter((o) => o.projet === p.id).length }));
    return { compte: { ...portees(regleDuCompte(fiches), 'sensitive'), ecarts: ouverts.filter((o) => !o.projet) }, projets: resume };
  }

  // ---------- contrôles et audit (étape 3, tranche 4, décision controles-de-regles) ----------

  // Ce qu'un contrôle reçoit pour un projet : son dépôt, la racine de son arbre, ses réglages, la liste privée, gitleaks.
  contexteControle(projet, r, depot = projet.location) {
    const fiches = this.fiches({ kind: 'node' });
    const declares = projetsDeclares(fiches);
    const publique = (id) => fiches.some((n) => n.attributes?.racine && n.links?.project?.includes(id) && n.classification === 'public');
    const projetsPrives = this.fiches({ kind: 'project' }).filter((x) => declares.has(x.id) && !publique(x.id)).map((x) => x.name);
    const comptes = comptesClaudeCode(this.config, this.config.inventaire?.['claude-code'] || {});
    const config = r.config || {};
    return { depot, arbre: depot ? racineArbre(depot)?.dossier : null, config, gitleaks: trouverOutil('gitleaks', this.config.controles?.gitleaks),
      osv: trouverOutil('osv-scanner', this.config.controles?.osv_scanner), cache: path.join(this.config.donnees, 'cache'),
      termes: depot ? listePrivee({ depot, config, comptes, projetsPrives, nomProjet: projet.name }) : [] };
  }

  // Contrôles d'un projet à un moment : par règle applicable de l'un des niveaux, ses écarts ; et l'état de chaque contrôle.
  #controler(projet, r, ctx, moment, niveaux, portee = 'projet') {
    const memo = new Map(); const ecarts = []; const etats = new Map();
    for (const e of r.regles.filter((x) => x.applicable && niveaux.includes(x.niveau))) {
      for (const c of e.controles || []) {
        if ((CONTROLES[c]?.portee === 'site') !== (portee === 'site')) continue;
        if (!memo.has(c)) memo.set(c, executer(c, ctx, moment));
        const res = memo.get(c);
        if (res.hors_moment) continue;
        etats.set(c, res.indisponible ? { id: c, etat: 'indisponible', raison: res.indisponible } : { id: c, etat: 'fait' });
        if (!res.indisponible) ecarts.push(...res.ecarts.map((x) => ({ regle: e.fiche, regle_id: e.id, enonce: e.enonce, controle: c, ...x })));
      }
    }
    return { ecarts, controles: [...etats.values()] };
  }

  // Garde avant commit (appelée par le crochet de git) : les règles bloquantes du projet du dépôt, sur les changements
  // indexés. { projet, refus: [{regle, enonce, ecarts}], indisponibles }.
  garde({ depot = process.cwd(), moment = 'avant-commit' } = {}) {
    const projets = this.fiches({ kind: 'project' });
    const p = localiserProjet(projetsDe(projets))(path.resolve(depot));
    if (!p) return { projet: null, refus: [], indisponibles: [] };
    const r = regleEffective([...this.fiches({ kind: 'node' }), ...this.fiches({ kind: 'rule' })], p.id);
    const { ecarts, controles } = this.#controler(projets.find((x) => x.id === p.id), r, this.contexteControle(projets.find((x) => x.id === p.id), r, path.resolve(depot)), moment, ['blocking']);
    const refus = new Map();
    for (const x of ecarts) { if (!refus.has(x.regle_id)) refus.set(x.regle_id, { regle: x.regle_id, enonce: x.enonce, ecarts: [] }); refus.get(x.regle_id).ecarts.push(x); }
    return { projet: p.id, refus: [...refus.values()], indisponibles: controles.filter((c) => c.etat === 'indisponible') };
  }

  // Écarts ouverts : derniers `rule.violated` sans `rule.resolved` après eux, avec leur date d'apparition.
  ecartsOuverts() {
    const ouverts = new Map();
    for (const ev of this.index.requete("SELECT at, kind, subject, data FROM evenements WHERE kind IN ('rule.violated','rule.resolved') ORDER BY id")) {
      const d = JSON.parse(ev.data); const k = cleEcart(ev.subject, d);
      if (ev.kind === 'rule.violated') ouverts.set(k, { ...d, projet: ev.subject ?? null, depuis: ev.at }); else ouverts.delete(k);
    }
    return [...ouverts.values()];
  }

  /**
   * Audit de conformité : pour le compte et chaque projet qui a des règles (ou celui demandé), les contrôles de ses règles
   * `blocking` et `verified`, et la matérialisation (fichiers générés, crochet, permissions, mémoires remplacées).
   * `journaliser` : un écart apparu s'écrit `rule.violated`, un écart disparu `rule.resolved` (si son contrôle a pu
   * s'exécuter). Rien d'autre n'est écrit.
   */
  audit({ projet = null, journaliser = false } = {}) {
    const fiches = [...this.fiches({ kind: 'node' }), ...this.fiches({ kind: 'rule' })];
    const projets = this.fiches({ kind: 'project' }); const memoires = this.fiches({ kind: 'memory' });
    const faits = new Set(); const sorties = [];
    const regleNommee = (regles, nom) => regles.find((e) => e.id === nom)?.fiche || nom;
    // Écarts de matérialisation d'un plan (adaptateur Claude Code) dans son dossier, sans rien écrire.
    const materialisation = (regles, plan, dossier, prefixe) => {
      const d = appliquer(dossier, plan, { ecrire: false }); const regleDe = new Map(plan.fichiers.map((x) => [x.fichier, x.regle]));
      const e = (f, message) => ({ regle: regleNommee(regles, regleDe.get(f) || f.replace(/\.md$/, '')), regle_id: regleDe.get(f) || f.replace(/\.md$/, ''), controle: 'regles-a-jour', cle: f, fichier: `${prefixe}/${f}`, message });
      return [...d.crees.map((f) => e(f, 'fichier de règle absent')), ...d.modifies.map((f) => e(f, 'fichier de règle périmé')),
        ...d.retires.map((f) => e(f, 'fichier généré sans règle')), ...d.ignores.map((f) => e(f, 'fichier non marqué à la place d’une règle générée'))];
    };
    const remplacees = (regles, liste) => regles.filter((e) => e.applicable && e.remplace?.length).flatMap((e) => liste
      .filter((m) => e.remplace.includes(m.name) || e.remplace.includes(path.basename(m.location || '', '.md')))
      .map((m) => ({ regle: e.fiche, regle_id: e.id, controle: 'memoire-remplacee', cle: m.id, fichier: m.name, message: 'mémoire encore présente, remplacée par la règle' })));

    // Compte : ce qui vaut pour tous les projets du site.
    const compte = regleDuCompte(fiches);
    const rc = { projet: null, nom: 'compte', ecarts: [], controles: [] };
    if (compte.regles.length) {
      for (const c of comptesClaudeCode(this.config, this.config.inventaire?.['claude-code'] || {}).filter((x) => x.home)) {
        rc.ecarts.push(...materialisation(compte.regles, planifier(compte.regles, { portee: 'compte' }), dossierCompte(c.home), 'rules/holarch'));
        const lectures = compte.regles.filter((e) => e.applicable).flatMap((e) => lecturesRefusees(e).map((x) => [x, e]));
        try {
          const pr = appliquerPermissions(c.home, lectures.map(([x]) => x), { ecrire: false });
          for (const x of pr.ajoutees) { const e = lectures.find(([y]) => y === x)[1]; rc.ecarts.push({ regle: e.fiche, regle_id: e.id, controle: 'permissions-posees', cle: x, fichier: 'settings.json', message: 'lecture non refusée' }); }
        } catch (err) { rc.controles.push({ id: 'permissions-posees', etat: 'indisponible', raison: err.message }); }
      }
      rc.ecarts.push(...remplacees(compte.regles, memoires));
      for (const c of ['regles-a-jour', 'permissions-posees', 'memoire-remplacee']) if (!rc.controles.some((x) => x.id === c)) faits.add(`|${c}`);
      // Contrôles de portée site (le poste lui-même), une fois, avec les réglages du compte.
      const site = this.#controler(null, compte, { config: compte.config || {}, cache: path.join(this.config.donnees, 'cache') }, 'audit', ['blocking', 'verified'], 'site');
      rc.ecarts.push(...site.ecarts); rc.controles.push(...site.controles);
      for (const c of site.controles) if (c.etat === 'fait') faits.add(`|${c.id}`);
      sorties.push(rc);
    }

    // Projets.
    const cibles = projet ? [this.projetDe(projet)] : this.regles().projets.map((p) => p.id);
    for (const id of cibles) {
      const p = projets.find((x) => x.id === id); if (!p) continue;
      const r = regleEffective(fiches, id);
      const ctx = this.contexteControle(p, r);
      const { ecarts, controles } = this.#controler(p, r, ctx, 'audit', ['blocking', 'verified']);
      for (const c of controles) if (c.etat === 'fait') faits.add(`${id}|${c.id}`);
      const rp = { projet: id, nom: p.name, ecarts, controles };
      if (p.location && fs.existsSync(p.location)) {
        rp.ecarts.push(...materialisation(r.regles, planifier(r.regles, { portee: 'projet', classificationDepot: r.arbre?.classification }), dossierProjet(p.location), '.claude/rules/holarch'));
        const demande = r.regles.find((e) => e.applicable && avantCommit(e));
        const st = poserCrochet(p.location, demande ? crochetDe({ holarch: BIN, accueil: this.config.accueil || accueil() }) : null, { ecrire: false });
        const crochet = (e, message) => rp.ecarts.push({ regle: e ? e.fiche : 'crochet', regle_id: e ? e.id : 'crochet', controle: 'crochet-pose', cle: 'pre-commit', fichier: '.git/hooks/pre-commit', message });
        if (st.etat === 'pose') crochet(demande, 'crochet de git absent');
        else if (st.etat === 'modifie') crochet(demande, 'crochet de git périmé');
        else if (st.etat === 'ignore' && demande) crochet(demande, 'un crochet pre-commit non marqué occupe la place');
        else if (st.etat === 'retire') crochet(null, 'crochet posé sans règle qui le demande');
        faits.add(`${id}|regles-a-jour`); faits.add(`${id}|crochet-pose`);
      }
      rp.ecarts.push(...remplacees(r.regles.filter((e) => e.origine === 'type' || e.origine === 'projet'), memoires.filter((m) => m.links?.project?.includes(id))));
      faits.add(`${id}|memoire-remplacee`);
      sorties.push(rp);
    }

    let journal = null;
    if (journaliser) {
      const ouverts = new Map(this.ecartsOuverts().map((o) => [cleEcart(o.projet, o), o]));
      const actuels = new Map(sorties.flatMap((x) => x.ecarts.map((e) => [cleEcart(x.projet, e), { ...e, projet: x.projet }])));
      const at = new Date().toISOString(); const evs = [];
      const ev = (kind, x) => ({ id: ulid(Date.parse(at)), at, kind, actor: 'system:audit', subject: x.projet, data: donneesEcart(x), classification: 'internal' });
      for (const [k, x] of actuels) if (!ouverts.has(k)) evs.push(ev('rule.violated', x));
      for (const [k, o] of ouverts) if (!actuels.has(k) && faits.has(`${o.projet ?? ''}|${o.controle}`)) evs.push(ev('rule.resolved', o));
      const r = this.journal.ajouter(evs);
      if (r.ajoutes) this.index.inserer(evs.map((e) => ({ ...e, site: this.config.site })), this.config.tarifs);
      journal = { apparus: evs.filter((e) => e.kind === 'rule.violated').length, resolus: evs.filter((e) => e.kind === 'rule.resolved').length, refuses: r.refuses.length };
    }
    return { cibles: sorties, journal };
  }

  arbre() {
    const noms = new Map(projetsDe(this.fiches({ kind: 'project' })).map((p) => [p.id, p.nom]));
    return this.fiches({ kind: 'node' }).map((f) => ({ id: f.id, chemin: f.node, titre: f.name, description: f.description, type: f.attributes?.type, statut: f.attributes?.statut, version: f.version,
      projet: f.links?.project?.[0] ? { id: f.links.project[0], nom: noms.get(f.links.project[0]) ?? null } : null, parent: (f.links?.derives_from || [])[0] || null, approuve: f.attributes?.approuve || null }));
  }
}
