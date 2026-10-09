// Le socle d'un site : configuration, journal, catalogue, index, et les opérations de l'étape 1. Les fonctions de
// lecture sont celles que l'interface web et, à l'étape 2, le hub MCP exposent.
import fs from 'node:fs';
import path from 'node:path';
import { chargerConfig, comptesClaudeCode } from './config.js';
import { Journal } from './stockage/journal.js';
import { Catalogue } from './stockage/catalogue.js';
import { Index } from './stockage/index.js';
import { inventorier } from './inventaire/index.js';
import importerTranscriptions from './import/claude-code-transcriptions.js';
import { projetsDe, localiserProjet, resoudreProjet } from './projets.js';
import importerPasserelle from './import/agentgateway.js';
import { tarifsConfigures, prix, modeleTarife } from './tarifs.js';
import { regleEffective, regleDuCompte, projetsDeclares, arbresDe, aApprouver } from './regles.js';
import { destination } from './regles-claude-code.js';
import { contexteControle, garde, ecartsOuverts, audit } from './audit.js';
import { ulid } from './ulid.js';
import { recolter, regroupeurClaude, trier, regleProposee, ajouterRegles } from './recolte.js';
import { racineIndex } from './creation.js';
import inventaireArbre, { racineArbre, arbreModifieDepuis } from './inventaire/arbre.js';
import { trouverOutil, binaireClaude } from './commun.js';

// Parts d'une session entre ses projets, au prorata des appels : [[id, part, nom]] ; hors projet : [[null, 1, null]].
function parts(projets) {
  const total = projets.reduce((x, p) => x + p.n, 0);
  return total ? projets.map((p) => [p.id, p.n / total, p.nom]) : [[null, 1, null]];
}

export const IMPORTS = { 'claude-code-transcriptions': importerTranscriptions, agentgateway: importerPasserelle };

export class Socle {
  constructor(config = chargerConfig()) {
    this.config = config;
    this.journal = new Journal(config.donnees, config.site);
    this.catalogue = new Catalogue(config.donnees, config.site);
    this.index = new Index(config.donnees);
  }

  async inventaire() { return inventorier(this.config, { catalogue: this.catalogue, journal: this.journal }); }

  // Le catalogue date du dernier inventaire (horaire) : une lecture des règles ou de la reprise le refait d'abord quand
  // un arbre connu a changé depuis, sans quoi une règle ajoutée reste invisible jusqu'à l'heure suivante (idée I28).
  // Rend vrai s'il a fallu l'inventaire ; l'index reste à reconstruire par l'appelant.
  async arbreAJour() {
    if (!this.#arbreChange()?.change) return false;
    await this.inventaire();
    return true;
  }

  // Un arbre connu a-t-il changé depuis le catalogue ? null si l'inventaire de l'arbre est coupé, sinon { change, fiches }.
  #arbreChange() {
    const o = this.config.inventaire?.arbre;
    if (!o || o.actif === false) return null;
    const depuis = this.catalogue.date(); const fiches = this.catalogue.lire({ site: this.config.site });
    const depots = new Set([...(o.depots || []), ...fiches.filter((f) => f.kind === 'project' && f.location).map((f) => f.location)]);
    return { change: !depuis || [...depots].some((d) => arbreModifieDepuis(d, depuis)), fiches, options: o, depots };
  }

  // Nœuds et règles pour une décision immédiate (garde avant commit) : ceux du catalogue, ou, si un arbre a changé depuis,
  // relus des fichiers, en mémoire. Ni git ni écriture : la garde tourne dans un crochet de git, où `GIT_INDEX_FILE` fausserait
  // la lecture des autres dépôts par un inventaire complet.
  arbreFrais() {
    const a = this.#arbreChange();
    if (!a?.change) return [...this.fiches({ kind: 'node' }), ...this.fiches({ kind: 'rule' })];
    return inventaireArbre(a.options, { depots: [...a.depots], projetDe: localiserProjet(projetsDe(a.fiches.filter((f) => f.kind === 'project'))) });
  }

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
        echecs: (({ par_projet, ...x }) => x)(this.echecs({ jours })),
      },
      tokens: ['7', '30'].map((j) => ({ jours: +j, ...q("SELECT SUM(tok_out) sortie, SUM(tok_cache_read) cache_lu, SUM(tok_cache_write) cache_ecrit, SUM(tok_in) entree, SUM(usd) usd FROM evenements WHERE kind='cost.recorded' AND at>=?", depuis(+j))[0] })),
      evenements: q('SELECT COUNT(*) n FROM evenements')[0].n,
      // Mémoires identiques (même nom et même description) dans plusieurs projets : copie oubliée ou savoir à remonter.
      memoires_doubles: q("SELECT name, COUNT(*) n, group_concat(coalesce((SELECT p.name FROM fiches p WHERE p.id=json_extract(m.json,'$.links.project[0]')), json_extract(m.json,'$.attributes.projet_claude')), ', ') projets FROM fiches m WHERE kind='memory' GROUP BY name, coalesce(description,'') HAVING n>1 ORDER BY n DESC"),
      projets_sales: q("SELECT name, json_extract(json,'$.attributes.fichiers_modifies') n FROM fiches WHERE kind='project' AND n>0 ORDER BY n DESC"),
      contexte: this.contexte(),
    };
  }

  // Contexte relu par tour (décision passation-sereine) : la mesure de l'économie (moyenne pondérée par les tours, donc
  // portée par les longues sessions, celles qui coûtent), et les sessions de la semaine au-dessus du seuil de passation.
  contexte() {
    const fiches = [...this.fiches({ kind: 'node' }), ...this.fiches({ kind: 'rule' })];
    const seuil = +regleDuCompte(fiches).config?.claude_code?.passation?.seuil_tokens || 150000;
    const l = this.sessions({ jours: 30 }).filter((x) => x.tours_total && x.cache_lu);
    const moyen = (a) => { const t = a.reduce((x, y) => x + y.tours_total, 0); return t ? Math.round(a.reduce((x, y) => x + y.cache_lu, 0) / t) : null; };
    const j7 = new Date(Date.now() - 7 * 864e5).toISOString(); const semaine = l.filter((x) => x.fin >= j7);
    const lourdes = semaine.map((x) => ({ session: x.session, fin: x.fin, projets: x.projets.map((p) => p.nom || p.id), tours: x.tours_total, moyen: Math.round(x.cache_lu / x.tours_total) }))
      .filter((x) => x.moyen > seuil).sort((a, b) => b.moyen - a.moyen);
    return { seuil, moyen_7: moyen(semaine), moyen_30: moyen(l), lourdes: lourdes.slice(0, 8), lourdes_n: lourdes.length };
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
    const echecs = this.echecs({ jours: 7 }).par_projet;
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
        technique: { fichiers_modifies: a.fichiers_modifies ?? 0, amont: a.amont ?? null, en_avance: a.en_avance ?? null, en_retard: a.en_retard ?? null, dernier_fetch: a.dernier_fetch ?? null, integration_continue: a.integration_continue ?? null },
        dernier_commit: a.dernier_commit ? { at: a.dernier_commit, sujet: a.dernier_sujet ?? null } : null,
        arbre: ns.length > 0,
        etape: courante ? { id: courante.id, numero: courante.attributes.etape, titre: courante.name, close: close(courante), faits: faits.length,
          dernier_fait: faits.at(-1) || null, reste: av.filter((e) => e.etiquette.startsWith('Reste')).flatMap((e) => (e.sous.length ? e.sous : [e.texte]).filter(Boolean)) } : null,
        questions: racine?.attributes?.questions_ouvertes || [],
        // Idées de l'étape en cours : celles dont la phase visée commence par elle (« étape 3, récolte »), ni prises ni écartées.
        idees: courante ? (racine?.attributes?.idees || []).filter((i) => new RegExp(`^étape ${courante.attributes.etape}\\b`, 'i').test(i.phase || '')
          && !/^(prise|écartée)/.test(i.statut || '')) : [],
        decisions: ns.filter((n) => n.attributes?.type === 'decision' && n.attributes?.statut === 'draft').map((n) => ({ id: n.id, titre: n.name })),
        activite: act,
        ecarts: ecarts.get(f.id) || 0,
        echecs_7: echecs[f.id] || null,
      };
      const attente = p.questions.length + p.decisions.length + p.technique.fichiers_modifies + (p.technique.en_avance || 0) + p.ecarts;
      p.calme = !act && !attente;
      p.recent = [act?.derniere_session, p.dernier_commit?.at].filter(Boolean).sort().at(-1) || null;
      return p;
    });
    liste.sort((x, y) => (y.recent || '').localeCompare(x.recent || '') || x.nom.localeCompare(y.nom));
    return { projets: liste, hors_projet: activite.get(null) || null };
  }

  // Échecs d'une période (décision echecs-au-journal) : erreurs d'outil par motif, programme et outil, refus de la garde
  // (un par commit refusé), tests lancés et rouges (dernière fin de chaque session qui en porte). Par projet : les échecs
  // des sessions qui y ont travaillé (même attribution que la vue Projets, sans partage : un échec ne se divise pas) et
  // les refus de la garde dans son dépôt. Le tableau de bord et la carte d'un projet lisent ce seul compte.
  echecs({ jours = 30 } = {}) {
    const d = new Date(Date.now() - jours * 864e5).toISOString();
    const projetsDeSession = this.attribution();
    const r = { total: 0, par_motif: {}, par_programme: {}, par_outil: {}, tests: { lances: 0, rouges: 0 }, par_projet: {} };
    const pp = (id) => (r.par_projet[id] ||= { n: 0, tests_rouges: 0, garde: 0 });
    const plus = (o, k) => { if (k != null) o[k] = (o[k] || 0) + 1; };
    const projetsDe = (corr) => projetsDeSession(String(corr).split(':')[0]).map((p) => p.id);
    for (const e of this.index.requete("SELECT correlation, json_extract(data,'$.motif') motif, json_extract(data,'$.programme') programme, json_extract(data,'$.outil') outil FROM evenements WHERE kind='tool.failed' AND at>=?", d)) {
      if (e.motif === 'garde') continue; // compté par `rule.enforced`
      r.total++; plus(r.par_motif, e.motif); plus(r.par_programme, e.programme); plus(r.par_outil, e.outil);
      for (const id of projetsDe(e.correlation)) pp(id).n++;
    }
    for (const e of this.index.requete("SELECT DISTINCT at, subject FROM evenements WHERE kind='rule.enforced' AND at>=?", d)) {
      r.total++; plus(r.par_motif, 'garde');
      if (e.subject) { pp(e.subject).n++; pp(e.subject).garde++; }
    }
    const vues = new Set();
    for (const e of this.index.requete("SELECT correlation, json_extract(data,'$.tests') tests FROM evenements WHERE kind='session.finished' AND json_extract(data,'$.tests') IS NOT NULL AND at>=? ORDER BY at DESC, id DESC", d)) {
      if (vues.has(e.correlation)) continue; vues.add(e.correlation);
      const t = JSON.parse(e.tests); r.tests.lances += t.lances || 0; r.tests.rouges += t.rouges || 0;
      if (t.rouges) for (const id of projetsDe(e.correlation)) pp(id).tests_rouges += t.rouges;
    }
    const classe = (o, n) => Object.entries(o).map(([cle, x]) => ({ cle, n: x })).sort((a, b) => b.n - a.n).slice(0, n);
    return { ...r, par_motif: classe(r.par_motif, 20), par_programme: classe(r.par_programme, 8), par_outil: classe(r.par_outil, 8) };
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
        proposees: r.regles.filter(aApprouver).length, rappels: r.rappels, signaux: r.signaux.length, ecarts: ouverts.filter((o) => o.projet === p.id).length }));
    return { compte: { ...portees(regleDuCompte(fiches), 'sensitive'), ecarts: ouverts.filter((o) => !o.projet) }, projets: resume };
  }

  // ---------- contrôles et audit (étape 3, tranches 4 et 5) : module audit ----------
  contexteControle(projet, r, depot) { return contexteControle(this, projet, r, depot); }
  garde(o) { return garde(this, o); }
  ecartsOuverts() { return ecartsOuverts(this); }
  audit(o) { return audit(this, o); }

  // Récolte (étape 3, tranche 11) : consignes redites d'une session ou d'un projet à l'autre. Les règles passées au
  // regroupement : toutes, proposées et refusées comprises (une redite déjà proposée ou refusée ne revient pas) ; pour
  // rejouer le passé, seules celles qui étaient approuvées à la fin de la période, sans quoi on donnerait le corrigé.
  // `proposer` (décision recolte) : chaque redite nouvelle devient une règle brouillon au nœud commun de ses sources.
  recolte({ depuis = null, jusqua = null, seuil = 2, aBlanc = false, proposer = false, modele, budget, regroupeur = null } = {}) {
    if (proposer && jusqua) throw new Error('on ne propose pas depuis un rejeu du passé (--jusqua)');
    const garde = (r) => (jusqua ? r.attributes?.statut === 'stable' && String(r.attributes?.approuve?.at ?? '').slice(0, 10) < jusqua.slice(0, 10) : true);
    const regles = [...new Map(this.fiches({ kind: 'rule' }).filter(garde)
      .map((r) => [r.name, { id: r.name, enonce: r.attributes.enonce, statut: r.attributes.statut }])).values()];
    const o = this.config.import?.['claude-code-transcriptions'] || {};
    const reglages = this.config.controles || {};
    const r = recolter({ comptes: comptesClaudeCode(this.config, o), fiches: this.fiches({ kind: 'memory' }), projets: projetsDe(this.fiches({ kind: 'project' })), regles,
      gitleaksBin: trouverOutil('gitleaks', reglages.gitleaks), regroupeur: regroupeur || regroupeurClaude({ claude: binaireClaude(this.config), config: this.config, modele, budget }),
      depuis, jusqua, seuil, aBlanc });
    if (!proposer || !r.redites) return r;
    return { ...r, propositions: this.proposerRegles(r.redites) };
  }

  // Écrit les règles brouillon d'une récolte dans le `rules.yaml` de leur nœud : la racine du profil, ou celle de l'arbre
  // du projet, posée s'il n'en a pas (comme à la création). Rien n'est commité : l'auteur approuve, puis on commite.
  proposerRegles(redites, { at = new Date().toISOString().slice(0, 10) } = {}) {
    const t = trier(redites);
    const a = arbresDe(this.fiches());
    const projets = new Map(this.fiches({ kind: 'project' }).map((p) => [p.id, p]));
    const parFichier = new Map(); const sans = [];
    for (const g of t.proposees) {
      let fichier = null;
      if (g.noeud.profil) fichier = a.profils.length === 1 ? path.join(path.dirname(a.profils[0].location), 'rules.yaml') : null;
      else {
        const p = projets.get(g.noeud.projet);
        if (p?.location) {
          let racine = racineArbre(p.location);
          if (!racine) {
            const index = path.join(p.location, 'arbre', 'index.md');
            fs.mkdirSync(path.dirname(index), { recursive: true });
            fs.writeFileSync(index, racineIndex({ nom: p.name, description: p.description || p.name, types: [], journal: null }));
            racine = racineArbre(p.location);
          }
          fichier = path.join(racine.dossier, 'rules.yaml');
        }
      }
      if (!fichier) { sans.push({ id: g.id, raison: g.noeud.profil ? `profil introuvable ou multiple (${a.profils.length})` : `projet sans dépôt connu : ${g.noeud.nom}` }); continue; }
      if (!parFichier.has(fichier)) parFichier.set(fichier, []);
      parFichier.get(fichier).push(regleProposee(g, at));
    }
    const ecrites = []; const deja = [];
    for (const [fichier, regles] of parFichier) {
      const e = ajouterRegles(fichier, regles);
      ecrites.push(...e.ecrites.map((id) => ({ id, fichier }))); deja.push(...e.deja.map((id) => ({ id, fichier })));
    }
    return { ecrites, deja, sans_noeud: sans, a_trancher: t.a_trancher.map((g) => ({ id: g.id, consigne: g.consigne, contredit: g.contredit })), couvertes: t.couvertes.length };
  }

  arbre() {
    const noms = new Map(projetsDe(this.fiches({ kind: 'project' })).map((p) => [p.id, p.nom]));
    return this.fiches({ kind: 'node' }).map((f) => ({ id: f.id, chemin: f.node, titre: f.name, description: f.description, type: f.attributes?.type, statut: f.attributes?.statut, version: f.version,
      projet: f.links?.project?.[0] ? { id: f.links.project[0], nom: noms.get(f.links.project[0]) ?? null } : null, parent: (f.links?.derives_from || [])[0] || null, approuve: f.attributes?.approuve || null }));
  }
}
