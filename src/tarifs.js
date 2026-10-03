// Coût liste d'un relevé de tokens, depuis la grille de tarifs configurée (USD par million de tokens). Sans tarif pour
// le modèle, le coût reste inconnu (null) : aucun tarif n'est inventé. `cache_write_1h` est la part de `cache_write`
// écrite pour une heure ; le calcul est linéaire, donc la somme des coûts d'événements vaut le coût de leur somme.
export function prix(grille, modele, t) {
  const p = grille?.modeles?.[modele];
  if (!p || !t) return null;
  const h = t.cache_write_1h || 0;
  const usd = (t.in || 0) * (p.entree || 0) + ((t.cache_write || 0) - h) * (p.cache_ecrit || 0) + h * (p.cache_ecrit_1h || 0)
    + (t.cache_read || 0) * (p.cache_lu || 0) + (t.out || 0) * (p.sortie || 0);
  return Math.round(usd) / 1e6; // au micro-dollar : l'arrondi au cent se fait à l'affichage, pas événement par événement
}

export const tarifsConfigures = (grille) => Object.keys(grille?.modeles || {}).length;
