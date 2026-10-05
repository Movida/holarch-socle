// Serveur MCP de HOLARCH (étape 2, décision forme-etape-2) : les lectures de l'interface, offertes aux agents. Lecture
// seule ; réponses bornées, pour ne pas noyer le contexte d'un agent. Sur stdio, rien ne doit écrire sur la sortie
// standard : c'est le canal du protocole.
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

const LECTURE = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const texte = (o) => ({ content: [{ type: 'text', text: JSON.stringify(o) }] });
const jours = z.number().int().min(1).max(3650).optional().describe('Période en jours (30 par défaut)');
const limite = (n, max) => z.number().int().min(1).max(max).optional().describe(`Nombre maximal de résultats (${n} par défaut, ${max} au plus)`);
// Une fiche résumée : ce qu'il faut pour choisir, le détail passe par `fiche`.
const resume = (f) => ({ id: f.id, kind: f.kind, name: f.name, description: f.description ?? null, status: f.status, location: f.location ?? null, projet: f.links?.project?.[0] ?? null });
// Un projet se désigne par son identifiant, son nom ou un chemin (décision rattachement-projet) ; le socle résout.
const projet = z.string().optional().describe('Projet : identifiant (holarch:project:…), nom ou chemin');

export function creerServeurMcp(socle, version) {
  const s = new McpServer({ name: 'holarch', version });

  s.registerTool('etat', {
    description: 'État du site HOLARCH sur une période : éléments en place par type, sessions, tokens et coût liste, modèles sans tarif, refus d’outil, usage de l’interface, anomalies à regarder.',
    inputSchema: z.object({ jours }), annotations: LECTURE,
  }, async ({ jours: j }) => { const e = socle.etat({ jours: j ?? 30 }); delete e.tokens; return texte(e); });

  s.registerTool('catalogue', {
    description: 'Éléments en place (skills, hooks, mémoires, connecteurs, projets, nœuds de l’arbre, conteneurs…), filtrés par type ou par texte. Ce qui n’y figure pas n’existe pas pour le système.',
    inputSchema: z.object({ kind: z.string().optional().describe('Type : skill, hook, memory, connector, project, node, container, volume…'), q: z.string().optional().describe('Texte cherché dans le nom, la description ou l’emplacement'), limite: limite(50, 500) }),
    annotations: LECTURE,
  }, async ({ kind, q, limite: n }) => { const f = socle.fiches({ kind: kind || null, q: q || null }); return texte({ total: f.length, fiches: f.slice(0, n ?? 50).map(resume) }); });

  s.registerTool('fiche', {
    description: 'Une fiche du catalogue en entier, avec ses derniers événements (historique de ses identifiants précédents compris).',
    inputSchema: z.object({ id: z.string().describe('Identifiant, par exemple holarch:skill:…') }), annotations: LECTURE,
  }, async ({ id }) => texte(socle.fiche(id) ?? { erreur: `fiche introuvable : ${id}` }));

  s.registerTool('sessions', {
    description: 'Sessions Claude Code d’une période, les plus récentes d’abord : projets (ceux où la session a travaillé), dossier de départ, durée, tours, sous-agents, refus, tokens, coût liste.',
    inputSchema: z.object({ jours, projet, limite: limite(30, 500) }), annotations: LECTURE,
  }, async ({ jours: j, projet: p, limite: n }) => {
    const l = socle.sessions({ jours: j ?? 30, projet: p || null });
    return texte({ total: l.length, sessions: l.slice(0, n ?? 30).map((x) => ({ session: x.session, fin: x.fin, projets: x.projets.map((q) => ({ id: q.id, nom: q.nom, n: q.n })), dossier: x.data.projet, branche: x.data.branche, duree_s: x.data.duree_s, tours: x.tours_total ?? x.data.tours, sous_agents: x.sous_agents, refus: x.refus, sortie: x.sortie, cache_lu: x.cache_lu, usd: x.usd, modeles: x.data.modeles })) });
  });

  s.registerTool('projets', {
    description: 'Suivi des projets (identifiés par leur dépôt Git) : étape en cours d’après leur arbre (faits, reste), questions ouvertes et décisions à approuver, activité sur 7 et 30 jours (sessions, coût liste partagé entre les projets où chaque session a travaillé), dernier commit, état du dépôt (non commité, non poussé, retard sur l’amont).',
    inputSchema: z.object({ projet, calmes: z.boolean().optional().describe('Inclure les projets sans activité ni attente (non par défaut)'), limite: limite(20, 200) }),
    annotations: LECTURE,
  }, async ({ projet: ref, calmes, limite: n }) => {
    const r = socle.projets(); const id = ref ? socle.projetDe(ref) : null;
    const l = r.projets.filter((p) => (id ? p.id === id : calmes || !p.calme));
    return texte({ total: l.length, hors_projet: r.hors_projet, projets: l.slice(0, n ?? 20) });
  });

  s.registerTool('consommation', {
    description: 'Tokens et coût liste d’une période, regroupés par projet (identifiant et nom ; le coût d’une session se partage entre ses projets, null : hors projet), par modèle ou par jour.',
    inputSchema: z.object({ jours, par: z.enum(['projet', 'modele', 'jour']).optional().describe('Regroupement (projet par défaut)') }), annotations: LECTURE,
  }, async ({ jours: j, par }) => texte(socle.consommation({ jours: j ?? 30, par: par ?? 'projet' })));

  s.registerTool('journal', {
    description: 'Événements du journal, les plus récents d’abord : par famille (session, cost, tool, element, inventory, ui) ou pour une session.',
    inputSchema: z.object({ kind: z.string().optional().describe('Famille ou type, par exemple tool ou tool.denied'), session: z.string().optional().describe('Identifiant de session'), limite: limite(50, 300) }),
    annotations: LECTURE,
  }, async ({ kind, session, limite: n }) => texte(socle.evenements({ kind: kind || null, session: session || null, limite: n ?? 50 })));

  s.registerTool('arbre', {
    description: 'Nœuds de l’arbre HOLARCH (intentions, contrats, décisions) avec leur type, leur statut (draft ou stable) et leur parent.',
    inputSchema: z.object({}), annotations: LECTURE,
  }, async () => texte(socle.arbre().map(({ id, chemin, titre, type, statut, version, parent }) => ({ id, chemin, titre, type, statut, version, parent }))));

  return s;
}

/** Sert HOLARCH en MCP sur stdio (`holarch mcp`), après avoir remis l'index à jour depuis le journal et le catalogue. */
export function servirStdio(socle, version) {
  socle.indexer();
  return serveStdio(() => creerServeurMcp(socle, version));
}
