// Accès distant par projet (étape 3, tranche 1) : un serveur Remote Control de Claude Code par projet, activé à la
// demande. Le runtime fait le travail (`claude remote-control`) ; HOLARCH écrit, démarre et retire un service systemd
// utilisateur par projet, et déclare le dossier de confiance pour Claude Code (sans terminal, un serveur lancé dans un
// dossier non déclaré attendrait une confirmation que personne ne peut donner).
// Un service porte la MARQUE : un service que HOLARCH n'a pas écrit n'est jamais modifié ni retiré.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Catalogue } from './stockage/catalogue.js';
import { projetsDe, localiserProjet, resoudreProjet } from './projets.js';

const MARQUE = '# Écrit par HOLARCH (holarch distant)';
const PREFIXE = 'holarch-distant-';

export const nomDe = (chemin) => path.basename(chemin).replace(/[^A-Za-z0-9_.-]+/g, '-');
const guillemets = (s) => (/[\s"'\\]/.test(s) ? `"${s.replace(/(["\\])/g, '\\$1')}"` : s);

export function uniteDe({ nom, chemin, claude, mode }) {
  const bins = [...new Set([path.dirname(claude), path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'])];
  const args = ['remote-control', '--name', nom, '--remote-control-session-name-prefix', nom, ...(mode ? ['--permission-mode', mode] : [])];
  return `${MARQUE} : accès distant au projet ${nom}. Retiré par \`holarch distant desactiver ${nom}\`.
[Unit]
Description=Claude Code Remote Control : ${nom}
After=network-online.target

[Service]
WorkingDirectory=${chemin}
Environment=PATH=${bins.join(':')}
ExecStart=${[claude, ...args].map(guillemets).join(' ')}
Restart=on-failure
RestartSec=30
StandardOutput=null

[Install]
WantedBy=default.target
`;
}

// Déclare un dossier de confiance dans la configuration de Claude Code (`projects.<chemin>.hasTrustDialogAccepted`),
// sans toucher au reste ; écriture atomique.
export function declarerConfiance(fichier, chemin) {
  const c = fs.existsSync(fichier) ? JSON.parse(fs.readFileSync(fichier, 'utf8')) : {};
  const p = ((c.projects ||= {})[chemin] ||= {});
  if (p.hasTrustDialogAccepted === true) return false;
  p.hasTrustDialogAccepted = true;
  fs.writeFileSync(`${fichier}.holarch`, JSON.stringify(c, null, 2));
  fs.renameSync(`${fichier}.holarch`, fichier);
  return true;
}

const trouverClaude = () => {
  const r = spawnSync('sh', ['-c', 'command -v claude'], { encoding: 'utf8' });
  return r.status === 0 ? fs.realpathSync(r.stdout.trim()) : null;
};

export function creerDistant(config, {
  unites = path.join(os.homedir(), '.config', 'systemd', 'user'),
  systemctl = (args) => spawnSync('systemctl', ['--user', ...args], { encoding: 'utf8' }),
  claude = config.acces_distant?.claude || null,
  projets = projetsDe(new Catalogue(config.donnees, config.site).lire({ site: config.site })),
} = {}) {
  const fichierUnite = (nom) => path.join(unites, `${PREFIXE}${nom}.service`);
  const geree = (f) => fs.existsSync(f) && fs.readFileSync(f, 'utf8').startsWith(MARQUE);
  const lancer = (args) => { const r = systemctl(args); if (r.status !== 0) throw new Error(`systemctl --user ${args.join(' ')} : ${(r.stderr || '').trim() || `code ${r.status}`}`); return r; };

  // Un projet du catalogue, désigné par son identifiant, son nom ou un chemin (module projets, comme partout ailleurs).
  const resoudre = (ref) => {
    if (!ref) throw new Error('projet manquant : un nom, un chemin ou un identifiant');
    const p = resoudreProjet(projets, ref);
    if (!p?.location) throw new Error(`projet inconnu du catalogue : ${ref} (un dépôt neuf y entre par holarch inventaire)`);
    return p;
  };
  const projetDe = localiserProjet(projets);

  return {
    liste() {
      if (!fs.existsSync(unites)) return [];
      return fs.readdirSync(unites).filter((f) => f.startsWith(PREFIXE) && f.endsWith('.service') && geree(path.join(unites, f))).map((f) => {
        const texte = fs.readFileSync(path.join(unites, f), 'utf8');
        const chemin = texte.match(/^WorkingDirectory=(.*)$/m)?.[1] ?? null;
        return { nom: f.slice(PREFIXE.length, -'.service'.length), chemin, projet: projetDe(chemin)?.id ?? null,
          actif: systemctl(['is-active', f]).stdout?.trim() === 'active' };
      });
    },
    activer(ref) {
      const p = resoudre(ref); const chemin = p.location;
      if (!fs.existsSync(chemin)) throw new Error(`dossier absent : ${chemin}`);
      const binaire = claude || trouverClaude();
      if (!binaire) throw new Error('claude introuvable dans le PATH (acces_distant.claude pour le préciser)');
      const nom = nomDe(chemin); const f = fichierUnite(nom);
      if (fs.existsSync(f) && !geree(f)) throw new Error(`${f} existe et n'a pas été écrit par HOLARCH : rien n'est modifié`);
      const confiance = declarerConfiance(config.inventaire?.['claude-code']?.config || path.join(os.homedir(), '.claude.json'), chemin);
      fs.mkdirSync(unites, { recursive: true });
      fs.writeFileSync(f, uniteDe({ nom, chemin, claude: binaire, mode: config.acces_distant?.mode_permissions || null }));
      lancer(['daemon-reload']); lancer(['enable', '--now', path.basename(f)]);
      return { nom, chemin, projet: p.id, unite: path.basename(f), confiance_declaree: confiance };
    },
    // Le service d'un projet sorti du catalogue doit rester retirable : à défaut de projet, la référence est son nom.
    desactiver(ref) {
      let p = null; try { p = resoudreProjet(projets, ref); } catch { /* nom ambigu : pris tel quel */ }
      const nom = p?.location ? nomDe(p.location) : String(ref).includes('/') ? nomDe(ref) : ref; const f = fichierUnite(nom);
      if (!fs.existsSync(f)) throw new Error(`aucun accès distant actif pour ${nom}`);
      if (!geree(f)) throw new Error(`${f} n'a pas été écrit par HOLARCH : rien n'est retiré`);
      lancer(['disable', '--now', path.basename(f)]);
      fs.rmSync(f); lancer(['daemon-reload']);
      return { nom, unite: path.basename(f) };
    },
  };
}
