// ULID (identifiant triable dans le temps, contrat événement). `graine` rend l'identifiant déterministe : un import
// rejoué produit les mêmes identifiants, donc aucun doublon dans le journal.
import crypto from 'node:crypto';

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(tempsMs = Date.now(), graine = null) {
  let t = Math.max(0, Math.floor(tempsMs));
  let temps = '';
  for (let i = 0; i < 10; i++) { temps = B32[t % 32] + temps; t = Math.floor(t / 32); }
  const octets = graine === null ? crypto.randomBytes(10) : crypto.createHash('sha256').update(String(graine)).digest().subarray(0, 10);
  let alea = '';
  let acc = 0; let bits = 0;
  for (const o of octets) { acc = (acc << 8) | o; bits += 8; while (bits >= 5) { bits -= 5; alea += B32[(acc >> bits) & 31]; } }
  return temps + alea.slice(0, 16);
}

export const tempsDe = (id) => [...id.slice(0, 10)].reduce((a, c) => a * 32 + B32.indexOf(c), 0);
