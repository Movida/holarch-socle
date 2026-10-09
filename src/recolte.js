// Récolte (architecture §5.2, étape 3, tranche 11) : repérer les consignes que l'auteur redit d'une session ou d'un
// projet à l'autre. Deux temps (choix de l'auteur, 2026-10-07) : une extraction déterministe des candidats (messages de
// l'auteur dans les transcriptions, mémoires `feedback` que Claude Code a écrites quand il était corrigé), puis un
// regroupement par sens confié au runtime lui-même (`claude -p`, P2), qui rend des groupes en JSON validé par un schéma.
// Le compte des redites (sessions, projets) reste au code, jamais au modèle. Une mesure lexicale du 2026-10-07 n'a trouvé
// aucune consigne redite : elles reviennent reformulées. Rien de ce qui est lu n'est copié au journal.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import YAML from 'yaml';
import { fichiers } from './import/claude-code-transcriptions.js';
import { localiserProjet } from './projets.js';
import { gitleaks } from './controles.js';
import { claudeIntrouvable } from './commun.js';

// Un message de l'auteur trop court est un acquiescement ou une relance (« oui », « reprends ») ; trop long, un collage.
const MIN = 25; const MAX = 2000;
// Textes que le système dépose comme s'ils venaient de l'auteur : enveloppes de commande, notifications, retours de
// crochet, métadonnées d'image, interruptions.
const INJECTE = /^(?:<|\[Request interrupted|\[Image[: ]|Stop hook feedback|Caveat: |This session is being continued)/;

const texteDe = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x?.type === 'text').map((x) => x.text).join('\n') : '');
const dansPeriode = (at, depuis, jusqua) => Boolean(at) && (!depuis || at >= depuis) && (!jusqua || at < jusqua);

/**
 * Messages de l'auteur dans les transcriptions des comptes, sur une période ([depuis, jusqua[, dates ISO) : ni les
 * sous-agents (leurs invites viennent d'un agent), ni les textes injectés ; un message recopié par une session reprise
 * (même `uuid`) ne compte qu'une fois.
 */
export function messagesAuteur(comptes, { depuis = null, jusqua = null, projetDe = () => null } = {}) {
  const vus = new Set(); const out = [];
  for (const c of comptes) {
    for (const f of fichiers(c.home)) {
      if (f.includes(`${path.sep}subagents${path.sep}`)) continue;
      for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
        if (!l.includes('"type":"user"')) continue;
        let e; try { e = JSON.parse(l); } catch { continue; }
        if (e.type !== 'user' || e.isMeta || e.isSidechain || e.isCompactSummary || !dansPeriode(e.timestamp, depuis, jusqua)) continue;
        const t = texteDe(e.message?.content).trim();
        if (t.length < MIN || t.length > MAX || INJECTE.test(t)) continue;
        const cle = e.uuid || `${e.sessionId}:${t}`;
        if (vus.has(cle)) continue;
        vus.add(cle);
        const p = projetDe(e.cwd);
        out.push({ type: 'message', session: e.sessionId || null, projet: p ? { id: p.id, nom: p.nom } : null, at: e.timestamp, texte: t });
      }
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Mémoires `feedback` du catalogue modifiées dans la période : leur corps, sans l'en-tête. */
export function memoiresRetour(fiches, { depuis = null, jusqua = null, noms = new Map() } = {}) {
  return fiches.filter((f) => f.kind === 'memory' && f.attributes?.type === 'feedback' && dansPeriode(f.attributes?.modifie, depuis, jusqua)).flatMap((f) => {
    let t; try { t = fs.readFileSync(f.location, 'utf8'); } catch { return []; }
    t = t.replace(/^---\n[\s\S]*?\n---\n/, '').trim().slice(0, MAX);
    const id = f.links?.project?.[0] || null;
    return t ? [{ type: 'memoire', session: null, memoire: f.id, projet: id ? { id, nom: noms.get(id) ?? null } : null, at: f.attributes.modifie, texte: `${f.name} : ${t}` }] : [];
  });
}

/**
 * Candidats où gitleaks voit un secret possible : retirés avant tout envoi. gitleaks absent ou en panne : rien ne
 * part (un contrôle indisponible ne se dit jamais « rien trouvé »).
 */
export function sansSecrets(candidats, bin) {
  if (!bin) return { indisponible: 'gitleaks absent (réglage controles.gitleaks, PATH ou ~/.local/bin)' };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-recolte-'));
  try {
    candidats.forEach((c, i) => fs.writeFileSync(path.join(tmp, `${i}.txt`), c.texte));
    const r = gitleaks(bin, ['dir', tmp]);
    if (r.indisponible) return r;
    const exclus = new Set(r.trouves.map((t) => Number(path.basename(t.File, '.txt'))));
    return { candidats: candidats.filter((_, i) => !exclus.has(i)), retires: exclus.size };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

export const SCHEMA = {
  type: 'object',
  properties: {
    groupes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9]+(-[a-z0-9]+)*$', description: 'identifiant court de la consigne, en kebab-case, en français' },
          consigne: { type: 'string', description: 'la consigne, en une phrase impérative courte, générale' },
          pourquoi: { type: 'string', description: 'sa raison en une phrase, générale, sans citer l’auteur' },
          refs: { type: 'array', items: { type: 'string' }, description: 'références des éléments du groupe' },
          couverte_par: { type: ['string', 'null'], description: 'identifiant de la règle existante qui la couvre, sinon null' },
          contredit: { type: 'array', items: { type: 'string' }, description: 'identifiants des règles existantes ou des autres groupes qu’elle contredit' },
        },
        required: ['id', 'consigne', 'pourquoi', 'refs', 'couverte_par', 'contredit'],
      },
    },
  },
  required: ['groupes'],
};

export const CONSIGNE = `Tu reçois des éléments écrits par l'auteur d'un système d'agents de code : ses messages aux agents, et des notes de retour qu'un agent a gardées après avoir été corrigé. Chaque élément porte une référence entre crochets.
Repère les consignes durables : ce que l'auteur demande en général sur la façon de travailler (méthode, vérification, forme des réponses, ton, ce qu'il faut toujours faire ou éviter), au-delà de la tâche du moment. Ignore les demandes ponctuelles, les questions, les acquiescements et les faits propres à une tâche.
Regroupe les éléments qui expriment la même consigne, même formulée autrement. Pour chaque groupe d'au moins deux éléments : un identifiant court en kebab-case, la consigne en une phrase impérative courte en français, générale (sans nom de projet ni de personne), sa raison en une phrase (sans citer l'auteur), les références de ses éléments, l'identifiant de la règle existante qui la dit déjà (liste fournie ; une règle proposée ou refusée compte comme existante), sinon null, et les identifiants des règles existantes ou des autres groupes qu'elle contredit (liste vide sinon). Un élément peut n'appartenir à aucun groupe ; ne crée pas de groupe d'un seul élément.`;

/** Le texte envoyé au modèle : les règles existantes (identifiant et énoncé), puis les candidats référencés. */
export function invite(candidats, regles) {
  const etat = { draft: ' (proposée)', deprecated: ' (refusée)' };
  const r = regles.length ? regles.map((x) => `- ${x.id}${etat[x.statut] || ''} : ${x.enonce}`).join('\n') : '(aucune)';
  const c = candidats.map((x, i) => `[${x.type === 'memoire' ? 'n' : 'm'}${i}] ${x.texte.replace(/\s+/g, ' ')}`).join('\n');
  return `Règles existantes :\n${r}\n\nÉléments :\n${c}\n`;
}

/** Regroupement par `claude -p` : sans outils, sans serveur MCP, sans session gardée, dépense plafonnée. */
export function regroupeurClaude({ claude, config = null, modele = 'sonnet', budget = 1, delai = 600e3, dossier = os.tmpdir() }) {
  return (texte) => {
    if (!claude) throw new Error(claudeIntrouvable(config));
    const r = spawnSync(claude, ['-p', '--model', modele, '--output-format', 'json', '--no-session-persistence', '--tools', '',
      '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', 'project', '--max-budget-usd', String(budget),
      '--system-prompt', CONSIGNE, '--json-schema', JSON.stringify(SCHEMA)], { input: texte, encoding: 'utf8', cwd: dossier, timeout: delai, maxBuffer: 64 * 1024 * 1024 });
    let o; try { o = JSON.parse(r.stdout); } catch { throw new Error(`claude -p en échec : ${(r.stderr || r.error?.message || `code ${r.status}`).trim().split('\n')[0]}`); }
    if (o.is_error || !o.structured_output) throw new Error(`claude -p sans résultat : ${o.subtype || 'inconnu'}${o.result ? ` (${String(o.result).slice(0, 200)})` : ''}`);
    return { groupes: o.structured_output.groupes || [], cout_usd: o.total_cost_usd ?? null, modele };
  };
}

/**
 * Redites : pour chaque groupe, les éléments que ses références désignent vraiment, leurs sessions et leurs projets
 * distincts (une mémoire compte comme une source à part). Un groupe est une redite à partir de `seuil` sessions ou de
 * deux projets ; les plus redites d'abord. `sources` : les sessions et mémoires, par référence, jamais par leur texte.
 */
export function redites(groupes, candidats, { seuil = 2 } = {}) {
  const parRef = (ref) => { const m = String(ref).match(/^\[?[mn](\d+)\]?$/); return m ? candidats[+m[1]] : undefined; };
  return groupes.map((g) => {
    const el = [...new Set(g.refs)].map(parRef).filter(Boolean);
    const sessions = new Set(el.map((e) => e.session || `memoire:${e.memoire}`));
    const projets = [...new Map(el.filter((e) => e.projet).map((e) => [e.projet.id, e.projet])).values()];
    return { id: g.id || null, consigne: g.consigne, pourquoi: g.pourquoi || null, couverte_par: g.couverte_par || null, contredit: [...new Set(g.contredit || [])],
      elements: el.length, sessions: sessions.size, sources: [...sessions].sort(), projets: projets.map((p) => p.nom || p.id), projets_ids: projets.map((p) => p.id),
      hors_projet: el.filter((e) => !e.projet).length, memoires: el.filter((e) => e.type === 'memoire').length,
      premiere: el.map((e) => e.at).sort()[0] || null, derniere: el.map((e) => e.at).sort().at(-1) || null };
  }).filter((g) => g.sessions >= seuil || g.projets.length >= 2)
    .sort((a, b) => b.sessions - a.sessions || b.projets.length - a.projets.length);
}

/**
 * Ce que deviennent les redites (décision recolte) : couverte par une règle existante, à trancher par l'auteur quand elle
 * en contredit une autre ou une règle, sinon proposée au plus bas nœud commun de ses sources (un seul projet et rien hors
 * projet : ce projet ; sinon le profil).
 */
export function trier(redites) {
  const r = { proposees: [], a_trancher: [], couvertes: [] };
  for (const g of redites) {
    if (g.couverte_par) r.couvertes.push(g);
    else if (g.contredit.length || !g.id) r.a_trancher.push(g);
    else r.proposees.push({ ...g, noeud: g.projets_ids.length === 1 && !g.hors_projet ? { projet: g.projets_ids[0], nom: g.projets[0] } : { profil: true } });
  }
  return r;
}

/** Une redite en règle brouillon (contrat règle §4) : sources par référence, niveau le plus bas qui s'écrit sans contrôle. */
export function regleProposee(g, at) {
  return { id: g.id, statement: g.consigne, why: g.pourquoi, level: 'reminder', status: 'draft', source: 'harvest',
    harvest: { at, sessions: g.sessions, ...(g.projets.length && { projects: g.projets }), first: g.premiere?.slice(0, 10) ?? null, last: g.derniere?.slice(0, 10) ?? null, refs: g.sources } };
}

/** Ajoute des règles à la fin d'un `rules.yaml` sans réécrire ce qui y est (commentaires compris) ; un `id` déjà présent n'est pas repris. */
export function ajouterRegles(fichier, regles) {
  const avant = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : '';
  const pris = new Set([].concat(YAML.parse(avant) || []).map((x) => x?.id));
  const neuves = regles.filter((x) => !pris.has(x.id));
  // La provenance d'une règle tient sur une ligne, comme `approved` : elle se lit sans masquer la règle.
  const doc = new YAML.Document(neuves);
  for (const r of doc.contents?.items || []) { const h = r.get('harvest', true); if (h) h.flow = true; }
  if (neuves.length) fs.writeFileSync(fichier, `${avant}${avant && !avant.endsWith('\n') ? '\n' : ''}${doc.toString({ lineWidth: 0 })}`);
  return { ecrites: neuves.map((x) => x.id), deja: regles.filter((x) => pris.has(x.id)).map((x) => x.id) };
}

/**
 * Récolte d'une période : candidats, secrets retirés, regroupement, redites. `aBlanc` : les candidats seulement, rien
 * n'est envoyé. `regles` : celles qui existaient à la fin de la période (pour rejouer le passé sans le corrigé).
 */
export function recolter({ comptes, fiches, projets, regles, gitleaksBin, regroupeur, depuis = null, jusqua = null, seuil = 2, aBlanc = false }) {
  const noms = new Map(projets.map((p) => [p.id, p.nom]));
  const tous = [...messagesAuteur(comptes, { depuis, jusqua, projetDe: localiserProjet(projets) }), ...memoiresRetour(fiches, { depuis, jusqua, noms })];
  const stats = (l) => ({ messages: l.filter((c) => c.type === 'message').length, memoires: l.filter((c) => c.type === 'memoire').length,
    sessions: new Set(l.map((c) => c.session).filter(Boolean)).size, projets: new Set(l.map((c) => c.projet?.id).filter(Boolean)).size,
    caracteres: l.reduce((t, c) => t + c.texte.length, 0) });
  const base = { periode: { depuis, jusqua }, candidats: stats(tous), regles: regles.length };
  const s = sansSecrets(tous, gitleaksBin);
  if (s.indisponible) return { ...base, indisponible: s.indisponible };
  base.secrets_retires = s.retires;
  if (aBlanc) return { ...base, a_blanc: true };
  const r = regroupeur(invite(s.candidats, regles));
  return { ...base, modele: r.modele, cout_usd: r.cout_usd, groupes: r.groupes.length, redites: redites(r.groupes, s.candidats, { seuil }) };
}
