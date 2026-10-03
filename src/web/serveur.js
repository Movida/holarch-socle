// Serveur web local de l'étape 1 : API JSON en lecture (plus « rafraîchir », qui ne touche que les données HOLARCH)
// et interface statique. Écoute par défaut sur 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

export function creerServeur(socle) {
  const routes = {
    'GET /api/etat': () => socle.etat(),
    'GET /api/fiches': (u) => socle.fiches({ kind: u.searchParams.get('kind'), q: u.searchParams.get('q') }),
    'GET /api/fiche': (u) => socle.fiche(u.searchParams.get('id')),
    'GET /api/sessions': (u) => socle.sessions({ jours: +(u.searchParams.get('jours') || 30), projet: u.searchParams.get('projet') }),
    'GET /api/consommation': (u) => socle.consommation({ jours: +(u.searchParams.get('jours') || 30), par: u.searchParams.get('par') || 'projet' }),
    'GET /api/evenements': (u) => socle.evenements({ kind: u.searchParams.get('kind'), limite: u.searchParams.get('limite') }),
    'GET /api/arbre': () => socle.arbre(),
    'POST /api/rafraichir': () => socle.rafraichir(),
  };
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://local');
    const route = routes[`${req.method} ${u.pathname}`];
    try {
      if (route) {
        const corps = JSON.stringify(route(u) ?? null);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(corps);
      }
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      const f = path.join(PUBLIC, u.pathname === '/' ? 'index.html' : path.normalize(u.pathname).replace(/^(\.\.[/\\])+/, ''));
      if (!f.startsWith(PUBLIC) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('introuvable'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ erreur: e.message }));
    }
  });
}
