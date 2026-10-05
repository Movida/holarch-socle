# Questions ouvertes

| # | Nœud | Question | Niveau |
|---|---|---|---|
| Q2 | `besoins/besoins-fondateurs.md` | Qualifier B5 « déléguer une tâche longue en confiance » après le second test comparatif. | gênant |
| Q4 | `conception/contrats/regle.md` §1 | Vocabulaire des actions (`match`) commun aux adaptateurs : à fixer à l'étape 3 sur les premiers clients (Claude Code, Desktop). | cosmétique d'ici l'étape 3 |
| Q5 | `conception/contrats/noeud.md` §2 | Registre des clés de `config` des nœuds : à ouvrir avec la première clé réellement portée par un nœud (aucune à ce jour ; les clés de la configuration du site n'en relèvent pas). | cosmétique d'ici là |
| Q8 | `conception/essai-site-travail.md` §6-7, §13 | Démarrage des serveurs stdio lourds, lancés à chaque session : le serveur permanent partagé en SSE est validé pour les bases de données. Reste : en faire un geste de la procédure, et décider si la passerelle doit démarrer ces serveurs à la demande. | gênant |
| Q9 | `conception/essai-site-travail.md` §4 | `failOpen` masque une cible morte : où mettre le contrôle « cibles servies = cibles configurées » (procédure, commande `holarch`, carte du tableau de bord) ? | gênant |
| Q10 | `conception/essai-site-travail.md` §2 | Grille de tarifs : relevable par une commande, ou fournie avec une date et une source plutôt que recopiée d'un autre site ? | cosmétique |
| Q11 | `conception/essai-site-travail.md` §1 | Compte lu par défaut (`~/.claude`) : détecter `CLAUDE_CONFIG_DIR` et les répertoires de compte, ou rendre le réglage explicite dès `holarch init` ? | gênant |
| Q12 | `conception/essai-site-travail.md` §10 | Inventaire : rapprocher un remplacement d'un déplacement sur l'identité (nom, commande) et non sur le seul fichier. | cosmétique |
| Q13 | `conception/essai-site-travail.md` §16 | Brique Savoir : le serveur OKF fédéré en devient-il l'adaptateur, et que doit dire le contrat de la brique (lecture avant, proposition après, porte vérifiée) pour ne pas dépendre de ses outils ? À l'ouverture de l'étape 6. | cosmétique d'ici l'étape 6 |

## Résolues

| # | Question | Réponse |
|---|---|---|
| Q1 | Une classification peut-elle se relâcher en descendant ? | Non : `decisions/2026-10-03-classification.md` |
| Q3 | Synchronisation local ↔ serveur | `decisions/2026-10-03-synchronisation.md` |
| Q6 | Serveurs MCP conteneurisés : à quoi les reconnaître ? | à une étiquette du service Compose qui les déclare (essai du site de travail, constat 15) ; l'inventaire ne la lit pas encore |
| Q7 | Configuration de Claude Desktop installé en paquet MSIX | oui : l'adaptateur cherche aussi `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`, sous Windows et depuis WSL ; `inventaire.claude-desktop.config` reste prioritaire |
