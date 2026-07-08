'use client';

import type { GameSound } from './sound-events';

type AudioCtx = AudioContext & { webkitAudioContext?: typeof AudioContext };

let context: AudioContext | null = null;
let unlocked = false;

function getContext() {
  if (typeof window === 'undefined') return null;
  const AudioClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioClass) return null;
  context ??= new AudioClass() as AudioCtx;
  return context;
}

function now() {
  return getContext()?.currentTime ?? 0;
}

function outGain(volume = 0.22) {
  const ctx = getContext();
  if (!ctx) return null;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.connect(ctx.destination);
  gain.gain.exponentialRampToValueAtTime(volume, ctx.currentTime + 0.012);
  return gain;
}

function tone(frequency: number, duration: number, options: { type?: OscillatorType; volume?: number; at?: number; end?: number } = {}) {
  const ctx = getContext();
  if (!ctx) return;
  const start = options.at ?? ctx.currentTime;
  const stop = start + duration;
  const oscillator = ctx.createOscillator();
  const gain = outGain(options.volume ?? 0.18);
  if (!gain) return;
  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.end) oscillator.frequency.exponentialRampToValueAtTime(options.end, stop);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(options.volume ?? 0.18, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, stop);
  oscillator.connect(gain);
  oscillator.start(start);
  oscillator.stop(stop + 0.02);
}

function noise(duration: number, options: { volume?: number; at?: number; filter?: number } = {}) {
  const ctx = getContext();
  if (!ctx) return;
  const start = options.at ?? ctx.currentTime;
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(options.filter ?? 1200, start);
  const gain = outGain(options.volume ?? 0.08);
  if (!gain) return;
  gain.gain.setValueAtTime(options.volume ?? 0.08, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  source.start(start);
  source.stop(start + duration);
}

function arpeggio(notes: number[], step = 0.045, duration = 0.09, volume = 0.12) {
  const start = now();
  notes.forEach((note, index) => tone(note, duration, { at: start + index * step, volume, type: 'triangle' }));
}

export async function unlockAudio() {
  const ctx = getContext();
  if (!ctx || unlocked) return;
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    unlocked = true;
  } catch {
    unlocked = false;
  }
}

export function playGameSound(sound: GameSound) {
  const ctx = getContext();
  if (!ctx) return;
  void unlockAudio();
  const start = ctx.currentTime;

  switch (sound) {
    case 'button':
      tone(420, 0.045, { at: start, volume: 0.045, type: 'square', end: 620 });
      break;
    case 'toggle':
      tone(360, 0.06, { at: start, volume: 0.055, type: 'triangle', end: 540 });
      tone(720, 0.045, { at: start + 0.035, volume: 0.04, type: 'sine' });
      break;
    case 'open':
      arpeggio([420, 560, 740], 0.035, 0.075, 0.055);
      break;
    case 'close':
      arpeggio([520, 390, 260], 0.032, 0.07, 0.05);
      break;
    case 'chip':
      tone(880, 0.055, { at: start, volume: 0.07, type: 'triangle', end: 520 });
      noise(0.045, { at: start + 0.012, volume: 0.025, filter: 2600 });
      break;
    case 'card':
      noise(0.07, { at: start, volume: 0.045, filter: 1900 });
      tone(240, 0.05, { at: start + 0.018, volume: 0.025, type: 'triangle' });
      break;
    case 'deal':
      noise(0.05, { at: start, volume: 0.035, filter: 2100 });
      noise(0.05, { at: start + 0.09, volume: 0.032, filter: 2300 });
      break;
    case 'spin':
      tone(180, 0.38, { at: start, volume: 0.055, type: 'sawtooth', end: 760 });
      noise(0.36, { at: start, volume: 0.025, filter: 1400 });
      break;
    case 'reel-stop':
      tone(320, 0.055, { at: start, volume: 0.075, type: 'square', end: 180 });
      break;
    case 'roulette':
      tone(260, 0.58, { at: start, volume: 0.045, type: 'triangle', end: 960 });
      noise(0.5, { at: start + 0.05, volume: 0.025, filter: 3200 });
      break;
    case 'drop':
      tone(650, 0.12, { at: start, volume: 0.055, type: 'sine', end: 280 });
      noise(0.12, { at: start + 0.02, volume: 0.025, filter: 2400 });
      break;
    case 'dice':
      noise(0.16, { at: start, volume: 0.07, filter: 900 });
      tone(180, 0.07, { at: start + 0.08, volume: 0.04, type: 'triangle' });
      break;
    case 'cashout':
      arpeggio([520, 660, 880, 1174], 0.045, 0.11, 0.07);
      break;
    case 'win':
      arpeggio([523, 659, 784, 1046], 0.05, 0.13, 0.075);
      break;
    case 'loss':
      tone(260, 0.12, { at: start, volume: 0.06, type: 'triangle', end: 130 });
      tone(180, 0.16, { at: start + 0.09, volume: 0.05, type: 'sine', end: 90 });
      break;
    case 'jackpot':
      arpeggio([659, 784, 988, 1318, 1567], 0.055, 0.18, 0.09);
      noise(0.22, { at: start + 0.08, volume: 0.035, filter: 4200 });
      break;
    case 'crash':
      tone(620, 0.22, { at: start, volume: 0.08, type: 'sawtooth', end: 120 });
      noise(0.22, { at: start + 0.03, volume: 0.055, filter: 520 });
      break;
    case 'notification':
      tone(784, 0.08, { at: start, volume: 0.055, type: 'sine' });
      tone(1046, 0.1, { at: start + 0.08, volume: 0.052, type: 'sine' });
      break;
    default:
      break;
  }
}
