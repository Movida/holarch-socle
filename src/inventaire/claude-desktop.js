// Adaptateur d'inventaire Claude Desktop : les serveurs MCP déclarés dans sa configuration. Emplacement documenté par
// système (macOS, Windows), ou configuré (`config`) ; ailleurs, la source est absente. Mêmes garanties que pour
// Claude Code : un nom, un transport, un exécutable ou une URL sans identifiants ; jamais un argument ni un secret.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lireJson } from './outils.js';
import { mcp } from './claude-code.js';
import { SourceAbsente } from './source.js';

export function emplacementParDefaut(plateforme = process.platform, env = process.env) {
  if (plateforme === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  if (plateforme === 'win32' && env.APPDATA) return path.join(env.APPDATA, 'Claude', 'claude_desktop_config.json');
  return null;
}

export default function inventaireClaudeDesktop(options, ctx) {
  const f = options.config || emplacementParDefaut();
  if (!f || !fs.existsSync(f)) throw new SourceAbsente(`configuration Claude Desktop introuvable${f ? ` (${f})` : ' : aucun emplacement connu sur ce système'}`);
  const cfg = lireJson(f);
  if (!cfg) throw new Error(`configuration Claude Desktop illisible : ${f}`);
  return mcp(cfg.mcpServers, f, 'desktop', null, ctx.site, 'inventaire:claude-desktop');
}
