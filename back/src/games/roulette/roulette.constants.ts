export const ROULETTE_MIN = 0;
export const ROULETTE_MAX = 36;

/**
 * Roulette Française (single zero)
 * Couleurs standard (version la plus utilisée en casino européen).
 */
export const RED_NUMBERS = new Set<number>([
  1, 3, 5, 7, 9,
  12, 14, 16, 18,
  19, 21, 23, 25, 27,
  30, 32, 34, 36,
]);

export const BLACK_NUMBERS = new Set<number>([
  2, 4, 6, 8, 10,
  11, 13, 15, 17,
  20, 22, 24, 26, 28,
  29, 31, 33, 35,
]);

export function isRed(n: number): boolean {
  return RED_NUMBERS.has(n);
}

export function isBlack(n: number): boolean {
  return BLACK_NUMBERS.has(n);
}

export function isEven(n: number): boolean {
  return n !== 0 && n % 2 === 0;
}

export function isOdd(n: number): boolean {
  return n !== 0 && n % 2 === 1;
}

export function isLow(n: number): boolean {
  return n >= 1 && n <= 18;
}

export function isHigh(n: number): boolean {
  return n >= 19 && n <= 36;
}

/**
 * Colonnes (mise "column") :
 * - Column 1: 1,4,7,...,34
 * - Column 2: 2,5,8,...,35
 * - Column 3: 3,6,9,...,36
 */
export function columnNumbers(column: 1 | 2 | 3): number[] {
  const nums: number[] = [];
  for (let n = column; n <= 36; n += 3) nums.push(n);
  return nums;
}

/**
 * Douzaines :
 * - Dozen 1: 1..12
 * - Dozen 2: 13..24
 * - Dozen 3: 25..36
 */
export function dozenNumbers(dozen: 1 | 2 | 3): number[] {
  if (dozen === 1) return range(1, 12);
  if (dozen === 2) return range(13, 24);
  return range(25, 36);
}

export function range(a: number, b: number): number[] {
  const r: number[] = [];
  for (let i = a; i <= b; i++) r.push(i);
  return r;
}
