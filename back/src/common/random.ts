import { randomBytes, randomInt as cryptoRandomInt } from 'crypto';

export function randomInt(minInclusive: number, maxInclusive: number): number {
  if (!Number.isInteger(minInclusive) || !Number.isInteger(maxInclusive)) {
    throw new Error('randomInt bounds must be integers');
  }
  if (maxInclusive < minInclusive) {
    throw new Error('randomInt max must be >= min');
  }

  return cryptoRandomInt(minInclusive, maxInclusive + 1);
}

export function randomFloat(): number {
  return randomBytes(6).readUIntBE(0, 6) / 0x1000000000000;
}

export function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function randomCode(alphabet: string, length: number): string {
  if (!alphabet || alphabet.length === 0) throw new Error('alphabet is required');
  if (!Number.isInteger(length) || length <= 0) throw new Error('length must be positive');

  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += alphabet[randomInt(0, alphabet.length - 1)];
  }
  return code;
}
