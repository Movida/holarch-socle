#!/usr/bin/env bash
# Une deploy key GitHub par dépôt cité, pour un conteneur de développement — jamais la clé personnelle de l'hôte.
#
# POURQUOI. Un agent qui exécute du code dans ce conteneur ne doit pouvoir écrire que dans le dépôt qu'il sert : une
# deploy key ne vaut que ce dépôt et se révoque en un clic, une clé de compte les ouvrirait tous. Les clés vivent dans
# un volume Docker nommé monté sur ~/.ssh (jamais un montage du ~/.ssh de l'hôte).
#
# COMMENT : chaque dépôt cité obtient sa propre clé et son alias SSH
# (`gh-<owner>-<repo>`) ; la config git globale du conteneur réécrit les URL
# canoniques (ssh et https) vers l'alias, une fois la clé prouvée acceptée par
# GitHub — jamais avant, pour ne pas casser un accès qui marchait par un autre
# biais entre-temps.
#
# USAGE : deploy-keys.sh <owner/repo|remote-git> [<owner/repo|remote-git> ...]
# Idempotent : relancé, ne régénère aucune clé existante.
set -euo pipefail

SSH_DIR="$HOME/.ssh"
mkdir -p "$SSH_DIR"
# Un volume Docker nommé est créé par le démon en root:root : le chmod qui suit
# échouerait (« Operation not permitted », constaté au premier rebuild, 2026-09-13).
# On reprend la propriété une fois, comme le postCreateCommand le fait pour ~/.config.
if [ "$(stat -c %u "$SSH_DIR")" != "$(id -u)" ]; then
    sudo chown -R "$(id -u):$(id -g)" "$SSH_DIR"
fi
chmod 700 "$SSH_DIR"
touch "$SSH_DIR/known_hosts"
ssh-keyscan -t ed25519 github.com >> "$SSH_DIR/known_hosts" 2>/dev/null
sort -u -o "$SSH_DIR/known_hosts" "$SSH_DIR/known_hosts"
chmod 644 "$SSH_DIR/known_hosts"

for cible in "$@"; do
    # URL brute du remote (`git config`), jamais `git remote get-url` : celui-ci applique les
    # réécritures insteadOf posées par un passage précédent, et le script se relancerait sur
    # l'alias comme s'il était un dépôt (constaté 2026-09-13 : clé et alias parasites).
    if [[ "$cible" == */* ]] && ! git config --get "remote.$cible.url" >/dev/null 2>&1; then
        depot_brut="$cible"
    else
        depot_brut="$(git config --get "remote.$cible.url")"
    fi
    depot="$(echo "$depot_brut" | sed -E \
        -e 's#^git@github\.com:##' -e 's#^ssh://git@github\.com/##' \
        -e 's#^https://github\.com/##' -e 's#\.git$##' -e 's#/+$##')"

    if ! echo "$depot" | grep -qE '^[^/]+/[^/]+$'; then
        echo "'$cible' ($depot_brut) n'est pas un dépôt GitHub reconnu — ignoré" >&2
        continue
    fi

    alias_ssh="gh-$(echo "$depot" | tr 'A-Z/' 'a-z-' | tr -cs 'a-z0-9-' '-')"
    alias_ssh="${alias_ssh%-}"
    cle="$SSH_DIR/deploy_${alias_ssh#gh-}"
    DEBUT="# >>> deploy key: $alias_ssh >>>"
    FIN="# <<< deploy key: $alias_ssh <<<"

    if [ ! -f "$cle" ]; then
        ssh-keygen -t ed25519 -N "" -q -f "$cle" -C "devcontainer deploy key — $depot"
    fi
    chmod 600 "$cle"
    chmod 644 "$cle.pub"

    config="$SSH_DIR/config"
    touch "$config"
    reste="$(awk -v d="$DEBUT" -v f="$FIN" '
        $0 == d { dans = 1; next }
        $0 == f { dans = 0; next }
        !dans   { print }
    ' "$config")"
    printf '%s\n%s\nHost %s\n    HostName github.com\n    User git\n    IdentityFile %s\n    IdentitiesOnly yes\n%s\n' \
        "$reste" "$DEBUT" "$alias_ssh" "$cle" "$FIN" > "$config"
    chmod 600 "$config"

    url_alias="git@$alias_ssh:$depot"
    git config --global --unset-all "url.$url_alias.insteadOf" 2>/dev/null || true

    reponse="$(ssh -o BatchMode=yes -o ConnectTimeout=10 -T "git@$alias_ssh" 2>&1 || true)"
    if echo "$reponse" | grep -q "successfully authenticated"; then
        git config --global --add "url.$url_alias.insteadOf" "git@github.com:$depot"
        git config --global --add "url.$url_alias.insteadOf" "https://github.com/$depot"
        echo "✓ $depot — deploy key active"
    else
        cat <<EOF

  ─── Deploy key à enregistrer pour $depot ─────────────────────────────────
  https://github.com/$depot/settings/keys/new
  $(cat "$cle.pub")

  Cocher « Allow write access » si ce conteneur doit pousser sur ce dépôt.
EOF
    fi
done

if [ -f "$SSH_DIR/id_ed25519" ]; then
    echo
    echo "Il reste une clé de compte (~/.ssh/id_ed25519) qui ouvre tous les dépôts du compte depuis ce conteneur — la révoquer sur https://github.com/settings/keys puis la supprimer ici."
fi

echo
echo "Relancer si besoin : .devcontainer/deploy-keys.sh $*"
