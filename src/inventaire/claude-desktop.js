// Adaptateur d'inventaire Claude Desktop : les serveurs MCP déclarés dans sa configuration. Emplacement documenté par
// système (macOS, Windows, y compris l'installation en paquet MSIX, et depuis WSL), ou configuré (`config`) ; ailleurs,
// la source est absente. Mêmes garanties que pour
// Claude Code : un nom, un transport, un exécutable ou une URL sans identifiants ; jamais un argument ni un secret.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { lireJson, liste } from './outils.js';
import { mcp } from './claude-code.js';
import { SourceAbsente } from './source.js';

// Un service systemd de WSL ne reçoit ni `WSL_DISTRO_NAME` ni le `PATH` Windows : WSL se reconnaît aussi à son interop,
// et `cmd.exe` se cherche aussi à son emplacement par défaut (lecteur C: monté sous /mnt/c).
export const WSL = { interop: '/proc/sys/fs/binfmt_misc/WSLInterop', cmd: ['cmd.exe', '/mnt/c/Windows/System32/cmd.exe'], wslpath: 'wslpath' };

// Depuis WSL, les dossiers Windows de l'utilisateur, traduits en chemins Linux ; ailleurs (conteneur, Linux), rien.
function windowsDepuisWsl(env, wsl) {
  if (!env.WSL_DISTRO_NAME && !fs.existsSync(wsl.interop)) return null;
  const dossier = (nom) => {
    let v = '';
    for (const cmd of wsl.cmd) {
      const w = spawnSync(cmd, ['/c', `echo %${nom}%`], { encoding: 'utf8', timeout: 5000 });
      if (w.status === 0) { v = w.stdout.trim(); break; }
    }
    if (!v || v.includes('%')) return null;
    const u = spawnSync(wsl.wslpath, ['-u', v], { encoding: 'utf8', timeout: 5000 });
    return u.status === 0 ? u.stdout.trim() : null;
  };
  return { APPDATA: dossier('APPDATA'), LOCALAPPDATA: dossier('LOCALAPPDATA') };
}

/** Emplacements possibles de la configuration, dans l'ordre : installation classique, puis paquet MSIX (Windows). */
export function emplacementsCandidats(plateforme = process.platform, env = process.env, wsl = WSL) {
  if (plateforme === 'darwin') return [path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
  const w = plateforme === 'win32' ? env : plateforme === 'linux' ? windowsDepuisWsl(env, wsl) : null;
  if (!w) return [];
  const c = [];
  if (w.APPDATA) c.push(path.join(w.APPDATA, 'Claude', 'claude_desktop_config.json'));
  // Installé en paquet MSIX, Claude Desktop range sa configuration dans le dossier virtualisé du paquet.
  if (w.LOCALAPPDATA) {
    for (const p of liste(path.join(w.LOCALAPPDATA, 'Packages'), (d) => d.isDirectory() && d.name.startsWith('Claude_'))) {
      c.push(path.join(w.LOCALAPPDATA, 'Packages', p.name, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
    }
  }
  return c;
}

export function emplacementParDefaut(plateforme = process.platform, env = process.env, wsl = WSL) {
  const c = emplacementsCandidats(plateforme, env, wsl);
  return c.find((f) => fs.existsSync(f)) || c[0] || null;
}

export default function inventaireClaudeDesktop(options, ctx) {
  const f = options.config || emplacementParDefaut();
  if (!f || !fs.existsSync(f)) throw new SourceAbsente(`configuration Claude Desktop introuvable${f ? ` (${f})` : ' : aucun emplacement connu sur ce système'}`);
  const cfg = lireJson(f);
  if (!cfg) throw new Error(`configuration Claude Desktop illisible : ${f}`);
  return mcp(cfg.mcpServers, f, 'desktop', null, ctx.site, 'inventaire:claude-desktop');
}
