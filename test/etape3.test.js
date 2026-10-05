// Tests de l'étape 3 : accès distant par projet (tranche 1). systemctl est remplacé par un enregistreur : aucun service
// réel n'est touché.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creerDistant, declarerConfiance, nomDe } from '../src/distant.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'holarch-'));

function banc({ mode = 'auto' } = {}) {
  const racine = tmp(); const unites = tmp(); const cfgClaude = path.join(tmp(), '.claude.json');
  fs.mkdirSync(path.join(racine, 'demo'));
  fs.writeFileSync(cfgClaude, JSON.stringify({ autre: 1, projects: { '/x': { hasTrustDialogAccepted: false, garde: true } } }));
  const appels = []; const actifs = new Set();
  const systemctl = (args) => {
    appels.push(args.join(' '));
    if (args[0] === 'enable') actifs.add(args.at(-1));
    if (args[0] === 'disable') actifs.delete(args.at(-1));
    return { status: 0, stdout: args[0] === 'is-active' ? (actifs.has(args[1]) ? 'active\n' : 'inactive\n') : '', stderr: '' };
  };
  const config = { inventaire: { 'depots-git': { racines: [racine] }, 'claude-code': { config: cfgClaude } }, acces_distant: { mode_permissions: mode } };
  return { racine, unites, cfgClaude, appels, d: creerDistant(config, { unites, systemctl, claude: '/opt/outils/claude' }) };
}

test('accès distant : activer écrit un service marqué, déclare la confiance et démarre ; desactiver le retire', () => {
  const { racine, unites, cfgClaude, appels, d } = banc();
  assert.deepEqual(d.liste(), []);
  const r = d.activer('demo');
  assert.deepEqual([r.nom, r.chemin, r.unite, r.confiance_declaree], ['demo', path.join(racine, 'demo'), 'holarch-distant-demo.service', true]);
  const texte = fs.readFileSync(path.join(unites, r.unite), 'utf8');
  assert.match(texte, /^# Écrit par HOLARCH/);
  assert.match(texte, new RegExp(`^WorkingDirectory=${path.join(racine, 'demo')}$`, 'm'));
  assert.match(texte, /^ExecStart=\/opt\/outils\/claude remote-control --name demo --remote-control-session-name-prefix demo --permission-mode auto$/m);
  const c = JSON.parse(fs.readFileSync(cfgClaude, 'utf8'));
  assert.equal(c.projects[path.join(racine, 'demo')].hasTrustDialogAccepted, true);
  assert.deepEqual([c.autre, c.projects['/x']], [1, { hasTrustDialogAccepted: false, garde: true }]);
  assert.deepEqual(appels.slice(0, 2), ['daemon-reload', 'enable --now holarch-distant-demo.service']);
  assert.deepEqual(d.liste(), [{ nom: 'demo', chemin: path.join(racine, 'demo'), actif: true }]);
  assert.equal(d.activer(path.join(racine, 'demo')).confiance_declaree, false);
  d.desactiver('demo');
  assert.ok(!fs.existsSync(path.join(unites, r.unite)));
  assert.ok(appels.includes('disable --now holarch-distant-demo.service'));
  assert.deepEqual(d.liste(), []);
});

test('accès distant : projet introuvable refusé, service étranger jamais touché, mode par défaut omis', () => {
  const { unites, d } = banc({ mode: null });
  assert.throws(() => d.activer('absent'), /introuvable/);
  fs.writeFileSync(path.join(unites, 'holarch-distant-demo.service'), '[Service]\nExecStart=/bin/true\n');
  assert.throws(() => d.activer('demo'), /pas été écrit par HOLARCH/);
  assert.throws(() => d.desactiver('demo'), /pas été écrit par HOLARCH/);
  assert.deepEqual(d.liste(), []);
  fs.rmSync(path.join(unites, 'holarch-distant-demo.service'));
  d.activer('demo');
  assert.doesNotMatch(fs.readFileSync(path.join(unites, 'holarch-distant-demo.service'), 'utf8'), /--permission-mode/);
  assert.equal(nomDe('/a/mon projet!'), 'mon-projet-');
  const f = path.join(tmp(), 'neuf.json');
  assert.equal(declarerConfiance(f, '/p'), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { projects: { '/p': { hasTrustDialogAccepted: true } } });
});
