---
type: decision
title: Une passerelle là où il y a à fédérer, protégée ; ailleurs, HOLARCH en direct
description: "Après l'essai sur l'hôte : pas de passerelle durable sur le poste personnel ; au travail, agentgateway avec clé d'accès et protection contre le DNS rebinding."
status: stable
approved: { by: human:auteur, at: 2026-10-03, ref: "échange du 2026-10-03, « oui » aux avis 1 à 4 rendus après l'essai sur l'hôte" }
links:
  derives_from: [/arbre/decisions/2026-10-03-forme-etape-2.md]
  supported_by: [/arbre/conception/essai-agentgateway.md]
---

# Une passerelle là où il y a à fédérer, protégée ; ailleurs, HOLARCH en direct

**Contexte.** L'essai sur l'hôte a validé la chaîne Claude Desktop → pont stdio → passerelle → serveur HOLARCH, et
montré qu'une passerelle en écoute locale est exposée au DNS rebinding (corrigé par `dnsRebindingProtection`) et
joignable depuis tout conteneur par `host.docker.internal`.

**Décision.**

| Lieu | Choix |
|---|---|
| Poste sans serveurs à fédérer | **pas de passerelle durable** : Claude Desktop lance le serveur HOLARCH directement en stdio (`wsl.exe -e node <dépôt>/bin/holarch.js mcp` sous Windows avec WSL) ; aucun démon, aucun port ouvert |
| Site où des serveurs se fédèrent (travail) | agentgateway durable : écoute sur 127.0.0.1, **`dnsRebindingProtection`**, **clé d'accès (`apiKey`)** que seuls les clients configurés portent, `failOpen`, journal `json`, ports d'administration locaux ou coupés ; la clé vit dans l'environnement, jamais dans un dépôt ; binaire, configuration et service appartiennent au **profil privé** du site, pas au socle public |
| Node sur un site | ≥ 22.13 (`node:sqlite` sans drapeau) ; une LTS actuelle de préférence |

**Pourquoi la clé en plus de la protection.** La protection arrête une page web ; elle n'arrête pas un processus d'un
conteneur, par exemple un agent qui exécute du code, qui forcerait `Host: localhost`. La clé réserve les outils
fédérés (au travail, des outils sur des données de travail) aux clients configurés.
