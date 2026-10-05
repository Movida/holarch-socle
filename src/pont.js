// Pont stdio → hub HTTP (étape 2) : ce qu'un client qui ne joint un serveur MCP qu'en stdio (Claude Desktop) lance pour
// atteindre la passerelle d'un site. Écrit parce que le pont générique essayé (`mcp-remote`) ne reprend pas une session
// expirée côté passerelle (tous les appels échouent jusqu'au redémarrage du client) et ne ferme pas la sienne en partant
// (les serveurs de la session restent en marche jusqu'à expiration) : essai du site de travail, Q8.
//
// Un message JSON-RPC par ligne sur stdin, chacun envoyé en POST ; la réponse (JSON ou flux SSE) est réécrite sur stdout.
// La session (`Mcp-Session-Id`) est gardée ; si la passerelle ne la connaît plus, le pont rejoue l'initialisation reçue du
// client, puis renvoie le message. À la fin de stdin, la session est fermée (`DELETE`). La clé d'accès est lue dans un
// fichier, jamais passée en argument ; rien n'est écrit sur stdout hors du protocole.
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

export function creerPont({ url, cle, ecrire, fetchImpl = fetch }) {
  let session = null; let version = null; let init = null; let reprise = null; let initialisation = null;
  // Pas d'en-tête de version sur un `initialize` : il doit égaler la version du corps, et la passerelle refuse l'écart
  // (une initialisation rejouée porte la version demandée par le client, pas celle négociée).
  const entetes = (initialisation = false) => ({ 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    ...(cle && { authorization: `Bearer ${cle}` }), ...(session && { 'mcp-session-id': session }), ...(version && !initialisation && { 'mcp-protocol-version': version }) });
  const poster = (msg) => fetchImpl(url, { method: 'POST', headers: entetes(msg.method === 'initialize'), body: JSON.stringify(msg) });
  const sessionPerdue = async (r) => session && (r.status === 404 || (r.status === 400 && /session/i.test(await r.clone().text())));

  // Rejoue l'initialisation du client sous un identifiant à nous ; sa réponse ne remonte pas au client.
  async function reinitialiser() {
    session = null;
    const r = await poster({ ...init, id: `holarch-pont-reprise-${Date.now()}` });
    if (!r.ok) throw new Error(`réinitialisation refusée (HTTP ${r.status})`);
    session = r.headers.get('mcp-session-id'); await r.text();
    await (await poster({ jsonrpc: '2.0', method: 'notifications/initialized' })).text();
    trace('session expirée côté hub : reprise');
  }

  // Un message qui arrive pendant l'initialisation attend sa réponse : sans elle, il partirait sans session.
  function envoyer(msg) {
    if (msg.method !== 'initialize') return (initialisation || Promise.resolve()).catch(() => {}).then(() => transmettre(msg));
    initialisation = transmettre(msg);
    return initialisation;
  }

  async function transmettre(msg) {
    if (msg.method === 'initialize') { init = msg; session = null; }
    if (reprise) await reprise.catch(() => {});
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
    for (const m of messagesDe(r.headers.get('content-type') || '', texte)) {
      if (msg.method === 'initialize' && m.result?.protocolVersion) version = m.result.protocolVersion;
      ecrire(m);
    }
  }

  async function fermer() {
    if (!session) return;
    try { await fetchImpl(url, { method: 'DELETE', headers: entetes() }); } catch { /* hub déjà arrêté */ }
    session = null;
  }
  return { envoyer, fermer, get session() { return session; } };
}

export async function lancerPont({ url, fichierCle }) {
  const cle = fichierCle ? fs.readFileSync(fichierCle, 'utf8').trim() : null;
  const pont = creerPont({ url, cle, ecrire: (m) => process.stdout.write(`${JSON.stringify(m)}\n`) });
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
