// Adaptateur d'inventaire Docker : conteneurs et volumes, lus par l'API Docker Engine en GET seulement. Le point
// d'accès se configure (`hote`), sinon DOCKER_HOST, sinon le socket local : une installation directe le trouve seule,
// une installation en conteneur reçoit un accès en lecture (proxy filtrant), jamais le socket brut.
// Ne lit ni variables d'environnement, ni commandes, ni étiquettes hors de celles qui rattachent à un projet. Le projet
// se retrouve par le dossier que ces étiquettes désignent (lien `project`, décision rattachement-projet) ; un volume
// sans étiquette prend les projets des conteneurs qui l'utilisent. D'un conteneur rattaché à un projet, l'inspection
// donne aussi ce qui l'isole de l'hôte (montages de l'hôte, privilèges), que juge le contrôle `montage-sensible`.
import http from 'node:http';
import path from 'node:path';
import { slug } from './outils.js';
import { SourceAbsente } from './source.js';
import { lienProjet } from '../projets.js';

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

// Étiquettes posées par les outils qui créent les conteneurs, et qui disent de quel dossier ils viennent ; le nom de
// projet Compose est une notion de Docker, gardée telle quelle (`compose`). L'API rend `Labels: null` sans étiquette.
const dossierDe = (l) => l?.['devcontainer.local_folder'] || l?.['com.docker.compose.project.working_dir'] || null;
const composeDe = (l) => l?.['com.docker.compose.project'] || null;

// Ce qui isole un conteneur de l'hôte, d'après son inspection : ses montages de l'hôte (un volume local en `o=bind`
// compte comme le chemin qu'il monte ; un lecteur Windows vu par Docker Desktop, `/run/desktop/mnt/host/c/…`, se
// nomme comme WSL le voit, `/mnt/c/…`) et ses privilèges.
const cheminHote = (s) => String(s || '').replace(/^\/run\/desktop\/mnt\/host\/([a-z])\//, '/mnt/$1/');
function isolement(detail, volumes) {
  const hc = detail.HostConfig || {};
  const montages = (detail.Mounts || []).flatMap((m) => {
    const o = m.Type === 'volume' ? volumes.get(m.Name)?.Options : null;
    if (o?.device && String(o.o || '').split(',').includes('bind')) return [{ source: cheminHote(o.device), cible: m.Destination, lecture: !m.RW }];
    return m.Type === 'bind' ? [{ source: cheminHote(m.Source), cible: m.Destination, lecture: !m.RW }] : [];
  });
  return { montages, privilegie: Boolean(hc.Privileged), capacites: hc.CapAdd || [], peripheriques: (hc.Devices || []).map((d) => d.PathOnHost),
    espaces: ['PidMode', 'IpcMode', 'UTSMode', 'UsernsMode', 'CgroupnsMode'].filter((k) => hc[k] === 'host'), protections: hc.SecurityOpt || [], volumes_de: hc.VolumesFrom || [] };
}

const fiche = (kind, cle, name, { projet, ...extra }) => ({
  id: `holarch:${kind}:${slug(cle)}`, kind, name, provenance: { source: 'inventaire:docker' }, classification: 'internal', ...extra,
  ...(projet && { links: lienProjet(projet) }),
});

export default async function inventaireDocker(options, ctx) {
  const cible = pointAcces(options.hote || undefined);
  const [conteneurs, volumes] = await Promise.all([lire(cible, '/containers/json?all=1'), lire(cible, '/volumes')]);
  const projetDe = ctx.projetDe || (() => null);
  const utilisateurs = {}; const projetsDesVolumes = {}; const parNom = new Map((volumes.Volumes || []).map((v) => [v.Name, v]));
  const projets = conteneurs.map((c) => projetDe(dossierDe(c.Labels)));
  const details = await Promise.all(conteneurs.map((c, i) => (projets[i] ? lire(cible, `/containers/${c.Id}/json`) : null)));
  const fiches = conteneurs.map((c, i) => {
    const nom = (c.Names?.[0] || c.Id.slice(0, 12)).replace(/^\//, '');
    const projet = projets[i]; const compose = composeDe(c.Labels);
    for (const m of c.Mounts || []) if (m.Type === 'volume' && m.Name) { (utilisateurs[m.Name] ||= []).push(nom); if (projet) (projetsDesVolumes[m.Name] ||= new Map()).set(projet.id, projet); }
    return fiche('container', `${ctx.site}/${nom}`, nom, {
      description: `${projet ? `${projet.nom} · ` : compose ? `${compose} · ` : ''}${c.Image} · ${c.Status || c.State}`, projet,
      status: c.State === 'running' ? 'active' : 'suspended', site: ctx.site, location: `docker:container/${c.Id.slice(0, 12)}`,
      attributes: { etat: c.State, image: c.Image, compose, devcontainer: Boolean(c.Labels?.['devcontainer.local_folder']), cree: c.Created ? new Date(c.Created * 1000).toISOString() : null,
        ...(details[i] && { isolement: isolement(details[i], parNom) }) },
    });
  });
  for (const v of volumes.Volumes || []) {
    const par = utilisateurs[v.Name] || [];
    const propres = projetDe(dossierDe(v.Labels));
    const projets = propres ? [propres] : [...(projetsDesVolumes[v.Name]?.values() || [])];
    fiches.push(fiche('volume', `${ctx.site}/${v.Name}`, v.Name, {
      description: par.length ? `utilisé par ${par.join(', ')}` : 'rattaché à aucun conteneur',
      status: 'active', site: ctx.site, location: `docker:volume/${v.Name}`,
      attributes: { pilote: v.Driver, conteneurs: par, orphelin: par.length === 0, compose: composeDe(v.Labels), cree: v.CreatedAt || null },
    }));
    if (projets.length) fiches.at(-1).links = { project: projets.map((p) => p.id) };
  }
  return fiches;
}
