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
import { fichiers } from './import/claude-code-transcriptions.js';
import { localiserProjet } from './projets.js';
import { gitleaks } from './controles.js';

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
          consigne: { type: 'string', description: 'la consigne, en une phrase impérative courte, générale' },
          refs: { type: 'array', items: { type: 'string' }, description: 'références des éléments du groupe' },
          couverte_par: { type: ['string', 'null'], description: 'identifiant de la règle existante qui la couvre, sinon null' },
        },
        required: ['consigne', 'refs', 'couverte_par'],
      },
    },
  },
  required: ['groupes'],
};

export const CONSIGNE = `Tu reçois des éléments écrits par l'auteur d'un système d'agents de code : ses messages aux agents, et des notes de retour qu'un agent a gardées après avoir été corrigé. Chaque élément porte une référence entre crochets.
Repère les consignes durables : ce que l'auteur demande en général sur la façon de travailler (méthode, vérification, forme des réponses, ton, ce qu'il faut toujours faire ou éviter), au-delà de la tâche du moment. Ignore les demandes ponctuelles, les questions, les acquiescements et les faits propres à une tâche.
Regroupe les éléments qui expriment la même consigne, même formulée autrement. Pour chaque groupe d'au moins deux éléments : la consigne en une phrase impérative courte en français, générale (sans nom de projet ni de personne), les références de ses éléments, et l'identifiant de la règle existante qui la dit déjà (liste fournie), sinon null. Un élément peut n'appartenir à aucun groupe ; ne crée pas de groupe d'un seul élément.`;

/** Le texte envoyé au modèle : les règles existantes (identifiant et énoncé), puis les candidats référencés. */
export function invite(candidats, regles) {
  const r = regles.length ? regles.map((x) => `- ${x.id} : ${x.enonce}`).join('\n') : '(aucune)';
  const c = candidats.map((x, i) => `[${x.type === 'memoire' ? 'n' : 'm'}${i}] ${x.texte.replace(/\s+/g, ' ')}`).join('\n');
  return `Règles existantes :\n${r}\n\nÉléments :\n${c}\n`;
}

/** Regroupement par `claude -p` : sans outils, sans serveur MCP, sans session gardée, dépense plafonnée. */
export function regroupeurClaude({ claude, modele = 'sonnet', budget = 1, delai = 600e3, dossier = os.tmpdir() }) {
  return (texte) => {
    if (!claude) throw new Error('claude introuvable (PATH ou ~/.local/bin)');
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
 * deux projets ; les plus redites d'abord.
 */
export function redites(groupes, candidats, { seuil = 2 } = {}) {
  const parRef = (ref) => { const m = String(ref).match(/^\[?[mn](\d+)\]?$/); return m ? candidats[+m[1]] : undefined; };
  return groupes.map((g) => {
    const el = [...new Set(g.refs)].map(parRef).filter(Boolean);
    const sessions = new Set(el.map((e) => e.session || `memoire:${e.memoire}`));
    const projets = [...new Map(el.filter((e) => e.projet).map((e) => [e.projet.id, e.projet])).values()];
    return { consigne: g.consigne, couverte_par: g.couverte_par || null, elements: el.length, sessions: sessions.size, projets: projets.map((p) => p.nom || p.id),
      hors_projet: el.filter((e) => !e.projet).length, memoires: el.filter((e) => e.type === 'memoire').length,
      premiere: el.map((e) => e.at).sort()[0] || null, derniere: el.map((e) => e.at).sort().at(-1) || null };
  }).filter((g) => g.sessions >= seuil || g.projets.length >= 2)
    .sort((a, b) => b.sessions - a.sessions || b.projets.length - a.projets.length);
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
