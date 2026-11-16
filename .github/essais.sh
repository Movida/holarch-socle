#!/usr/bin/env bash
# Les essais du dépôt, joués par le banc de l'hôte de l'atelier (Movida/architecte, hote/banc.sh) :
#   .github/essais.sh [commit de base]
# Décision : D-2026-11-15-actions-03 (pas de fournisseur, budget Actions à 0 $).
#
# Tout se joue dans une image Node épinglée par empreinte, sous l'utilisateur `node` (non root : un essai
# rend un fichier illisible par chmod 0, ce que root lirait quand même). Le dépôt est monté en lecture seule
# puis copié : rien n'est écrit chez l'appelant. Le banc lance ce script avec un environnement vidé ;
# seul DOCKER_HOST (le moteur rootless du banc) passe. Les essais visuels (Playwright, `npm run test:visuel`)
# ne sont pas joués : ils ne l'étaient par aucune CI.
#
# Essai local derrière un mandataire : ESSAIS_DOCKER_OPTS="--network host -e HTTPS_PROXY …" .github/essais.sh
set -uo pipefail

IMAGE=node:22-bookworm@sha256:e13726ca604184d7a91fcacab1fc09eefd642dc28e79ac34e85540dd93b78cfb

if [ "${1:-}" != --dedans ]; then
    cd "$(dirname "$0")/.."
    # shellcheck disable=SC2086
    exec docker run --rm -i --user node -e HOME=/home/node -e LANG=C.UTF-8 ${ESSAIS_DOCKER_OPTS:-} \
        -v "$PWD:/source:ro" "$IMAGE" bash /source/.github/essais.sh --dedans
fi

# Dans le conteneur : une copie de travail, à nous.
mkdir -p /tmp/depot && tar -C /source --exclude=./node_modules -cf - . | tar -C /tmp/depot -xf - && cd /tmp/depot || exit 1
# Les essais créent de vrais dépôts git et y commitent.
git config --global user.name "Banc" && git config --global user.email "banc@atelier.invalid" && git config --global init.defaultBranch main

echecs=()
lancer() { # libellé commande…
    local libelle=$1; shift
    echo "::group::$libelle"
    if "$@"; then echo "::endgroup::"; echo "ok    $libelle"
    else echo "::endgroup::"; echo "ÉCHEC $libelle"; echecs+=("$libelle"); fi
}

lancer "dépendances (npm ci)" npm ci --no-audit --no-fund --ignore-scripts
for t in test/*.test.js; do
    lancer "$t" node --test --no-warnings "$t"
done

if [ ${#echecs[@]} -gt 0 ]; then
    printf 'Essais en échec : %s\n' "${echecs[*]}"; exit 1
fi
echo "Tous les essais passent."
