// Serveur web local de l'étape 1 : API JSON en lecture (plus « rafraîchir », qui ne touche que les données HOLARCH)
// et interface statique. Écoute par défaut sur 127.0.0.1.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

// L'interface se charge une fois, au démarrage, avec le code de l'API : les deux viennent toujours de la même version
// (sans quoi une page récente interroge une API ancienne et casse). Une mise à jour demande de relancer le serveur.
function chargerInterface() {
  const fichiers = {};
  const marcher = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) marcher(p); else fichiers[`/${path.relative(PUBLIC, p).split(path.sep).join('/')}`] = fs.readFileSync(p); } };
  marcher(PUBLIC);
  // Système de design (Pico CSS, décision interface) : servi depuis le paquet installé, jamais depuis un réseau.
  fichiers['/vendor/pico.css'] = fs.readFileSync(fileURLToPath(import.meta.resolve('@picocss/pico/css/pico.violet.min.css')));
  return fichiers;
}

export function creerServeur(socle) {
  const INTERFACE = chargerInterface();
  const routes = {
    'GET /api/etat': (u) => socle.etat({ jours: u.searchParams.get('jours') || 30 }),
    'GET /api/fiches': (u) => socle.fiches({ kind: u.searchParams.get('kind'), q: u.searchParams.get('q') }),
    'GET /api/fiche': (u) => socle.fiche(u.searchParams.get('id')),
    'GET /api/sessions': (u) => socle.sessions({ jours: +(u.searchParams.get('jours') || 30), projet: u.searchParams.get('projet') }),
    'GET /api/projets': () => socle.projets(),
    'GET /api/regles': (u) => socle.regles({ projet: u.searchParams.get('projet') }),
    'GET /api/consommation': (u) => socle.consommation({ jours: +(u.searchParams.get('jours') || 30), par: u.searchParams.get('par') || 'projet' }),
    'GET /api/evenements': (u) => socle.evenements({ kind: u.searchParams.get('kind'), session: u.searchParams.get('session'), sauf: u.searchParams.get('sauf'), limite: u.searchParams.get('limite') }),
    'GET /api/arbre': () => socle.arbre(),
    'POST /api/rafraichir': () => socle.rafraichir(),
    'POST /api/vue': (u) => socle.noterVue({ page: u.searchParams.get('page'), jours: u.searchParams.get('jours') }),
  };
  // Un serveur local reste exposé à deux attaques venues d'une page web ordinaire : le DNS rebinding (un domaine qui se
  // fait résoudre en 127.0.0.1, puis lit l'API) et l'écriture depuis un autre site (un POST n'a pas besoin de CORS).
  // Parade : n'accepter que les noms d'hôte locaux attendus, et, pour une écriture, qu'une origine de ce même serveur.
  const hotes = new Set(['127.0.0.1', 'localhost', '[::1]', socle.config?.web?.hote].filter(Boolean));
  const admis = (req) => {
    const port = req.socket.localPort;
    const permis = new Set([...hotes].map((h) => `${h}:${port}`));
    if (!permis.has(String(req.headers.host || '').toLowerCase())) return false;
    if (req.method === 'GET' || req.method === 'HEAD') return true;
    const origine = req.headers.origin;
    if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
    return !origine || [...permis].some((p) => origine === `http://${p}`);
  };
  return http.createServer(async (req, res) => {
    if (!admis(req)) { res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }); return res.end('refusé : hôte ou origine non locale'); }
    const u = new URL(req.url, 'http://local');
    const route = routes[`${req.method} ${u.pathname}`];
    try {
      if (route) {
        const corps = JSON.stringify((await route(u)) ?? null);
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(corps);
      }
      if (req.method !== 'GET') { res.writeHead(405); return res.end(); }
      const cle = u.pathname === '/' ? '/index.html' : u.pathname;
      if (!Object.hasOwn(INTERFACE, cle)) { res.writeHead(404); return res.end('introuvable'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(cle)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(INTERFACE[cle]);
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ erreur: e.message }));
    }
  });
}
