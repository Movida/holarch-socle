// Adaptateur d'inventaire Claude Code : skills, agents, hooks, serveurs MCP, plugins, consignes (CLAUDE.md) et notes de
// mémoire, au niveau utilisateur et dans chaque dépôt connu. Un élément d'un projet porte le lien `project` (décision
// rattachement-projet) ; `nom`, le nom du dossier, ne sert qu'à l'identifiant et au libellé. Ne lit que des noms, descriptions et emplacements : jamais
// un argument de commande, une variable d'environnement, un jeton ou le contenu d'une note.
import fs from 'node:fs';
import path from 'node:path';
import { enTete, lireJson, liste, mtimeIso, premiereLigne, slug, urlSure, jeton } from './outils.js';
import { comptesClaudeCode } from '../config.js';
import { lienProjet } from '../projets.js';
import { cheminSansLien, lireSansLien } from '../commun.js';
import { debutDeTranscription } from '../transcription.js';

// Un élément d'aucun projet n'a pas de lien `project` (contrat fiche 0.4.0) : `links` vide disparaît.
const fiche = (kind, cle, name, { links, ...extra }, source = 'inventaire:claude-code') => ({
  id: `holarch:${kind}:${slug(cle)}`, kind, name: String(name), status: 'active',
  provenance: { source }, classification: 'internal', ...extra, ...(links && Object.keys(links).length && { links }),
});

// Dans un dépôt, que le conteneur écrit, rien ne se lit à travers un lien symbolique (`cheminSansLien` depuis sa racine,
// comme toute lecture dont le contenu sort) : un lien ferait entrer au catalogue un fichier ou un dossier de l'hôte (un
// `.claude` vers le `~/.claude` de l'hôte, par exemple). `depot` null : le compte, que seul l'hôte écrit.
const sansLien = (depot, f) => { if (!depot) return true; try { cheminSansLien(depot, path.relative(depot, f), 'lu'); return true; } catch { return false; } };
const jsonDe = (depot, f) => { try { return JSON.parse(lireSansLien(depot, path.relative(depot, f))); } catch { return null; } };

function skills(dossier, portee, nom, site, p = null, depot = null) {
  return liste(dossier, (d) => d.isDirectory()).flatMap((d) => {
    const f = path.join(dossier, d.name, 'SKILL.md');
    if (!fs.existsSync(f) || !sansLien(depot, f)) return [];
    const h = enTete(f, depot);
    return [fiche('skill', `${portee}/${nom || 'utilisateur'}/${d.name}`, h.name || d.name, {
      description: premiereLigne(h.description, 240), location: f, site, links: lienProjet(p), attributes: { portee, modifie: mtimeIso(f) } })];
  });
}

function agents(dossier, portee, nom, site, p = null, depot = null) {
  return liste(dossier, (d) => d.isFile() && d.name.endsWith('.md')).flatMap((d) => {
    const f = path.join(dossier, d.name); if (!sansLien(depot, f)) return [];
    const h = enTete(f, depot);
    return fiche('agent_profile', `${portee}/${nom || 'utilisateur'}/${d.name}`, h.name || d.name.replace(/\.md$/, ''), {
      description: premiereLigne(h.description, 240), location: f, site, links: lienProjet(p), attributes: { portee, modele: h.model || null, outils: h.tools || null } });
  });
}

// Le nom affiché d'un crochet : le premier mot qui a l'air d'un chemin, sinon le premier mot, jamais un mot qui porte une
// valeur (`CLE=valeur`) ou qui a l'allure d'un jeton (`jeton`) : ce peut être un secret, qui entrerait au catalogue (X5).
// Un interpréteur (`node …/holarch.js`, `/usr/bin/env node …`) cède la place au premier chemin qui n'en est pas un : le
// script qu'il lance, que tous les crochets de HOLARCH auraient sinon caché derrière « node ».
const net = (t) => t.replace(/^["']+|["';]+$/g, '');
const INTERPRETE = /^(env|node|nodejs|bun|deno|python[\d.]*|ruby|perl|php|sh|bash|dash|zsh)$/;
function hooks(settings, fichier, portee, nom, site, p = null) {
  const h = (settings && settings.hooks) || {};
  return Object.entries(h).flatMap(([evt, groupes]) => (Array.isArray(groupes) ? groupes : []).flatMap((g, i) => (g.hooks || []).map((x, j) => {
    const mots = String(x.command || x.type || '').split(/\s+/).filter((t) => t && !t.includes('=') && !jeton(path.basename(net(t))));
    const chemins = mots.filter((t) => /[/.]/.test(t) && !t.startsWith('-')).map(net);
    const exe = chemins.find((t) => !INTERPRETE.test(path.basename(t))) || chemins[0] || net(mots[0] || '');
    return fiche('hook', `${portee}/${nom || 'utilisateur'}/${evt}/${i}/${j}`, `${evt}${g.matcher ? ` · ${g.matcher}` : ''}`, {
      description: `${x.type || 'command'} : ${path.basename(exe || '')}`, location: fichier, site, links: lienProjet(p), attributes: { portee, evenement: evt, matcher: g.matcher || null } });
  })));
}

// Nom d'un serveur tel qu'il apparaît dans les outils (mcp__<serveur>__<outil>) : « claude.ai Gmail » → claude_ai_Gmail.
export { cleServeur } from '../commun.js';
import { cleServeur } from '../commun.js';

/** Serveurs MCP d'un fichier de configuration (forme `mcpServers`, commune à Claude Code et Claude Desktop). */
export function mcp(serveurs, fichier, portee, nom, site, source, p = null) {
  return Object.entries(serveurs || {}).map(([serveur, s]) => fiche('connector', `mcp/${portee}/${nom || 'utilisateur'}/${serveur}`, serveur, {
    description: s.url ? `MCP ${s.type || 'http'} ${urlSure(s.url, { origine: true })}` : `MCP stdio : ${path.basename(String(s.command || '?'))}`,
    location: fichier, site, links: lienProjet(p), attributes: { portee, transport: s.type || (s.url ? 'http' : 'stdio') } }, source));
}

function consignes(f, portee, nom, site, p = null, depot = null) {
  let t; try { t = depot ? lireSansLien(depot, path.relative(depot, f)) : fs.readFileSync(f, 'utf8'); } catch { return []; }
  if (t === null) return [];
  const lignes = t.split('\n').length;
  return [fiche('instructions', `${portee}/${nom || 'utilisateur'}/${path.basename(f)}`, `${path.basename(f)}${nom ? ` · ${nom}` : ''}`, {
    description: `${lignes} lignes`, location: f, site, links: lienProjet(p), attributes: { portee, lignes, modifie: mtimeIso(f) } })];
}

// Le dossier d'un projet Claude Code encode son répertoire de travail (`/` devient `-`), ce qui ne se décode pas sans
// ambiguïté : le vrai répertoire se lit dans une transcription du même dossier, que le conteneur écrit (sans suivre de
// lien posé après le listage, ni attendre sur un FIFO : `debutDeTranscription`).
function repertoireDe(dossier) {
  for (const x of liste(dossier, (e) => e.isFile() && e.name.endsWith('.jsonl'))) {
    const m = debutDeTranscription(path.join(dossier, x.name), 65536).match(/"cwd":"((?:[^"\\]|\\.)*)"/);
    if (m) return JSON.parse(`"${m[1]}"`);
  }
  return null;
}

function memoires(home, site, projetDe) {
  const projets = path.join(home, 'projects');
  return liste(projets, (d) => d.isDirectory()).flatMap((d) => {
    const m = path.join(projets, d.name, 'memory');
    // Un dossier de mémoire qui n'est qu'un lien (ancienne clé de projet renvoyant à la nouvelle) est déjà inventorié à sa
    // vraie place : le compter deux fois créerait de faux doublons.
    try { if (fs.lstatSync(m).isSymbolicLink()) return []; } catch { return []; }
    const cwd = repertoireDe(path.join(projets, d.name));
    // Le conteneur écrit la mémoire de son projet : le listage écarte les liens, la lecture se garde aussi depuis le
    // dossier des projets du compte (`enTete` avec sa racine) contre un lien ou un FIFO posé après lui.
    return liste(m, (x) => x.isFile() && x.name.endsWith('.md') && x.name !== 'MEMORY.md').map((x) => {
      const f = path.join(m, x.name); const h = enTete(f, projets);
      const type = h.type || h.metadata?.type || null;
      return fiche('memory', `${d.name}/${x.name}`, h.name || x.name.replace(/\.md$/, ''), {
        description: premiereLigne(h.description, 240), location: f, site, links: lienProjet(projetDe(cwd)),
        attributes: { dossier: cwd ? path.basename(cwd) : null, projet_claude: d.name, type, modifie: mtimeIso(f) } });
    });
  });
}

// Ce qui relève d'un compte (niveau utilisateur, mémoires, connecteurs claude.ai). Avec plusieurs comptes, chaque fiche
// porte le compte dans son identifiant et ses attributs : un même projet ou une même skill existe dans chacun.
function compte({ nom, home, config }, site, projetDe) {
  const out = [];
  if (home && fs.existsSync(home)) {
    out.push(...skills(path.join(home, 'skills'), 'utilisateur', null, site));
    out.push(...agents(path.join(home, 'agents'), 'utilisateur', null, site));
    const f = path.join(home, 'settings.json');
    out.push(...hooks(lireJson(f), f, 'utilisateur', null, site));
    out.push(...consignes(path.join(home, 'CLAUDE.md'), 'utilisateur', null, site));
    out.push(...memoires(home, site, projetDe));
    const plug = lireJson(path.join(home, 'plugins', 'installed_plugins.json'));
    for (const [nom, v] of Object.entries(plug?.plugins || {})) out.push(fiche('plugin', nom, nom, { site, location: path.join(home, 'plugins'), description: Array.isArray(v) ? `${v.length} installation(s)` : null }));
    for (const m of liste(path.join(home, 'plugins', 'marketplaces'), (d) => d.isDirectory())) out.push(fiche('plugin_marketplace', m.name, m.name, { site, location: path.join(home, 'plugins', 'marketplaces', m.name) }));
  }
  const cfg = config ? lireJson(config) : null;
  if (cfg) {
    out.push(...mcp(cfg.mcpServers, config, 'utilisateur', null, site));
    for (const [p, v] of Object.entries(cfg.projects || {})) out.push(...mcp(v.mcpServers, config, 'local', path.basename(p), site, undefined, projetDe(p)));
  }
  // Connecteurs claude.ai : distants, gérés par le compte, absents des fichiers de configuration ; Claude Code n'en
  // garde localement que les noms déjà utilisés. Les appels au journal complètent : tout serveur appelé a sa fiche.
  for (const n of cfg?.claudeAiMcpEverConnected || []) {
    out.push(fiche('connector', `mcp/claude.ai/${n}`, n, { description: 'connecteur claude.ai (distant, géré par le compte)', location: 'claude.ai', site,
      attributes: { portee: 'claude.ai', transport: 'http', distant: true } }));
  }
  if (!nom) return out;
  return out.map((f) => {
    const debut = `holarch:${f.kind}:`;
    return { ...f, id: `${debut}${slug(nom)}/${f.id.slice(debut.length)}`, attributes: { ...(f.attributes || {}), compte: nom } };
  });
}

export default function inventaireClaudeCode(options, ctx) {
  const site = ctx.site;
  const projetDe = ctx.projetDe || (() => null);
  const out = [];
  for (const c of ctx.comptes || comptesClaudeCode({}, options)) out.push(...compte(c, site, projetDe));
  for (const depot of ctx.depots || []) {
    const nom = path.basename(depot); const p = projetDe(depot);
    out.push(...skills(path.join(depot, '.claude', 'skills'), 'projet', nom, site, p, depot));
    out.push(...agents(path.join(depot, '.claude', 'agents'), 'projet', nom, site, p, depot));
    const s = path.join(depot, '.claude', 'settings.json');
    out.push(...hooks(jsonDe(depot, s), s, 'projet', nom, site, p));
    out.push(...mcp(jsonDe(depot, path.join(depot, '.mcp.json'))?.mcpServers, path.join(depot, '.mcp.json'), 'projet', nom, site, undefined, p));
    out.push(...consignes(path.join(depot, 'CLAUDE.md'), 'projet', nom, site, p, depot));
  }
  const appels = ctx.appelsMcp || new Map();
  const vus = new Set();
  for (const f of out) {
    if (f.kind !== 'connector') continue;
    const u = appels.get(cleServeur(f.name));
    if (u) { f.usage = { count: u.count, last_used: u.last_used, cost_usd: null }; vus.add(cleServeur(f.name)); }
  }
  for (const [serveur, u] of appels) {
    if (vus.has(serveur)) continue;
    out.push(fiche('connector', `mcp/vu/${serveur}`, serveur, { description: 'serveur MCP vu dans les appels ; sa configuration n’est pas sur ce site', site,
      usage: { count: u.count, last_used: u.last_used, cost_usd: null }, attributes: { portee: 'vu', transport: null } }));
  }
  return out;
}
