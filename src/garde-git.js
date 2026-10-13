// Garde avant commit (décision controles-de-regles) : un crochet `pre-commit` de git, posé par projet, qui appelle
// `holarch garde avant-commit`. Git l'exécute pour quiconque commite dans le clone (agents et humain). Le crochet est
// local au clone, jamais versionné ; il porte une MARQUE, et un crochet non marqué n'est jamais remplacé ni retiré.
// HOLARCH injoignable (un conteneur, où les chemins de l'hôte n'existent pas), le crochet vérifie au moins les secrets par
// gitleaks, celui que le conteneur généré monte de l'hôte ou celui du PATH (décision garde-sans-passage-muet) ; sans
// gitleaks, il laisse passer et le dit : l'audit rattrape ce qui serait passé. gitleaks y est lancé comme par le contrôle
// des secrets (module controles) : sa configuration par défaut, rien de la cible qui allège le contrôle, et un git qui
// n'exécute rien de la configuration du dépôt (`neutralisation`, écrite en shell).
import fs from 'node:fs';
import path from 'node:path';
import { shell as sh, porteMarque, git, dedans, cheminSansLien, NEUTRE } from './commun.js';
import { OUTILS } from './conteneur.js';
import { CONFIG_GITLEAKS, GITLEAKS_SANS_CIBLE, IGNORE_CIBLE } from './controles.js';

export const MARQUE = '# Généré par HOLARCH (holarch regles appliquer) : garde avant commit.';

/**
 * `neutralisation` (commun.js) en shell, pour le git que lance gitleaks : les mêmes clés (`NEUTRE`), dans le même ordre,
 * passées par `GIT_CONFIG_COUNT` ; les pilotes déclarés aux portées `local` et `worktree`, chacun une fois. Un nom de
 * pilote ne contient pas de fin de ligne (git le refuse) : une ligne de `git config --name-only` en est un.
 */
function neutralisationShell() {
  const k = (cle, v) => `k ${cle} ${sh(v)}`;
  const pilote = (genre) => NEUTRE[genre].map(([c, v]) => k(`"$p".${sh(c)}`, v)).join('; ');
  return `  T=$(printf '\\t'); n=\${GIT_CONFIG_COUNT:-0}; case $n in ''|*[!0-9]*) n=0 ;; esac
  k() { export "GIT_CONFIG_KEY_$n=$1" "GIT_CONFIG_VALUE_$n=$2"; n=$((n + 1)); }
  ${NEUTRE.cles.map(([c, v]) => k(sh(c), v)).join('; ')}
  vus='
'
  while IFS= read -r l; do
    case $l in local"$T"*|worktree"$T"*) p=\${l#*"$T"}; p=\${p%.*} ;; *) continue ;; esac
    case $vus in *"
$p
"*) continue ;; esac
    vus="$vus$p
"
    case $p in filter.*) ${pilote('filter')} ;; *) ${pilote('diff')} ;; esac
  done <<FIN
$(git config --show-scope --name-only --get-regexp ${sh(NEUTRE.pilotes)} 2>/dev/null)
FIN
  export GIT_CONFIG_COUNT=$n GIT_ALLOW_PROTOCOL=${sh(NEUTRE.protocole)}`;
}

/**
 * Texte du crochet : le binaire node, la ligne de commande HOLARCH et son répertoire de travail, figés à l'écriture ;
 * `outils`, le dossier où un conteneur généré monte le gitleaks de l'hôte.
 */
export function crochetDe({ node = process.execPath, holarch, accueil, outils = OUTILS.conteneur }) {
  return `#!/bin/sh
${MARQUE}
# Retiré par holarch regles appliquer quand plus aucune règle ne le demande.
N=${sh(node)}
H=${sh(holarch)}
if [ -x "$N" ] && [ -f "$H" ]; then HOLARCH_HOME=${sh(accueil)} exec "$N" --no-warnings "$H" garde avant-commit; fi
# HOLARCH injoignable : les secrets des changements indexés, par gitleaks s'il est là.
G=${sh(`${outils}/gitleaks`)}
[ -x "$G" ] || G=$(command -v gitleaks 2>/dev/null)
if [ -n "$G" ]; then
${neutralisationShell()}
  unset GITLEAKS_CONFIG; export GITLEAKS_CONFIG_TOML=${sh(CONFIG_GITLEAKS)}
  "$G" git --pre-commit --staged ${GITLEAKS_SANS_CIBLE.join(' ')} --redact --no-banner --log-level error --verbose .
  case $? in
    0) if [ -e ${IGNORE_CIBLE} ]; then echo "HOLARCH injoignable : commit refusé, le ${IGNORE_CIBLE} du dépôt peut taire un secret ; git commit --no-verify pour passer, l'audit le verra" >&2; exit 1; fi
       echo "HOLARCH injoignable : seuls les secrets sont vérifiés (gitleaks), l'audit verra le reste" >&2; exit 0 ;;
    1) echo "HOLARCH injoignable : commit refusé, gitleaks trouve un secret dans les changements indexés" >&2; exit 1 ;;
    *) echo "HOLARCH injoignable et gitleaks en échec : commit refusé ; git commit --no-verify pour passer, l'audit le verra" >&2; exit 1 ;;
  esac
fi
echo "HOLARCH injoignable : commit non contrôlé (l'audit le verra)" >&2
exit 0
`;
}

/** Chemin du crochet d'un clone (`core.hooksPath` et worktrees compris) ; null hors d'un dépôt git. */
export function fichierCrochet(depot) {
  const r = git(depot, ['rev-parse', '--git-path', 'hooks/pre-commit']);
  return r.status === 0 ? path.resolve(depot, r.stdout.trim()) : null;
}

/**
 * Pose, met à jour ou retire le crochet selon `voulu` (son texte, ou null) : { etat, fichier } avec `etat` parmi
 * pose · modifie · inchange · retire · absent · ignore (crochet non marqué) · hors-git · erreur (emplacement non inscriptible,
 * par exemple un `core.hooksPath` qui vise un chemin d'un autre montage, ou un lien symbolique dans le dépôt sur son
 * chemin : `raison` le dit). `ecrire: false` : dit seulement.
 */
export function poserCrochet(depot, voulu, { ecrire = true } = {}) {
  const fichier = fichierCrochet(depot);
  if (!fichier) return { etat: 'hors-git', fichier: null };
  // Dans le dépôt, que le conteneur écrit, rien ne se lit, ne s'écrit ni ne se retire à travers un lien symbolique ; un
  // `core.hooksPath` qui en sort relève du risque accepté jusqu'à D (décision veille-et-conteneur-precisions).
  if (dedans(fichier, depot)) { try { cheminSansLien(depot, path.relative(depot, fichier)); } catch (e) { return { etat: 'erreur', fichier, raison: e.message }; } }
  const present = fs.existsSync(fichier) ? fs.readFileSync(fichier, 'utf8') : null;
  if (present != null && !porteMarque(present, MARQUE)) return { etat: 'ignore', fichier };
  if (!voulu) {
    if (present == null) return { etat: 'absent', fichier };
    if (ecrire) fs.unlinkSync(fichier);
    return { etat: 'retire', fichier };
  }
  if (present === voulu) return { etat: 'inchange', fichier };
  if (ecrire) {
    try { fs.mkdirSync(path.dirname(fichier), { recursive: true }); fs.writeFileSync(fichier, voulu, { mode: 0o755 }); fs.chmodSync(fichier, 0o755); } catch (e) { return { etat: 'erreur', fichier, raison: e.code || e.message }; }
  }
  return { etat: present == null ? 'pose' : 'modifie', fichier };
}
