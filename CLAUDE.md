# HOLARCH — consignes pour une session d'agent dans ce dépôt

- **Ce dépôt est public.** Aucun nom de personne, de client, de projet personnel, de chemin de machine, de compte ou de
  secret. Un exemple se rédige avec des données fictives.
- **Il se construit avec sa propre méthode** (`arbre/`) :
  - tout ce que l'agent crée est en `status: draft` (brouillon) ; un nœud passe en `stable` uniquement quand l'agent consigne
    une approbation humaine écrite (`approved: {by, at}`), jamais de lui-même ;
  - **rien n'est créé à l'avance** : pas de nœud, de dossier, de brique ou de code sans une étape en cours qui l'appelle
    (`docs/architecture.md` §10) ;
  - un fait inconnu se marque `[À COMPLÉTER : …]` et s'ajoute à `arbre/questions.md` ; il ne s'invente pas ;
  - une décision qui change un contrat ou une règle passe par un nœud `decision` dans `arbre/decisions/`.
- **Les contrats sont le produit** (`arbre/conception/contrats/`) : une implémentation suit le contrat ; changer un
  contrat est une décision, versionnée.
- **Autour des runtimes, pas à leur place** : avant d'écrire une brique, vérifier qu'un runtime ou un outil existant ne
  le fait pas déjà bien (`docs/architecture.md` §2).
- Journal : une ligne datée dans `arbre/log.md` par session qui change l'arbre (`## AAAA-MM-JJ` puis `* **Sujet** : détail`,
  le plus récent en premier).
- Commits : résumé impératif court, en français ; un commit = une intention.
