// Pont stdio → hub HTTP (étape 2) : ce qu'un client qui ne joint un serveur MCP qu'en stdio (Claude Desktop) lance pour
// atteindre la passerelle d'un site. Écrit parce que le pont générique essayé (`mcp-remote`) ne reprend pas une session
// expirée côté passerelle (tous les appels échouent jusqu'au redémarrage du client) et ne ferme pas la sienne en partant
// (les serveurs de la session restent en marche jusqu'à expiration) : essai du site de travail, Q8.
//
// Un message JSON-RPC par ligne sur stdin, chacun envoyé en POST ; la réponse (JSON ou flux SSE) est réécrite sur stdout.
// La session (`Mcp-Session-Id`) est gardée ; si la passerelle ne la connaît plus, le pont rejoue l'initialisation reçue du
// client, puis renvoie le message. Avec des serveurs attendus, l'initialisation n'est rendue qu'une fois leurs outils
// présents, ou le délai passé (voir `verifierOutils`). À la fin de stdin, la session est fermée (`DELETE`). La clé
// d'accès est lue dans un fichier, jamais passée en argument ; rien n'est écrit sur stdout hors du protocole.
import fs from 'node:fs';
import readline from 'node:readline';

const trace = (m) => process.stderr.write(`holarch pont : ${m}\n`);

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

// Serveurs attendus absents d'une liste d'outils : la passerelle préfixe chaque outil du nom de son serveur.
export function serveursAbsents(attendus, messages) {
  const noms = messages.flatMap((m) => m.result?.tools ?? []).map((t) => t.name);
  return attendus.filter((s) => !noms.some((n) => n.startsWith(`${s}_`)));
}

export function creerPont({ url, cle, ecrire, fetchImpl = fetch, attendus = [], delai = 20000, pause = 2000,
  horloge = Date.now, dormir = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  let session = null; let version = null; let init = null; let reprise = null; let initialisation = null; let initialise = false;
  // Pas d'en-tête de version sur un `initialize` : il doit égaler la version du corps, et la passerelle refuse l'écart
  // (une initialisation rejouée porte la version demandée par le client, pas celle négociée).
  const entetes = (initialisation = false) => ({ 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    ...(cle && { authorization: `Bearer ${cle}` }), ...(session && { 'mcp-session-id': session }), ...(version && !initialisation && { 'mcp-protocol-version': version }) });
  const poster = (msg) => fetchImpl(url, { method: 'POST', headers: entetes(msg.method === 'initialize'), body: JSON.stringify(msg) });
  const sessionPerdue = async (r) => session && (r.status === 404 || (r.status === 400 && /session/i.test(await r.clone().text())));

  // Rejoue l'initialisation du client sous un identifiant à nous ; sa réponse ne remonte pas au client. Une session perdue
  // veut dire une passerelle relancée, dont les serveurs ont pu changer (un serveur absent au premier `tools/list` du client,
  // revenu depuis) : le client est invité à relire ses listes. Claude Desktop n'en tient pas compte (`verifierOutils`).
  async function reinitialiser() {
    session = null;
    const r = await poster({ ...init, id: `holarch-pont-reprise-${Date.now()}` });
    if (!r.ok) throw new Error(`réinitialisation refusée (HTTP ${r.status})`);
    session = r.headers.get('mcp-session-id'); await r.text();
    await (await poster({ jsonrpc: '2.0', method: 'notifications/initialized' })).text();
    trace('session expirée côté hub : reprise');
    for (const liste of ['tools', 'prompts', 'resources']) ecrire({ jsonrpc: '2.0', method: `notifications/${liste}/list_changed` });
  }

  // Claude Desktop ne lit la liste d'outils qu'une fois, après l'initialisation, et ignore `list_changed` (constaté le
  // 2026-10-16) : un serveur que la passerelle a écarté à ce moment-là (lancé avant que Docker soit prêt) reste absent
  // jusqu'à la relance du client. Avant de rendre l'initialisation, le pont demande donc la liste lui-même et, s'il y
  // manque un serveur attendu, ouvre une session neuve, jusqu'à `delai` : le client abandonne une initialisation vers
  // 40 s ; un essai coûte une session neuve, aussi longue que l'initialisation du client (`cout`, plusieurs secondes),
  // d'où ce coût compté avant d'en lancer un autre. Rend les serveurs encore absents.
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
          if (r.ok) absents = serveursAbsents(attendus, messagesDe(r.headers.get('content-type') || '', texte));
        }
      } catch { /* passerelle en cours de relance : nouvel essai */ }
      cout = Math.max(cout, horloge() - debut);
      if (!absents.length || horloge() + pause + cout >= fin) return absents;
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
    if (msg.method === 'initialize') { init = msg; session = null; initialise = false; }
    // Déjà envoyée par la vérification des outils : la session ne la reçoit qu'une fois.
    if (msg.method === 'notifications/initialized' && initialise) return;
    if (reprise) await reprise.catch(() => {});
    // Sans session après l'initialisation (passerelle en cours de relance pendant la vérification des outils) : en rouvrir une.
    if (!session && init && msg.method !== 'initialize') {
      reprise ||= reinitialiser().finally(() => { reprise = null; });
      await reprise;
    }
    const envoi = horloge();
    let r = await poster(msg);
    if (await sessionPerdue(r) && init && msg.method !== 'initialize') {
      reprise ||= reinitialiser().finally(() => { reprise = null; });
      await reprise;
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
      if (absents.length) {
        trace(`liste d'outils rendue sans : ${absents.join(', ')}`);
        const note = `[holarch pont] Serveurs absents au démarrage de cette session : ${absents.join(', ')}. Leurs outils `
          + 'existent mais manquent ici, et n\'apparaîtront qu\'après la relance du client (Claude Desktop) : le dire à '
          + 'l\'utilisateur plutôt que conclure qu\'ils n\'existent pas.';
        for (const m of messages) if (m.result) m.result.instructions = m.result.instructions ? `${note}\n\n${m.result.instructions}` : note;
      }
    }
    for (const m of messages) ecrire(m);
  }

  async function fermer() {
    if (!session) return;
    try { await fetchImpl(url, { method: 'DELETE', headers: entetes() }); } catch { /* hub déjà arrêté */ }
    session = null;
  }
  return { envoyer, fermer, get session() { return session; } };
}

export async function lancerPont({ url, fichierCle, attendus = [], delai }) {
  const cle = fichierCle ? fs.readFileSync(fichierCle, 'utf8').trim() : null;
  const pont = creerPont({ url, cle, attendus, ...(delai && { delai }), ecrire: (m) => process.stdout.write(`${JSON.stringify(m)}\n`) });
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
