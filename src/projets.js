// Rattachement au projet (décision rattachement-projet) : une seule notion, le projet du catalogue (`kind: project`),
// identifié par son dépôt ; tout le reste le cite par son identifiant. Ce module est le seul à passer d'un chemin, d'un
// nom ou d'un identifiant à un projet : inventaire, import, accès distant et lectures s'en servent tous.
import fs from 'node:fs';
import path from 'node:path';

/** Les projets d'une liste de fiches : { id, nom, location }. */
export const projetsDe = (fiches) => fiches.filter((f) => f.kind === 'project').map((f) => ({ id: f.id, nom: f.name, location: f.location ?? null }));

/**
 * Chemin → projet : le plus profond qui le contient (un dépôt imbriqué l'emporte). Un chemin vu d'un autre montage
 * (conteneur de développement, `/home/vscode/<dépôt>/…`, `/workspaces/<dépôt>/…`) se rattache par le nom : un segment
 * égal au nom du dossier d'un projet, si la suite du chemin existe dans ce projet (le segment le plus profond d'abord).
 */
export function localiserProjet(projets, existe = fs.existsSync) {
  const tries = projets.filter((p) => p.location).map((p) => ({ ...p, location: path.normalize(p.location) })).sort((a, b) => b.location.length - a.location.length);
  const parNom = new Map();
  for (const p of tries) { const b = path.basename(p.location); if (!parNom.has(b)) parNom.set(b, []); parNom.get(b).push(p); }
  const cache = new Map();
  return (chemin) => {
    if (!chemin) return null;
    const c = path.normalize(String(chemin).replace(/\\/g, '/'));
    if (cache.has(c)) return cache.get(c);
    let r = tries.find((p) => c === p.location || c.startsWith(p.location + path.sep)) || null;
    const seg = c.split(path.sep);
    for (let i = seg.length - 1; i > 0 && !r; i--) r = (parNom.get(seg[i]) || []).find((p) => existe(path.join(p.location, ...seg.slice(i + 1)))) || null;
    cache.set(c, r);
    return r;
  };
}

/** Référence donnée par une personne ou un agent (identifiant, nom, ou chemin) → projet ; un nom ambigu est refusé. */
export function resoudreProjet(projets, ref) {
  if (!ref) return null;
  const parId = projets.find((p) => p.id === ref);
  if (parId) return parId;
  if (String(ref).includes('/')) return localiserProjet(projets)(path.resolve(ref));
  const parNom = projets.filter((p) => p.nom === ref);
  if (parNom.length > 1) throw new Error(`nom de projet ambigu : ${ref} (${parNom.map((p) => p.location).join(', ')}) ; donner le chemin ou l'identifiant`);
  return parNom[0] || null;
}

/** Nom que Claude Code donne au dossier de transcriptions et de mémoire d'un dossier de travail (seul encodeur). */
export const dossierClaude = (dossier) => dossier.replace(/[^a-zA-Z0-9]/g, '-');

/**
 * Le projet dont le conteneur écrit ce dossier de transcriptions (`-workspaces-<dossier du dépôt>`, monté depuis
 * l'hôte), ou null. Une transcription écrite par un conteneur ne se rattache qu'à lui (décision environnement-d-execution).
 */
export const projetDuDossierConteneur = (projets, dossier) => projets.find((p) => p.location && dossierClaude(`/workspaces/${path.basename(p.location)}`) === dossier) || null;

/** Lien `project` d'une fiche (contrat fiche 0.4.0) : à ajouter à ses `links`, vide si l'élément n'est d'aucun projet. */
export const lienProjet = (p) => (p ? { project: [p.id] } : {});
