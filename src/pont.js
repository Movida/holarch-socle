// Pont stdio → hub HTTP (étape 2) : ce qu'un client qui ne joint un serveur MCP qu'en stdio (Claude Desktop) lance pour
// atteindre la passerelle d'un site. Écrit parce que le pont générique essayé (`mcp-remote`) ne reprend pas une session
// expirée côté passerelle (tous les appels échouent jusqu'au redémarrage du client) et ne ferme pas la sienne en partant
// (les serveurs de la session restent en marche jusqu'à expiration) : essai du site de travail, Q8.
//
// Un message JSON-RPC par ligne sur stdin, chacun envoyé en POST ; la réponse (JSON ou flux SSE) est réécrite sur stdout.
// La session (`Mcp-Session-Id`) est gardée ; si la passerelle ne la connaît plus, le pont rejoue l'initialisation reçue du
// client, puis renvoie le message. Avec des serveurs attendus, l'initialisation n'est rendue qu'une fois leurs outils
// présents, ou le délai passé (voir `verifierOutils`) ; avec une mémoire des outils, un serveur attendu encore absent est
// rendu d'après sa dernière liste connue, et rattrapé à son premier appel (voir `rattraper`). À la fin de stdin, la
// session est fermée (`DELETE`). La clé d'accès est lue dans un fichier, jamais passée en argument ; rien n'est écrit sur
// stdout hors du protocole.
import fs from 'node:fs';
import readline from 'node:readline';
import { ecrireJson, lireJson } from './commun.js';

const trace = (m) => process.stderr.write(`holarch pont : ${m}\n`);

// Mémoire des outils : par serveur attendu, les outils de la dernière liste où il figurait. Absente ou illisible : vide.
function lireMemoire(fichier) {
  const m = lireJson(fichier, {});
  return Object.fromEntries(Object.entries(m && typeof m === 'object' ? m : {}).filter(([, outils]) => Array.isArray(outils)));
}

// Messages JSON-RPC d'une réponse : un objet JSON, ou les `data:` d'un flux SSE (un événement par ligne vide).
export function messagesDe(type, texte) {
  if (!texte.trim()) return [];
  if (!String(type).includes('text/event-stream')) { const m = JSON.parse(texte); return Array.isArray(m) ? m : [m]; }
  const out = [];
  for (const bloc of texte.split(/\r?\n\r?\n/)) {
    const data = bloc.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
    if (data) { try { out.push(JSON.parse(data)); } catch { /* événement non JSON (ping) */ } }
  }
  return out;
}

const outilsDe = (messages) => messages.flatMap((m) => m.result?.tools ?? []);

// Serveur attendu d'un outil : la passerelle préfixe chaque outil du nom de son serveur. Le plus long préfixe l'emporte,
// pour qu'un serveur nommé comme le début d'un autre (`a`, `a_b`) ne prenne pas ses outils.
const serveurDe = (attendus, nom) => attendus.filter((s) => String(nom).startsWith(`${s}_`)).sort((a, b) => b.length - a.length)[0];

// Serveurs attendus absents d'une liste d'outils.
export function serveursAbsents(attendus, messages) {
  const noms = outilsDe(messages).map((t) => t.name);
  return attendus.filter((s) => !noms.some((n) => serveurDe(attendus, n) === s));
}

export function creerPont({ url, cle, ecrire, fetchImpl = fetch, attendus = [], fichierMemoire = null, delai = 20000, pause = 2000,
  horloge = Date.now, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let session = null; let version = null; let init = null; let reprise = null; let initialisation = null; let initialise = false;
  // `presents` : serveurs attendus que sert la session en cours (null tant que sa liste n'est pas lue) ; `promis` : ceux
  // rendus au client d'après la mémoire.
  const memoire = fichierMemoire ? lireMemoire(fichierMemoire) : {};
  let presents = null; const promis = new Set(); let rattrapage = null;
  // Pas d'en-tête de version sur un `initialize` : il doit égaler la version du corps, et la passerelle refuse l'écart
  // (une initialisation rejouée porte la version demandée par le client, pas celle négociée).
  const entetes = (initialisation = false) => ({ 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    ...(cle && { authorization: `Bearer ${cle}` }), ...(session && { 'mcp-session-id': session }), ...(version && !initialisation && { 'mcp-protocol-version': version }) });
  const poster = (msg) => fetchImpl(url, { method: 'POST', headers: entetes(msg.method === 'initialize'), body: JSON.stringify(msg) });
  const sessionPerdue = async (r) => session && (r.status === 404 || (r.status === 400 && /session/i.test(await r.clone().text())));

  // Rejoue l'initialisation du client sous un identifiant à nous ; sa réponse ne remonte pas au client. Une session perdue
  // veut dire une passerelle relancée, dont les serveurs ont pu changer (un serveur absent au premier `tools/list` du client,
  // revenu depuis) : le client est invité à relire ses listes. Claude Desktop les relit, mais la conversation ouverte
  // garde ses outils (constaté le 2026-10-30) : d'où `verifierOutils` et la mémoire des outils.
  async function reinitialiser(motif) {
    session = null; presents = null;
    const r = await poster({ ...init, id: `holarch-pont-reprise-${Date.now()}` });
    if (!r.ok) throw new Error(`réinitialisation refusée (HTTP ${r.status})`);
    session = r.headers.get('mcp-session-id'); await r.text();
    await (await poster({ jsonrpc: '2.0', method: 'notifications/initialized' })).text();
    trace(`${motif} : reprise`);
    for (const liste of ['tools', 'prompts', 'resources']) ecrire({ jsonrpc: '2.0', method: `notifications/${liste}/list_changed` });
  }
  const reprendre = (motif = 'session expirée côté hub') => (reprise ||= reinitialiser(motif).finally(() => { reprise = null; }));

  // Une liste d'outils lue sur la session en cours : serveurs présents, et mémoire mise à jour de ceux qui y figurent.
  function noterListe(messages) {
    if (!messages.some((m) => Array.isArray(m.result?.tools))) return;
    const outils = outilsDe(messages);
    presents = new Set(attendus.filter((s) => outils.some((o) => serveurDe(attendus, o.name) === s)));
    if (!fichierMemoire) return;
    let change = false;
    for (const s of presents) {
      const siens = outils.filter((o) => serveurDe(attendus, o.name) === s);
      if (JSON.stringify(siens) !== JSON.stringify(memoire[s])) { memoire[s] = siens; change = true; }
    }
    if (!change) return;
    try { ecrireJson(fichierMemoire, memoire, { indent: 0 }); } catch (e) { trace(`mémoire des outils non écrite : ${e.message}`); }
  }

  async function lireListe() {
    const demander = () => poster({ jsonrpc: '2.0', id: `holarch-pont-outils-${Date.now()}`, method: 'tools/list' });
    let r = await demander();
    if (await sessionPerdue(r)) { await reprendre(); r = await demander(); }
    const texte = await r.text();
    if (r.ok) noterListe(messagesDe(r.headers.get('content-type') || '', texte));
  }

  // Un serveur rendu d'après la mémoire manque à une session ouverte avant qu'il soit prêt, et la passerelle n'ajoute pas
  // de serveur à une session ouverte : une session neuve le prend s'il l'est devenu. Sinon, l'appel le dit au modèle.
  async function rattraper() {
    if (!presents && session) await lireListe();
    const manquants = [...promis].filter((s) => !presents?.has(s));
    if (!manquants.length) return;
    await fermer();
    await reprendre(`session neuve pour ${manquants.join(', ')}, rendus d'après la mémoire`);
    await lireListe();
  }

  // Une conversation de Claude Desktop garde la liste d'outils lue après l'initialisation, `list_changed` ou non (constaté
  // le 2026-10-16, précisé le 2026-10-30) : un serveur que la passerelle a écarté à ce moment-là (lancé avant que Docker
  // soit prêt) y reste absent jusqu'à la relance du client. Avant de rendre l'initialisation, le pont demande donc la liste lui-même et, s'il y
  // manque un serveur attendu, ouvre une session neuve, jusqu'à `delai` : le client abandonne une initialisation vers
  // 40 s ; un essai coûte une session neuve, aussi longue que l'initialisation du client (`cout`, plusieurs secondes),
  // d'où ce coût compté avant d'en lancer un autre. Le délai ne couvre pas un Docker lent au démarrage du poste (2 min 40 s
  // le 2026-10-30) : un serveur absent que la mémoire connaît ne fait donc pas attendre, ses outils sont rendus d'après
  // elle. Rend les serveurs encore absents.
  async function verifierOutils(cout = 0) {
    const fin = horloge() + delai;
    let absents = attendus;
    for (let essai = 1; ; essai++) {
      const debut = horloge();
      try {
        if (!session) {
          const r = await poster({ ...init, id: `holarch-pont-outils-${essai}` });
          if (r.ok) session = r.headers.get('mcp-session-id'); await r.text();
        }
        if (session) {
          await (await poster({ jsonrpc: '2.0', method: 'notifications/initialized' })).text();
          initialise = true;
          const r = await poster({ jsonrpc: '2.0', id: `holarch-pont-outils-${essai}`, method: 'tools/list' });
          const texte = await r.text();
          if (r.ok) { const liste = messagesDe(r.headers.get('content-type') || '', texte); noterListe(liste); absents = serveursAbsents(attendus, liste); }
        }
      } catch { /* passerelle en cours de relance : nouvel essai */ }
      cout = Math.max(cout, horloge() - debut);
      if (absents.every((s) => memoire[s]) || horloge() + pause + cout >= fin) return absents;
      trace(`absents de la liste d'outils : ${absents.join(', ')} ; nouvelle session dans ${pause / 1000} s`);
      await dormir(pause);
      await fermer();
    }
  }

  // Un message qui arrive pendant l'initialisation attend sa réponse : sans elle, il partirait sans session.
  function envoyer(msg) {
    if (msg.method !== 'initialize') return (initialisation || Promise.resolve()).catch(() => {}).then(() => transmettre(msg));
    initialisation = transmettre(msg);
    return initialisation;
  }

  async function transmettre(msg) {
    if (msg.method === 'initialize') { init = msg; session = null; initialise = false; presents = null; promis.clear(); }
    // Déjà envoyée par la vérification des outils : la session ne la reçoit qu'une fois.
    if (msg.method === 'notifications/initialized' && initialise) return;
    if (reprise) await reprise.catch(() => {});
    // Sans session après l'initialisation (passerelle en cours de relance pendant la vérification des outils) : en rouvrir une.
    if (!session && init && msg.method !== 'initialize') await reprendre();
    const serveur = msg.method === 'tools/call' && serveurDe(attendus, msg.params?.name);
    if (serveur && promis.has(serveur) && !presents?.has(serveur)) {
      await (rattrapage ||= rattraper().finally(() => { rattrapage = null; }));
      if (!presents?.has(serveur)) {
        ecrire({ jsonrpc: '2.0', id: msg.id, result: { isError: true, content: [{ type: 'text', text: `[holarch pont] Le `
          + `serveur ${serveur} démarre encore : la passerelle ne le sert pas encore. Refaire cet appel dans une minute.` }] } });
        return;
      }
    }
    const envoi = horloge();
    let r = await poster(msg);
    if (await sessionPerdue(r) && init && msg.method !== 'initialize') {
      await reprendre();
      r = await poster(msg);
    }
    if (msg.method === 'initialize') session = r.headers.get('mcp-session-id') || session;
    const texte = await r.text();
    if (!r.ok && r.status !== 202) {
      if (msg.id !== undefined) ecrire({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: `hub : HTTP ${r.status}` } });
      return;
    }
    const messages = messagesDe(r.headers.get('content-type') || '', texte);
    for (const m of messages) if (msg.method === 'initialize' && m.result?.protocolVersion) version = m.result.protocolVersion;
    // Les instructions du serveur sont lues par le modèle : qu'un serveur manquant ne passe pas pour inexistant.
    if (msg.method === 'initialize' && attendus.length && session) {
      const absents = await verifierOutils(horloge() - envoi);
      const retenus = absents.filter((s) => memoire[s]); const inconnus = absents.filter((s) => !memoire[s]);
      const notes = [];
      if (retenus.length) {
        trace(`outils rendus d'après la mémoire : ${retenus.join(', ')}`);
        notes.push(`[holarch pont] Serveurs encore en démarrage : ${retenus.join(', ')}. Leurs outils sont listés d'après `
          + 'la dernière liste connue ; un appel qui répond que son serveur démarre encore se refait une minute plus tard.');
      }
      if (inconnus.length) {
        trace(`liste d'outils rendue sans : ${inconnus.join(', ')}`);
        notes.push(`[holarch pont] Serveurs absents au démarrage de cette session : ${inconnus.join(', ')}. Leurs outils `
          + 'existent mais manquent ici, et n\'apparaîtront qu\'après la relance du client (Claude Desktop) : le dire à '
          + 'l\'utilisateur plutôt que conclure qu\'ils n\'existent pas.');
      }
      if (notes.length) for (const m of messages) if (m.result) m.result.instructions = [...notes, m.result.instructions].filter(Boolean).join('\n\n');
    }
    // Liste du client : les serveurs attendus que la passerelle ne sert pas encore y figurent d'après la mémoire.
    if (msg.method === 'tools/list' && attendus.length) {
      noterListe(messages);
      const page = messages.find((m) => Array.isArray(m.result?.tools));
      if (page && !msg.params?.cursor) {
        for (const s of attendus) if (!presents.has(s) && memoire[s]) { page.result.tools.push(...memoire[s]); promis.add(s); }
      }
    }
    for (const m of messages) ecrire(m);
  }

  async function fermer() {
    if (!session) return;
    try { await fetchImpl(url, { method: 'DELETE', headers: entetes() }); } catch { /* hub déjà arrêté */ }
    session = null; presents = null;
  }
  return { envoyer, fermer, get session() { return session; } };
}

export async function lancerPont({ url, fichierCle, attendus = [], fichierMemoire, delai }) {
  const cle = fichierCle ? fs.readFileSync(fichierCle, 'utf8').trim() : null;
  const pont = creerPont({ url, cle, attendus, fichierMemoire, ...(delai && { delai }), ecrire: (m) => process.stdout.write(`${JSON.stringify(m)}\n`) });
  const enCours = new Set();
  const lignes = readline.createInterface({ input: process.stdin });
  lignes.on('line', (l) => {
    if (!l.trim()) return;
    let msg; try { msg = JSON.parse(l); } catch { trace('ligne non JSON ignorée'); return; }
    const p = pont.envoyer(msg).catch((e) => {
      trace(e.message);
      if (msg.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32001, message: `hub injoignable : ${e.message}` } })}\n`);
    });
    enCours.add(p); p.finally(() => enCours.delete(p));
  });
  await new Promise((fin) => lignes.on('close', fin));
  await Promise.allSettled([...enCours]);
  await pont.fermer();
}
