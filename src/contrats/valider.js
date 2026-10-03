// Validation contre les schémas des contrats. Une donnée invalide ne va ni au journal ni au catalogue.
import fs from 'node:fs';
import Ajv from 'ajv/dist/2020.js';

const ajv = new Ajv({ allErrors: true, strict: false });
const charger = (nom) => JSON.parse(fs.readFileSync(new URL(`./schemas/${nom}.schema.json`, import.meta.url), 'utf8'));
const V = { evenement: ajv.compile(charger('evenement')), fiche: ajv.compile(charger('fiche')) };

export function valider(type, donnee) {
  const v = V[type];
  if (!v) throw new Error(`contrat inconnu : ${type}`);
  return v(donnee) ? null : v.errors.map((e) => `${e.instancePath || '/'} ${e.message}`).join(' ; ');
}
