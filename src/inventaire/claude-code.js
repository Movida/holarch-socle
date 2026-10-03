// Adaptateur d'inventaire Claude Code : skills, agents, hooks, serveurs MCP, plugins, consignes (CLAUDE.md) et notes de
// mémoire, au niveau utilisateur et dans chaque dépôt connu. Ne lit que des noms, descriptions et emplacements : jamais
// un argument de commande, une variable d'environnement, un jeton ou le contenu d'une note.
import fs from 'node:fs';
import path from 'node:path';
import { enTete, lireJson, liste, mtimeIso, premiereLigne, slug, urlSure } from './outils.js';

const fiche = (kind, cle, name, extra) => ({
  id: `holarch:${kind}:${slug(cle)}`, kind, name: String(name), status: 'active',
  provenance: { source: 'inventaire:claude-code' }, classification: 'internal', ...extra,
});

function skills(dossier, portee, projet, site) {
  return liste(dossier, (d) => d.isDirectory()).flatMap((d) => {
    const f = path.join(dossier, d.name, 'SKILL.md');
    if (!fs.existsSync(f)) return [];
    const h = enTete(f);
    return [fiche('skill', `${portee}/${projet || 'utilisateur'}/${d.name}`, h.name || d.name, {
      description: premiereLigne(h.description, 240), location: f, site, attributes: { portee, projet, modifie: mtimeIso(f) } })];
  });
}

function agents(dossier, portee, projet, site) {
  return liste(dossier, (d) => d.isFile() && d.name.endsWith('.md')).map((d) => {
    const f = path.join(dossier, d.name); const h = enTete(f);
    return fiche('agent_profile', `${portee}/${projet || 'utilisateur'}/${d.name}`, h.name || d.name.replace(/\.md$/, ''), {
      description: premiereLigne(h.description, 240), location: f, site, attributes: { portee, projet, modele: h.model || null, outils: h.tools || null } });
  });
}

function hooks(settings, fichier, portee, projet, site) {
  const h = (settings && settings.hooks) || {};
  return Object.entries(h).flatMap(([evt, groupes]) => (Array.isArray(groupes) ? groupes : []).flatMap((g, i) => (g.hooks || []).map((x, j) => {
    const cmd = String(x.command || x.type || '');
    const exe = cmd.split(/\s+/).find((t) => /[/.]/.test(t) && !t.startsWith('-')) || cmd.split(/\s+/)[0];
    return fiche('hook', `${portee}/${projet || 'utilisateur'}/${evt}/${i}/${j}`, `${evt}${g.matcher ? ` · ${g.matcher}` : ''}`, {
      description: `${x.type || 'command'} : ${path.basename(exe || '')}`, location: fichier, site, attributes: { portee, projet, evenement: evt, matcher: g.matcher || null } });
  })));
}

function mcp(serveurs, fichier, portee, projet, site) {
  return Object.entries(serveurs || {}).map(([nom, s]) => fiche('connector', `mcp/${portee}/${projet || 'utilisateur'}/${nom}`, nom, {
    description: s.url ? `MCP ${s.type || 'http'} ${urlSure(s.url)}` : `MCP stdio : ${path.basename(String(s.command || '?'))}`,
    location: fichier, site, attributes: { portee, projet, transport: s.type || (s.url ? 'http' : 'stdio') } }));
}

function consignes(f, portee, projet, site) {
  if (!fs.existsSync(f)) return [];
  const lignes = fs.readFileSync(f, 'utf8').split('\n').length;
  return [fiche('instructions', `${portee}/${projet || 'utilisateur'}/${path.basename(f)}`, `${path.basename(f)}${projet ? ` · ${projet}` : ''}`, {
    description: `${lignes} lignes`, location: f, site, attributes: { portee, projet, lignes, modifie: mtimeIso(f) } })];
}

function memoires(home, site) {
  const projets = path.join(home, 'projects');
  return liste(projets, (d) => d.isDirectory()).flatMap((d) => {
    const m = path.join(projets, d.name, 'memory');
    return liste(m, (x) => x.isFile() && x.name.endsWith('.md') && x.name !== 'MEMORY.md').map((x) => {
      const f = path.join(m, x.name); const h = enTete(f);
      const type = h.type || h.metadata?.type || null;
      return fiche('memory', `${d.name}/${x.name}`, h.name || x.name.replace(/\.md$/, ''), {
        description: premiereLigne(h.description, 240), location: f, site,
        attributes: { projet_claude: d.name, type, modifie: mtimeIso(f) } });
    });
  });
}

export default function inventaireClaudeCode(options, ctx) {
  const { home, config } = options; const site = ctx.site;
  const out = [];
  if (fs.existsSync(home)) {
    out.push(...skills(path.join(home, 'skills'), 'utilisateur', null, site));
    out.push(...agents(path.join(home, 'agents'), 'utilisateur', null, site));
    const f = path.join(home, 'settings.json');
    out.push(...hooks(lireJson(f), f, 'utilisateur', null, site));
    out.push(...consignes(path.join(home, 'CLAUDE.md'), 'utilisateur', null, site));
    out.push(...memoires(home, site));
    const plug = lireJson(path.join(home, 'plugins', 'installed_plugins.json'));
    for (const [nom, v] of Object.entries(plug?.plugins || {})) out.push(fiche('plugin', nom, nom, { site, location: path.join(home, 'plugins'), description: Array.isArray(v) ? `${v.length} installation(s)` : null }));
    for (const m of liste(path.join(home, 'plugins', 'marketplaces'), (d) => d.isDirectory())) out.push(fiche('plugin_marketplace', m.name, m.name, { site, location: path.join(home, 'plugins', 'marketplaces', m.name) }));
  }
  const cfg = lireJson(config);
  if (cfg) {
    out.push(...mcp(cfg.mcpServers, config, 'utilisateur', null, site));
    for (const [p, v] of Object.entries(cfg.projects || {})) out.push(...mcp(v.mcpServers, config, 'local', path.basename(p), site));
  }
  for (const depot of ctx.depots || []) {
    const nom = path.basename(depot);
    out.push(...skills(path.join(depot, '.claude', 'skills'), 'projet', nom, site));
    out.push(...agents(path.join(depot, '.claude', 'agents'), 'projet', nom, site));
    const s = path.join(depot, '.claude', 'settings.json');
    out.push(...hooks(lireJson(s), s, 'projet', nom, site));
    out.push(...mcp(lireJson(path.join(depot, '.mcp.json'))?.mcpServers, path.join(depot, '.mcp.json'), 'projet', nom, site));
    out.push(...consignes(path.join(depot, 'CLAUDE.md'), 'projet', nom, site));
  }
  return out;
}
