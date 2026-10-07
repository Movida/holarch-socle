---
type: decision
title: Économiser le contexte par la passation plutôt que par la seule compaction
description: Une session trop lourde est signalée ; l'agent met l'état à jour dans l'arbre et propose /clear ; la session suivante reprend sur un résumé injecté au démarrage ; une compaction à 300 000 tokens reste en filet. Les réglages de Claude Code se posent depuis le profil.
status: stable
approved: { by: human:auteur, at: 2026-10-07, ref: "échange du 2026-10-07 : « un mécanisme permettant de clear sereinement la session quand elle commence à trop consommer », puis choix cliquables (seuil d'alerte 150 000, réglages du profil, tableau de bord et indicateur)" }
links:
  derives_from: [/arbre/conception/etape-3-regles-projets.md]
  modifies: [/arbre/conception/contrats/noeud.md]
  constrained_by: [/arbre/fondations/principes.md, /arbre/decisions/2026-10-06-arbre-des-regles.md]
---

# Économiser le contexte par la passation plutôt que par la seule compaction

**Contexte (mesuré le 2026-10-07, 30 jours, prix liste).** La relecture du cache fait 52 % du coût ; les 22 sessions de
plus de 300 tours en font environ 59 %. Les sessions tournent sur un modèle à fenêtre d'un million de tokens, que
Claude Code ne compacte qu'autour de 967 000 : les plus longues relisent 250 000 à 490 000 tokens à chaque tour. La
moitié des sessions relisent moins de 87 000 tokens par tour en moyenne.

**Avis.** Abaisser le seuil de compaction (`autoCompactWindow`) borne le coût, mais une compaction résume
mécaniquement et perd du détail. La méthode garde déjà l'état dans l'arbre (journal, avancement) : une passation
(mettre l'arbre à jour, puis `/clear`) repart à neuf sans rien perdre de ce qui compte. Claude Code a les crochets pour
cela (P2) : `UserPromptSubmit` peut ajouter un avis, `SessionStart` un résumé au démarrage ; un crochet ne connaît pas
la taille du contexte et la lit dans la transcription (dernier usage d'une réponse).

**Décision.**

| Point | Choix |
|---|---|
| Alerte | au-delà de 150 000 tokens de contexte, chaque message reçoit un avis : finir la tâche en cours, mettre l'arbre à jour, proposer `/clear` ; l'auteur le voit aussi. Rien sous le seuil |
| Reprise | au démarrage d'une session (nouvelle, après `/clear` ou une compaction), un résumé du projet de 1 500 caractères au plus : étape, dernier fait, reste, écarts ouverts, questions, décisions à approuver |
| Filet | `autoCompactWindow` à 300 000 tokens |
| Où | section `claude_code` de la configuration du profil (`reglages`, `passation`), écrite au compte dans `~/.claude/settings.json` ; HOLARCH ne retire que ce qu'il a posé, et ne remplace jamais une valeur posée à la main |
| Mesure | le tableau de bord montre le contexte moyen relu par tour (7 et 30 jours) et les sessions de la semaine au-dessus du seuil |

**Raison.** La passation garde ce que la compaction perd ; le filet couvre l'oubli ; la mesure dira si le réglage tient
ses promesses (non-régression mesurée, §5.10).

**Ce qui le ferait changer.** Une alerte trop fréquente (seuil à relever), ou un gain mesuré trop faible.

**Conséquences.** Registre de configuration créé (`conception/contrats/config.md`), contrat nœud 0.3.0 qui y renvoie ;
tranche 7 de l'étape 3.
