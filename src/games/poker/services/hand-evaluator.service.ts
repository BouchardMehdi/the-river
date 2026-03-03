import { Injectable } from '@nestjs/common';
import type { Card } from './deck.service';
import { HandRank } from '../domain/hand-rank';

export type HandScore = {
  rank: HandRank;
  tiebreakers: number[];
  bestFive: Card[];       // les 5 cartes optimales (toujours 5)
  winningCards: Card[];   // cartes qui composent la combinaison (2/3/4/5/1)
  description: string;
};

type ValuedCard = Card & { value: number };

@Injectable()
export class HandEvaluatorService {
  bestHandOf7(cards7: Card[]): HandScore {
    if (!cards7 || cards7.length !== 7) {
      throw new Error(`bestHandOf7 expects exactly 7 cards, got ${cards7?.length ?? 0}`);
    }

    const combos = this.combinationsOf5(cards7);
    let best: HandScore | null = null;

    for (const five of combos) {
      const score = this.evaluate5(five);
      if (!best || this.compareScores(score, best) < 0) best = score;
    }

    return best!;
  }

  compareScores(a: HandScore, b: HandScore): number {
    if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1; // 1 meilleur
    const len = Math.max(a.tiebreakers.length, b.tiebreakers.length);
    for (let i = 0; i < len; i++) {
      const av = a.tiebreakers[i] ?? 0;
      const bv = b.tiebreakers[i] ?? 0;
      if (av !== bv) return av > bv ? -1 : 1; // kicker plus haut gagne
    }
    return 0;
  }

  evaluate5(cards5: Card[]): HandScore {
    const v = this.toValued(cards5);
    const valuesDesc = this.sortDesc(v.map((c) => c.value));
    const counts = this.countByValue(valuesDesc);

    const isFlush = this.isFlush(v);
    const straightHigh = this.getStraightHigh(valuesDesc);
    const groups = this.groupsDesc(counts);

    // Helper pour extraire cartes d'une valeur (ex: toutes les cartes "8")
    const pickByValue = (value: number, countWanted?: number): Card[] => {
      const picked = v.filter((c) => c.value === value).map(({ suit, rank }) => ({ suit, rank }));
      return typeof countWanted === 'number' ? picked.slice(0, countWanted) : picked;
    };

    // Quinte flush
    if (isFlush && straightHigh !== null) {
      const desc = straightHigh === 14 ? 'Quinte Flush Royal' : `Quinte Flush ${this.straightString(straightHigh)}`;
      return {
        rank: straightHigh === 14 ? HandRank.QUINTE_FLUSH_ROYAL : HandRank.QUINTE_FLUSH,
        tiebreakers: [straightHigh === 14 ? 14 : straightHigh],
        bestFive: cards5,
        winningCards: cards5, // 5 cartes
        description: desc,
      };
    }

    // Carré
    if (groups[0].count === 4) {
      const fourVal = groups[0].value;
      return {
        rank: HandRank.CARRE,
        tiebreakers: [fourVal, groups[1].value],
        bestFive: cards5,
        winningCards: pickByValue(fourVal), // 4 cartes
        description: `Carré de ${this.valueToRank(fourVal)}`,
      };
    }

    // Full
    if (groups[0].count === 3 && groups[1].count === 2) {
      const threeVal = groups[0].value;
      const pairVal = groups[1].value;
      return {
        rank: HandRank.FULL,
        tiebreakers: [threeVal, pairVal],
        bestFive: cards5,
        winningCards: cards5, // 5 cartes (3+2)
        description: `Full ${this.valueToRank(threeVal)} par ${this.valueToRank(pairVal)}`,
      };
    }

    // Couleur
    if (isFlush) {
      return {
        rank: HandRank.COULEUR,
        tiebreakers: valuesDesc,
        bestFive: cards5,
        winningCards: cards5, // 5 cartes
        description: `Couleur ${valuesDesc.map((x) => this.valueToRank(x)).join(' ')}`,
      };
    }

    // Suite
    if (straightHigh !== null) {
      return {
        rank: HandRank.SUITE,
        tiebreakers: [straightHigh],
        bestFive: cards5,
        winningCards: cards5, // 5 cartes
        description: `Suite ${this.straightString(straightHigh)}`,
      };
    }

    // Brelan
    if (groups[0].count === 3) {
      const threeVal = groups[0].value;
      const kickers = groups
        .filter((g) => g.count === 1)
        .map((g) => g.value)
        .sort((a, b) => b - a);

      return {
        rank: HandRank.BRELAN,
        tiebreakers: [threeVal, ...kickers],
        bestFive: cards5,
        winningCards: pickByValue(threeVal), // 3 cartes
        description: `Brelan de ${this.valueToRank(threeVal)}`,
      };
    }

    // Double paire
    if (groups[0].count === 2 && groups[1].count === 2) {
      const highPair = Math.max(groups[0].value, groups[1].value);
      const lowPair = Math.min(groups[0].value, groups[1].value);
      const kicker = groups.find((g) => g.count === 1)!.value;

      return {
        rank: HandRank.DOUBLE_PAIRE,
        tiebreakers: [highPair, lowPair, kicker],
        bestFive: cards5,
        winningCards: [...pickByValue(highPair, 2), ...pickByValue(lowPair, 2)], // 4 cartes
        description: `Double Paire ${this.valueToRank(highPair)} et ${this.valueToRank(lowPair)}`,
      };
    }

    // Paire
    if (groups[0].count === 2) {
      const pairVal = groups[0].value;
      const kickers = groups
        .filter((g) => g.count === 1)
        .map((g) => g.value)
        .sort((a, b) => b - a);

      return {
        rank: HandRank.PAIRE,
        tiebreakers: [pairVal, ...kickers],
        bestFive: cards5,
        winningCards: pickByValue(pairVal, 2), // 2 cartes
        description: `Paire de ${this.valueToRank(pairVal)}`,
      };
    }

    // Hauteur : on retourne juste la carte la plus haute comme "winningCards"
    return {
      rank: HandRank.HAUTEUR,
      tiebreakers: valuesDesc,
      bestFive: cards5,
      winningCards: pickByValue(valuesDesc[0], 1),
      description: `Hauteur ${this.valueToRank(valuesDesc[0])}`,
    };
  }

  // ---------------- Helpers ----------------

  rankToValue(rank: string): number {
    const r = String(rank).trim().toUpperCase();
    if (r === 'A') return 14;
    if (r === 'K') return 13;
    if (r === 'Q') return 12;
    if (r === 'J') return 11;
    const n = Number(r);
    if (Number.isInteger(n) && n >= 2 && n <= 10) return n;
    throw new Error(`Invalid card rank: "${rank}"`);
  }

  valueToRank(v: number): string {
    if (v === 14) return 'A';
    if (v === 13) return 'K';
    if (v === 12) return 'Q';
    if (v === 11) return 'J';
    return String(v);
  }

  straightString(high: number): string {
    if (high === 5) return 'A 2 3 4 5';
    const seq = [high - 4, high - 3, high - 2, high - 1, high];
    return seq.map((x) => this.valueToRank(x)).join(' ');
  }

  toValued(cards: Card[]): ValuedCard[] {
    return cards.map((c) => ({ ...c, value: this.rankToValue(c.rank) }));
  }

  sortDesc(values: number[]): number[] {
    return [...values].sort((a, b) => b - a);
  }

  uniqueSortedDesc(values: number[]): number[] {
    return this.sortDesc(Array.from(new Set(values)));
  }

  isFlush(cards: ValuedCard[]): boolean {
    const s = cards[0].suit;
    return cards.every((c) => c.suit === s);
  }

  getStraightHigh(values: number[]): number | null {
    const uniq = this.uniqueSortedDesc(values);
    const withWheel = uniq.includes(14) ? [...uniq, 1] : [...uniq];
    const v = this.uniqueSortedDesc(withWheel);

    for (let i = 0; i < v.length; i++) {
      const start = v[i];
      const needed = [start, start - 1, start - 2, start - 3, start - 4];
      const ok = needed.every((x) => v.includes(x));
      if (ok) {
        if (needed[0] === 5 && needed.includes(1)) return 5;
        return needed[0];
      }
    }
    return null;
  }

  countByValue(values: number[]): Map<number, number> {
    const m = new Map<number, number>();
    for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
    return m;
  }

  groupsDesc(counts: Map<number, number>): Array<{ value: number; count: number }> {
    const groups = Array.from(counts.entries()).map(([value, count]) => ({ value, count }));
    groups.sort((a, b) => (b.count !== a.count ? b.count - a.count : b.value - a.value));
    return groups;
  }

  combinationsOf5(cards7: Card[]): Card[][] {
    const res: Card[][] = [];
    const n = cards7.length;
    for (let a = 0; a < n - 4; a++) {
      for (let b = a + 1; b < n - 3; b++) {
        for (let c = b + 1; c < n - 2; c++) {
          for (let d = c + 1; d < n - 1; d++) {
            for (let e = d + 1; e < n; e++) {
              res.push([cards7[a], cards7[b], cards7[c], cards7[d], cards7[e]]);
            }
          }
        }
      }
    }
    return res;
  }
}
