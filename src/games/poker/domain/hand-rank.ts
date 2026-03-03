export enum HandRank {
  QUINTE_FLUSH_ROYAL = 1,
  QUINTE_FLUSH = 2,
  CARRE = 3,
  FULL = 4,
  COULEUR = 5,
  SUITE = 6,
  BRELAN = 7,
  DOUBLE_PAIRE = 8,
  PAIRE = 9,
  HAUTEUR = 10,
}

export const HandRankLabel: Record<HandRank, string> = {
  [HandRank.QUINTE_FLUSH_ROYAL]: 'Quinte Flush Royal',
  [HandRank.QUINTE_FLUSH]: 'Quinte Flush',
  [HandRank.CARRE]: 'Carré',
  [HandRank.FULL]: 'Full',
  [HandRank.COULEUR]: 'Couleur',
  [HandRank.SUITE]: 'Suite',
  [HandRank.BRELAN]: 'Brelan',
  [HandRank.DOUBLE_PAIRE]: 'Double Paire',
  [HandRank.PAIRE]: 'Paire',
  [HandRank.HAUTEUR]: 'Hauteur',
};
