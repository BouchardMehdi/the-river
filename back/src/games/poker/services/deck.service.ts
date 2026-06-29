import { Injectable } from '@nestjs/common';
import { shuffleInPlace } from '../../../common/random';

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';

export interface Card {
  rank: Rank;
  suit: Suit;
}

@Injectable()
export class DeckService {
  createDeck(): Card[] {
    const suits: Suit[] = ['S', 'H', 'D', 'C'];
    const ranks: Rank[] = ['A','K','Q','J','10','9','8','7','6','5','4','3','2'];

    const deck: Card[] = [];
    for (const s of suits) {
      for (const r of ranks) {
        deck.push({ rank: r, suit: s });
      }
    }
    return deck;
  }

  shuffle<T>(arr: T[]): T[] {
    return shuffleInPlace(arr);
  }
}
