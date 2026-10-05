# Questions ouvertes

| # | Nœud | Question | Niveau |
|---|---|---|---|
| Q2 | `besoins/besoins-fondateurs.md` | Qualifier B5 « déléguer une tâche longue en confiance » après le second test comparatif. | gênant |
| Q4 | `conception/contrats/regle.md` §1 | Vocabulaire des actions (`match`) commun aux adaptateurs : à fixer à l'étape 3 sur les premiers clients (Claude Code, Desktop). | cosmétique d'ici l'étape 3 |
| Q5 | `conception/contrats/noeud.md` §2 | Registre des clés de `config` des nœuds : à ouvrir avec la première clé réellement portée par un nœud (aucune à ce jour ; les clés de la configuration du site n'en relèvent pas). | cosmétique d'ici là |
| Q6 | `decisions/2026-10-03-sources-hote.md` | Serveurs MCP conteneurisés : en existe-t-il sur un site, et à quoi les reconnaître (étiquette, catalogue MCP de Docker) ? Ils sont déjà inventoriés comme conteneurs. | cosmétique tant qu'il n'y en a pas |
| Q8 | `conception/essai-site-travail.md` §6-7 | Démarrage des serveurs stdio lourds : tous lancés à chaque session, ce qui sature une ressource à limite de connexions et déclenche des réessais. Démarrage paresseux, serveur persistant derrière la passerelle, ou limite du nombre de sessions ? | gênant |
| Q9 | `conception/essai-site-travail.md` §4 | `failOpen` masque une cible morte : où mettre le contrôle « cibles servies = cibles configurées » (procédure, commande `holarch`, carte du tableau de bord) ? | gênant |
| Q10 | `conception/essai-site-travail.md` §2 | Grille de tarifs : relevable par une commande, ou fournie avec une date et une source plutôt que recopiée d'un autre site ? | cosmétique |
| Q11 | `conception/essai-site-travail.md` §1 | Compte lu par défaut (`~/.claude`) : détecter `CLAUDE_CONFIG_DIR` et les répertoires de compte, ou rendre le réglage explicite dès `holarch init` ? | gênant |
| Q12 | `conception/essai-site-travail.md` §10 | Inventaire : rapprocher un remplacement d'un déplacement sur l'identité (nom, commande) et non sur le seul fichier. | cosmétique |

## Résolues

| # | Question | Réponse |
|---|---|---|
| Q1 | Une classification peut-elle se relâcher en descendant ? | Non : `decisions/2026-10-03-classification.md` |
| Q3 | Synchronisation local ↔ serveur | `decisions/2026-10-03-synchronisation.md` |
| Q7 | Configuration de Claude Desktop installé en paquet MSIX | oui : l'adaptateur cherche aussi `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`, sous Windows et depuis WSL ; `inventaire.claude-desktop.config` reste prioritaire |
