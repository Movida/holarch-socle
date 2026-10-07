# Boîte à idées

Le carnet d'idées du §5.9 de l'architecture, réduit à un registre (accord de l'auteur, 2026-10-07). Une idée notée en
cours de route n'entre pas dans l'étape en cours : elle attend ici la phase qui la porte, et se relit quand celle-ci
s'ouvre. Une idée ne devient un chantier qu'après une mesure qui la justifie ; sa trace reste (prise avec le lien,
écartée avec le motif).

La phase visée commence par l'étape quand elle est connue (« étape 3, récolte ») : la reprise et la vue Projets
montrent les idées de l'étape en cours qui ne sont ni prises ni écartées.

Statuts : `retenue` (l'auteur la veut, pour sa phase) · `à trier` · `proposée` (par l'agent, l'auteur n'a pas tranché) ·
`prise` · `écartée`.

| # | Idée | Source | Phase visée | Gain attendu | Statut |
|---|---|---|---|---|---|
| I1 | Chaque réglage déclare sa mesure ; l'audit en tire une valeur par projet, proposée en brouillon (exemple mesuré : délai entre commit et envoi, lu dans le reflog de l'amont) | auteur, 2026-10-07 | étape 3, récolte | des réglages tirés de l'usage plutôt que devinés | retenue |
| I2 | Règle de profil : les recommandations se présentent en choix cliquables | auteur, 2026-10-07 | étape 3, récolte | moins de frappe, décisions plus rapides | retenue |
| I3 | Règle ou contrôle proposé quand un défaut est trouvé à l'usage | auteur, 2026-10-07 | étape 3, récolte | un défaut vu une fois ne revient pas | retenue |
| I4 | Une habitude nouvelle proposée quand un fait de session la suggère, et un registre des propositions, retenues ou non, pour ne pas les reproposer | auteur, 2026-10-07 | étape 5 (régulation) | des propositions qui s'enrichissent sans se répéter | retenue |
| I5 | Solutions aux échecs qui se répètent (tests rouges, sorties non nulles de `node`, `cat`, `python3`), à partir des comptes de la tranche 9 | auteur, 2026-10-07 | étape 5, boucles « Règles » et « Progrès et recul » | moins d'échecs répétés | retenue |
| I6 | Leçons de clôture consignées et comptées (texte de l'agent devenu proposition) | auteur, 2026-10-07 | étape 3, récolte | des demandes plus directes au fil du temps | retenue |
| I7 | Les skills évoluent au fil de l'usage : mesurer leurs appels (aujourd'hui non importés), les corrections et les échecs qui les suivent, puis proposer une retouche en brouillon | auteur, 2026-10-07 | étape 5, boucle « Usage » | des skills ajustés aux habitudes | retenue |
| I8 | Charte UI/UX paramétrable par aspect (palette, typographie, densité, ton, composants, accessibilité, interdits, écrans de référence) : un type de l'arbre, appliqué aux runtimes, contrôlé par l'audit et le test visuel ; sans outil de design refait (P2) | auteur, 2026-10-07 | étape 3, à placer à sa clôture | des interfaces moins génériques | retenue |
| I9 | Repérer au journal les travaux déterministes et répétés, et proposer de les confier à un outil (timer, script, CI) plutôt qu'à une routine d'IA, quand le gain se chiffre (coût par passage, fréquence, coût d'entretien) ; l'IA juge seulement au franchissement d'un seuil | auteur, 2026-10-07 | étape 5, boucles « Budget » et « Usage » | des tokens épargnés, des résultats stables | retenue |
| I10 | Limites connues d'un projet affichées dans l'interface | auteur, 2026-10-07 | étape 3, vue Projets | ce qui ne marche pas encore se voit | retenue |
| I11 | Forme des réponses déclarée au profil | agent, 2026-10-07 | étape 3, récolte | réponses à la forme voulue sans la redire | à trier |
| I12 | Coût annoncé avant une action lourde | agent, 2026-10-07 | étape 4 (plafonds) | pas de dépense surprise | à trier |
| I13 | Critère chiffré par tranche | agent, 2026-10-07 | méthode | des clôtures vérifiables | à trier |
| I14 | Échéances lancées par une routine (exemple : la mesure du 2026-10-14) | agent, 2026-10-07 | étape 3, à placer à sa clôture | une échéance ne s'oublie pas | à trier |
| I15 | Bilan de ce qui reste ouvert en fin de tranche | agent, 2026-10-07 | méthode | rien ne se perd entre deux tranches | à trier |
| I16 | Service d'inventaire lancé depuis une copie fixe plutôt que la copie de travail : un import ne tourne jamais avec du code en cours d'écriture (constaté le 2026-10-07, sans dommage) | agent, 2026-10-07 | étape 3 | un journal en ajout seul protégé du code inachevé | proposée |
| I17 | Une règle du compte dérogeable par projet (portée locale) | agent, 2026-10-07 | étape 3, réglages de Claude Code par projet | une exception sans changer le profil | à trier |
| I18 | « Profil de travail » (biographie) dans le profil privé | agent, 2026-10-07 | — | contexte de l'auteur connu des sessions | écartée pour l'instant (auteur, 2026-10-07) |
| I19 | Portée de l'autorisation d'envoi paramétrable (par commit, par session, par projet), déclarée au profil ; touche la règle approuvée `approuver-n-autorise-pas`, donc une décision | auteur, 2026-10-07 | étape 3, récolte (habitudes paramétrables) | moins d'allers-retours pour pousser | retenue |
| I20 | Petits modèles locaux spécialisés pour des tâches étroites et répétées, en bas de l'échelle des profils (§5.10, « monter d'un cran sur échec de la vérification ») : script d'abord, puis petit modèle ouvert sans entraînement, puis adapté (LoRA) seulement si la mesure le justifie ; outils existants (Ollama, llama.cpp, Unsloth), rien de refait (P2). Poste : 12 cœurs, 15 Go, aucun GPU visible depuis WSL [À COMPLÉTER : GPU de l'hôte Windows exposable ?] ; données d'entraînement tirées des sorties d'un modèle de fournisseur [À COMPLÉTER : ce que permettent ses conditions d'utilisation] | auteur, 2026-10-07 | après l'étape 4 (profils, contre-épreuve) | tokens épargnés sur les tâches étroites, travail hors ligne | à trier |
| I21 | Repérer dans les transcriptions les demandes de l'auteur qui reviennent (lues sur place, jamais copiées au journal) et proposer un skill ou une règle en brouillon ; mesure du 2026-10-07 : une seule demande de relance de l'interface en 331 transcriptions | agent, 2026-10-07 (accord de l'auteur) | étape 5, boucle « Usage » | une demande répétée devient un skill sans être redite | retenue |
| I22 | Créer un projet depuis l'interface : un formulaire mince sur la commande de création (une seule mécanique) ; lève la contrainte « interface en lecture », donc une décision, avec la protection d'une écriture joignable par le tailnet | auteur, 2026-10-07 | étape 3, création de projet (après la commande) | créer un projet depuis le téléphone sans conversation | retenue |
| I23 | Paramétrer depuis l'interface (approuver une décision, répondre à une question, changer un réglage ou une règle), rattaché à la boîte de décisions unique (§5.6) ; écrit dans l'arbre et le profil, jamais à côté | auteur, 2026-10-07 | étape 3, à placer à sa clôture | décider en un seul endroit, sans passer par une session | retenue |
