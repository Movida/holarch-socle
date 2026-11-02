// Le script de clé de déploiement des projets (`modeles/projet/deploy-key.sh`) ne dit la clé active que si GitHub
// l'accepte, elle seule. Défaut trouvé à l'usage (2026-11-02, projet capsules) : VS Code transmet l'agent SSH de l'hôte
// au conteneur, et la clé de compte de l'hôte répondait à la place d'une clé de déploiement jamais enregistrée.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmp } from './temporaire.js';

const SCRIPT = fileURLToPath(new URL('../modeles/projet/deploy-key.sh', import.meta.url));
const executable = (f, t) => { fs.writeFileSync(f, t); fs.chmodSync(f, 0o755); };

// Un dépôt dont l'origine est sur GitHub, et de faux outils SSH : sans `IdentityAgent=none`, l'agent de l'hôte répond
// avec la clé du compte ; avec, seule la clé de déploiement compte, enregistrée ou non selon `enregistree`.
function lancer({ enregistree }) {
  const r = tmp(); const bin = path.join(r, 'bin'); const depot = path.join(r, 'depot'); fs.mkdirSync(bin); fs.mkdirSync(depot);
  executable(path.join(bin, 'ssh'), `#!/bin/sh
case " $* " in
  *IdentityAgent=none*) if [ "$FAUSSE_CLE" = enregistree ]; then echo "Hi Exemple/depot! You've successfully authenticated, but GitHub does not provide shell access." >&2; exit 1; fi
    echo "git@github.com: Permission denied (publickey)." >&2; exit 255 ;;
  *) echo "Hi Exemple! You've successfully authenticated, but GitHub does not provide shell access." >&2; exit 1 ;;
esac
`);
  executable(path.join(bin, 'ssh-keygen'), '#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = -f ] && f="$2"; shift; done\necho cle > "$f"; echo "ssh-ed25519 AAAAfausse deploy" > "$f.pub"\n');
  executable(path.join(bin, 'ssh-keyscan'), '#!/bin/sh\nexit 0\n');
  for (const a of [['init', '-q'], ['remote', 'add', 'origin', 'git@github.com:Exemple/depot.git']]) assert.equal(spawnSync('git', a, { cwd: depot }).status, 0);
  const env = { ...process.env, HOME: path.join(r, 'maison'), PATH: `${bin}:${process.env.PATH}`, FAUSSE_CLE: enregistree ? 'enregistree' : '' };
  const s = spawnSync('bash', [SCRIPT], { cwd: depot, env, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  return s.stdout;
}

test('clé de déploiement : l’agent de l’hôte transmis au conteneur ne fait pas passer une clé non enregistrée pour active', () => {
  const sortie = lancer({ enregistree: false });
  assert.doesNotMatch(sortie, /deploy key active/);
  assert.match(sortie, /Deploy key à enregistrer pour Exemple\/depot/);
  assert.match(sortie, /ssh-ed25519 AAAAfausse deploy/);
});

test('clé de déploiement : enregistrée, elle seule suffit à la dire active', () => {
  assert.match(lancer({ enregistree: true }), /✓ Exemple\/depot — deploy key active \(Hi Exemple\/depot\)/);
});
