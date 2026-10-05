---
type: observation
title: Essai de la procédure du site de travail
description: Ce que la mise en place du site de travail et de sa passerelle protégée a montré (2026-10-05) : ce qui a tenu, les difficultés, les pistes pour la méthode et pour HOLARCH.
status: draft
as_of: 2026-10-05
links:
  derives_from: [/arbre/conception/procedure-site-travail.md]
  supported_by: [/arbre/conception/essai-agentgateway.md]
---

# Essai de la procédure du site de travail (2026-10-05)

Première exécution de `procedure-site-travail.md` par une session d'agent, sur un poste Windows avec WSL 2, Docker Desktop,
Claude Desktop et Claude Code. Le but était d'éprouver la méthode ; les données du travail restent dans le profil privé, et
cette page n'en porte aucune. agentgateway 1.6.0, `mcp-remote` 0.14.3, Node 24 LTS.

## Ce qui a tenu

| Vérifié | Résultat |
|---|---|
| Prérequis (§0) | contrôles mécaniques suffisants ; un seul est humain (le dépôt du profil) |
| Profil privé (§1) | dépôt privé, configuration en lien symbolique vers `$HOLARCH_HOME` : une source, versionnée |
| Site et import (§2) | inventaire sans erreur ; import des transcriptions idempotent |
| Passerelle (§3) | écoute 127.0.0.1 seul ; sans clé 401 ; `Host` étranger 403 ; outils de chaque serveur préfixés ; chaîne témoin absente du journal ; service utilisateur systemd relancé seul après un arrêt brutal |
| Clé d'accès | rotation sans toucher aux clients (ils relisent le fichier au lancement) ; l'ancienne clé donne aussitôt 401 |
| Clients (§4) | Claude Desktop (pont stdio) et Claude Code (HTTP) appellent des outils fédérés ; la passerelle les journalise |
| Journal de la passerelle (§5) | 8 `tool.called` importés, serveur et outil seulement, aucun argument ; deuxième passe : 0 ajouté |

## Difficultés et constats

1. **Le compte lu par défaut n'est pas celui du site.** `claude-code.home` vaut `~/.claude` ; avec un répertoire par
   compte (`CLAUDE_CONFIG_DIR`), l'import lit 0 session et l'inventaire un profil vide, sans erreur. Il faut poser
   `inventaire.claude-code` **et** `import.claude-code-transcriptions` sur le bon répertoire. La procédure (§2) ne le dit pas.
2. **La grille de tarifs n'a pas toujours d'origine locale.** §1 la fait « recopier du site personnel » ; ici il n'y en a
   pas sur le poste. Relevée sur la page officielle (date et source consignées) ; le mode rapide demande une entrée
   `<modèle>:rapide` avec les multiplicateurs de cache appliqués au tarif rapide. Un calcul de coût apparaît alors.
3. **La clé n'a pas besoin d'être dans la configuration, même sous forme chiffrée.** Le schéma accepte `keyHash`
   (`sha256:<hex>`) : le fichier de la passerelle devient versionnable sans aucun secret. §3 suppose « un fichier non
   versionné produit au lancement » ; c'est inutile.
4. **`failOpen` masque une cible morte.** Lancée par systemd, la passerelle n'avait pas dans son `PATH` ni Node (installé
   par un gestionnaire de versions) ni la CLI d'un gestionnaire de secrets : seules 1 cible sur 5 était servie, sans
   erreur côté client, un avertissement au journal seulement. Le contrôle « la liste d'outils contient ceux de **chaque**
   serveur » de §3 l'attrape, à condition de comparer au nombre de cibles configurées.
5. **Desktop réinterprète la commande.** `wsl.exe -- bash -lc "<commande>"` est passé à un premier shell qui substitue
   `$(…)` et `$PATH` : le `PATH` de Windows (espaces) casse la syntaxe, et **la clé, déjà substituée, est recopiée en
   clair dans le journal d'erreur de Desktop**. Dans ce contexte, `npx` est de plus celui de Windows s'il précède dans
   le `PATH` : le pont tourne sous Windows et l'en-tête arrive vide (401). Remède : aucune substitution dans la
   configuration de Desktop, un script de lancement (versionné, sans secret) qui fixe son `PATH` et relit la clé ; la
   variable `${KEY}` est substituée par `mcp-remote` lui-même.
6. **Boucle de réessais.** Chaque session ouvre une série de serveurs stdio ; Desktop en ouvre plusieurs par lancement
   (pont principal, pool des sessions de code), et chaque expiration en relance. Des serveurs de bases de données
   saturent la limite de connexions de leur rôle, ce qui ralentit la série suivante : `initialize` passe de 3 s à 13-41 s,
   dépasse le délai du client, qui réessaie. Casser la boucle : fermer le client, redémarrer la passerelle (toutes les
   séries disparaissent), relancer le client une fois. Une session neuve met ensuite ~12 s.
7. **La coexistence double la charge.** §4 retire les entrées directes **après** l'essai du hub ; pendant l'essai, chaque
   serveur tourne deux fois (direct et fédéré). Avec des ressources à limite de connexions, c'est ce doublon qui
   déclenche le point 6.
8. **Les secrets en clair chez les clients.** `claude mcp add --header` écrit la clé telle quelle dans la configuration
   du compte (fichier en droits 600) ; il n'y a pas d'option « lire depuis un fichier ». Acceptable pour une clé qui n'ouvre
   qu'une boucle locale, à consigner.
9. **Journal mixte.** Le flux de la passerelle mêle ses lignes JSON et la sortie d'erreur des serveurs stdio qu'elle lance ;
   l'import les écarte sans les compter comme refus.
10. **Faux déplacement à l'inventaire.** Après qu'une entrée de la configuration de Desktop a été remplacée par une autre,
    l'inventaire a émis `element.moved` de l'ancienne vers la nouvelle (même fichier), et 11 fiches « disparues » : le
    rapprochement par emplacement prend un remplacement pour un déplacement.
11. **Doublon du serveur HOLARCH.** Le projet le déclare déjà (`.mcp.json`, en stdio) ; avec la passerelle, il est servi
    deux fois pour Claude Code. Choisir un chemin.
12. **Persistance.** L'installation d'un service utilisateur a été arrêtée par le contrôle d'autorisation de l'outil
    d'agent, puis faite sur accord explicite de l'humain. La procédure prévoit déjà ce point d'arrêt (§3.3) ; il vaut aussi
    pour le contrôle propre à l'outil.
13. **Un serveur partagé règle la saturation.** Les serveurs de bases de données lancés en un conteneur permanent en SSE
    (sur la boucle locale), au lieu d'une série stdio par session, ramènent à un pool de connexions par base : 4 sessions
    simultanées aboutissent en 5 à 9 s (contre ~40 s), le nombre de connexions ouvertes est constant (ici 8 sur une limite
    de 10, tous pools confondus) et ne croît plus avec les sessions. La marge reste mince : tout autre outil qui utilise le
    même rôle l'entame. Le lancement permanent est une persistance (accord de l'humain).
14. **Défaut du socle, corrigé : l'index SQLite.** Chaque serveur HOLARCH reconstruisait l'index au démarrage
    (`DROP`/`CREATE`) ; plusieurs démarrés ensemble (une série par session du hub) se verrouillaient et les perdants
    mouraient, ignorés par `failOpen` : le serveur HOLARCH manquait dans 3 sessions sur 4. L'index attend maintenant le
    verrou et se reconstruit en une transaction ; test à plusieurs processus.
15. **Le registre des connecteurs appartient au profil du site.** Un registre préexistant (un service Compose par serveur
    MCP, une étiquette qui le désigne comme connecteur, des secrets en références vers un coffre) savait aussi écrire une
    entrée par serveur dans Claude Desktop : avec la passerelle, ce geste recrée les doublons du constat 7. Le registre a
    été absorbé dans le profil privé du site, l'écriture dans les clients retirée ; la passerelle est la seule à lancer
    les connecteurs. Son étiquette répond à Q6 : un serveur MCP conteneurisé se reconnaît à une étiquette du service.
16. **Un serveur de bases de connaissances fédéré n'est pas la brique Savoir.** Le serveur OKF existant, candidat de
    la brique Savoir (`docs/architecture.md` §5.3, §11), passe par la passerelle comme les autres : ses outils restent
    sous son préfixe, son écriture reste la sienne (une proposition, revue par l'humain), et aucun code du socle ne
    dépend de ses outils. Le contrat de la brique Savoir reste à écrire (étape 6) ; ce serveur pourra en devenir
    l'adaptateur, ou non. Lancé une instance par session (son modèle), dans une image d'exécution minimale avec son dépôt
    monté seul ; ses verrous `flock` sont bien partagés entre un conteneur, WSL et un autre conteneur (vérifié).
    La passerelle fusionne les `instructions` des serveurs, une section par serveur, mais sans préfixer les noms d'outils
    qu'elles citent : un client lit `kb_search` là où l'outil s'appelle `<serveur>_kb_search`.
17. **Le coffre de secrets sous la charge.** Un connecteur qui résout ses secrets par la CLI d'un coffre (appel d'un
    exécutable Windows depuis WSL) à chaque session échoue quand plusieurs sessions démarrent ensemble (expiration de
    l'interopérabilité). En serveur partagé, les secrets ne sont lus qu'une fois. Un connecteur sans connexions limitées
    mais avec des secrets gagne donc aussi à être partagé.
18. **Ce qui libère une session de la passerelle.** Une session fermée par le client (`DELETE`) libère aussitôt ses
    serveurs stdio ; une session abandonnée expire après `config.mcp.sessionTtl` (30 min par défaut), compté depuis la
    **dernière activité** (vérifié : une session active survit au-delà du délai, une inactive expire). Les accumulations
    des constats 6 et 9 viennent de sessions jamais fermées : réessais d'un client, et scripts de vérification qui ne
    fermaient pas les leurs (17 séries vivantes pour une dizaine d'essais). Délai laissé au défaut : plus court, il
    couperait une session de client inactive, et la reprise par le pont n'est pas vérifiée.
19. **Le pont générique ne gère pas la vie d'une session.** `mcp-remote` ne reprend pas une session que la passerelle a
    expirée (« invalid session ID header » à chaque appel, jusqu'au redémarrage du client) et ne ferme pas la sienne quand
    le client se ferme (les serveurs stdio de la session restent en marche jusqu'à expiration) : vérifié sur une passerelle
    à durée de vie de 60 s. Remplacé par un pont du socle (`holarch pont`), qui rejoue l'initialisation sur session
    inconnue et ferme la session à la fin de son entrée ; même essai : session reprise après 150 s, serveurs libérés
    dès la fermeture. Deux pièges rencontrés en l'écrivant : l'en-tête de version de protocole doit égaler la version du
    corps d'un `initialize` (sinon refus), et un message qui suit l'`initialize` doit attendre sa réponse (sinon il part
    sans session). La durée de vie reste au défaut : le client HTTP de Claude Code n'a pas été essayé sur une session
    expirée.
20. **Non vérifié.** La carte « Appels MCP » à l'écran (le journal contient bien les événements) ; la panne d'un serveur
    sous `failOpen` (vérifiée à l'essai précédent, pas ici).

## Pistes

Elles alimentent `questions.md` (Q8 à Q12) :

- **Procédure corrigée** (2026-10-05, mêmes jours) : compte Claude Code, tarifs, `keyHash`, `PATH` du service, vérification
  « autant de serveurs que de cibles », script de lancement pour Desktop, ordre des opérations, reprise après blocage ;
- **un contrôle de santé de la passerelle** qui compare les cibles servies aux cibles configurées ;
- **une grille de tarifs relevable par une commande** plutôt qu'à la main ;
- **le démarrage des serveurs lourds** : le serveur persistant derrière la passerelle est validé (constat 13) ; reste à en
  faire un geste de la procédure et à décider si la passerelle doit pouvoir les démarrer à la demande ;
- **l'inventaire** : rapprocher un remplacement d'un déplacement sur l'identité (nom, commande), pas sur le seul fichier.
