#!/usr/bin/env bash
# La deploy key de ce conteneur : ~/.ssh/id_ed25519, jamais la clé
# personnelle de l'hôte.
#
# POURQUOI. Ce conteneur exécute du code non fiable (sessions d'agent, installations de dépendances). Une clé de compte
# y donnerait un accès en écriture à tous les dépôts du compte GitHub ; une clé de déploiement ne vaut que le dépôt
# qu'elle sert, et se révoque en un clic. Elle vit dans un volume Docker nommé (~/.ssh), jamais dans un dossier de l'hôte.
#
# Ce conteneur ne sert qu'un seul dépôt : la clé par défaut suffit, sans
# alias ni réécriture d'URL.
#
# USAGE : deploy-key.sh [remote-git|owner/repo]   (défaut : origin)
# Idempotent : relancé, ne régénère pas la clé si ~/.ssh/id_ed25519 existe déjà.
set -euo pipefail

cible="${1:-origin}"
SSH_DIR="$HOME/.ssh"
cle="$SSH_DIR/id_ed25519"

if [[ "$cible" == */* ]] && ! git remote get-url "$cible" >/dev/null 2>&1; then
    depot_brut="$cible"
else
    depot_brut="$(git remote get-url "$cible")"
fi
depot="$(echo "$depot_brut" | sed -E \
    -e 's#^git@github\.com:##' -e 's#^ssh://git@github\.com/##' \
    -e 's#^https://github\.com/##' -e 's#\.git$##' -e 's#/+$##')"

mkdir -p "$SSH_DIR"
chmod 700 "$SSH_DIR"

if [ ! -f "$cle" ]; then
    ssh-keygen -t ed25519 -N "" -q -f "$cle" -C "devcontainer deploy key — $depot"
fi
chmod 600 "$cle"
chmod 644 "$cle.pub"

touch "$SSH_DIR/known_hosts"
ssh-keyscan -t ed25519 github.com >> "$SSH_DIR/known_hosts" 2>/dev/null
sort -u -o "$SSH_DIR/known_hosts" "$SSH_DIR/known_hosts"
chmod 644 "$SSH_DIR/known_hosts"

reponse="$(ssh -o BatchMode=yes -o ConnectTimeout=10 -T git@github.com 2>&1 || true)"
if echo "$reponse" | grep -q "successfully authenticated"; then
    echo "✓ $depot — deploy key active ($(echo "$reponse" | grep -oE 'Hi [^!]*'))"
else
    cat <<EOF

  ─── Deploy key à enregistrer pour $depot ─────────────────────────────────
  https://github.com/$depot/settings/keys/new
  $(cat "$cle.pub")

  Cocher « Allow write access » si ce conteneur doit pousser sur ce dépôt.
  Puis relancer : .devcontainer/deploy-key.sh $cible
EOF
fi
