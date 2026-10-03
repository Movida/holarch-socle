// Adaptateur d'inventaire Docker : conteneurs et volumes, lus par l'API Docker Engine en GET seulement. Le point
// d'accès se configure (`hote`), sinon DOCKER_HOST, sinon le socket local : une installation directe le trouve seule,
// une installation en conteneur reçoit un accès en lecture (proxy filtrant), jamais le socket brut.
// Ne lit ni variables d'environnement, ni commandes, ni étiquettes hors de celles qui rattachent à un projet.
import http from 'node:http';
import path from 'node:path';
import { slug } from './outils.js';
import { SourceAbsente } from './source.js';

export function pointAcces(hote = process.env.DOCKER_HOST || 'unix:///var/run/docker.sock') {
  if (hote.startsWith('unix://')) return { socketPath: hote.slice('unix://'.length) };
  const u = new URL(hote.replace(/^tcp:\/\//, 'http://'));
  return { host: u.hostname, port: +u.port || 2375 };
}

function lire(cible, chemin) {
  return new Promise((ok, ko) => {
    const req = http.request({ ...cible, path: chemin, method: 'GET', timeout: 5000 }, (res) => {
      let corps = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { corps += d; });
      res.on('end', () => (res.statusCode === 200 ? ok(JSON.parse(corps)) : ko(new Error(`API Docker ${chemin} : ${res.statusCode}`))));
    });
    req.on('timeout', () => req.destroy(new SourceAbsente('API Docker sans réponse')));
    req.on('error', (e) => ko(['ENOENT', 'ECONNREFUSED', 'EACCES', 'ENOTFOUND', 'EHOSTUNREACH'].includes(e.code) ? new SourceAbsente(`API Docker inaccessible (${e.code})`) : e));
    req.end();
  });
}

// Étiquettes posées par les outils qui créent les conteneurs, et qui disent à quel projet ils appartiennent.
const projetDe = (l = {}) => (l['devcontainer.local_folder'] ? path.basename(l['devcontainer.local_folder'].replace(/\\/g, '/')) : l['com.docker.compose.project'] || null);

const fiche = (kind, cle, name, extra) => ({
  id: `holarch:${kind}:${slug(cle)}`, kind, name, provenance: { source: 'inventaire:docker' }, classification: 'internal', ...extra,
});

export default async function inventaireDocker(options, ctx) {
  const cible = pointAcces(options.hote || undefined);
  const [conteneurs, volumes] = await Promise.all([lire(cible, '/containers/json?all=1'), lire(cible, '/volumes')]);
  const utilisateurs = {};
  const fiches = conteneurs.map((c) => {
    const nom = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, '');
    for (const m of c.Mounts || []) if (m.Type === 'volume' && m.Name) (utilisateurs[m.Name] ||= []).push(nom);
    const projet = projetDe(c.Labels);
    return fiche('container', `${ctx.site}/${nom}`, nom, {
      description: `${projet ? `${projet} · ` : ''}${c.Image} · ${c.Status || c.State}`,
      status: c.State === 'running' ? 'active' : 'suspended', site: ctx.site, location: `docker:container/${c.Id.slice(0, 12)}`,
      attributes: { etat: c.State, image: c.Image, projet, devcontainer: Boolean(c.Labels?.['devcontainer.local_folder']), cree: c.Created ? new Date(c.Created * 1000).toISOString() : null },
    });
  });
  for (const v of volumes.Volumes || []) {
    const par = utilisateurs[v.Name] || [];
    fiches.push(fiche('volume', `${ctx.site}/${v.Name}`, v.Name, {
      description: par.length ? `utilisé par ${par.join(', ')}` : 'rattaché à aucun conteneur',
      status: 'active', site: ctx.site, location: `docker:volume/${v.Name}`,
      attributes: { pilote: v.Driver, conteneurs: par, orphelin: par.length === 0, projet: projetDe(v.Labels), cree: v.CreatedAt || null },
    }));
  }
  return fiches;
}
