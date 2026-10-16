// ULID (identifiant triable dans le temps, contrat événement). `graine` rend l'identifiant déterministe : un import
// rejoué produit les mêmes identifiants, donc aucun doublon dans le journal. Sans graine, il croît dans un processus
// (monotone, comme le prévoit ULID) : à la même milliseconde, ou après un recul de l'horloge du poste, il reprend le temps
// du précédent et l'incrémente, sans quoi un `rule.resolved` pouvait passer avant son `rule.violated` dans l'ordre des
// identifiants (`ecartsOuverts`). D'un processus à l'autre, rien ne change.
import crypto from 'node:crypto';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

// Le dernier identifiant sans graine de ce processus : son temps et ses 80 bits d'aléa.
let dernier = null;

export function ulid(tempsMs = Date.now(), graine = null) {
  let t = Math.max(0, Math.floor(tempsMs));
  let octets;
  if (graine !== null) octets = crypto.createHash('sha256').update(String(graine)).digest().subarray(0, 10);
  else {
    octets = dernier && t <= dernier.t ? suivant(dernier.octets) : null;
    if (octets) t = dernier.t;
    else { if (dernier && t <= dernier.t) t = dernier.t + 1; octets = crypto.randomBytes(10); }
    dernier = { t, octets };
  }
  let temps = '';
  for (let i = 0; i < 10; i++) { temps = B32[t % 32] + temps; t = Math.floor(t / 32); }
  let alea = '';
  let acc = 0; let bits = 0;
  for (const o of octets) { acc = (acc << 8) | o; bits += 8; while (bits >= 5) { bits -= 5; alea += B32[(acc >> bits) & 31]; } }
  return temps + alea.slice(0, 16);
}

// L'aléa suivant (80 bits, poids fort en tête), null s'il déborde : le temps avance alors d'une milliseconde.
function suivant(octets) {
  const o = Buffer.from(octets);
  for (let i = o.length - 1; i >= 0; i--) { if (o[i] < 255) { o[i]++; return o; } o[i] = 0; }
  return null;
}

export const tempsDe = (id) => [...id.slice(0, 10)].reduce((a, c) => a * 32 + B32.indexOf(c), 0);
