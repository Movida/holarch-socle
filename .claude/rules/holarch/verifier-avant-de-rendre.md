<!-- Généré par HOLARCH (holarch regles appliquer) : ne pas modifier ici, changer la règle à sa source. -->
<!-- source : holarch:/arbre/index.md (projet) -->
Avant de rendre la main, `npm test` est vert ; quand l'interface change, le test visuel (`npm run test:visuel`) passe aussi ; puis la copie de service est posée là où elle tourne (`holarch service poser`), ce qui relance l'interface.

Pourquoi : Un changement non vérifié casse la session suivante ; un service qui lance la copie de travail tourne sur du code inachevé, une copie non posée montre l'ancienne version.
