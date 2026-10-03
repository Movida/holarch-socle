// Une source d'inventaire absente de cette machine (pas de Docker, pas de Claude Desktop) n'est pas une erreur : elle
// se signale à part, pour que l'interface dise ce qui n'a pas été vu plutôt que de le taire ou d'alarmer.
export class SourceAbsente extends Error {}
