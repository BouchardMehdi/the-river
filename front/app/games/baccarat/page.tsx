'use client';

import Image from 'next/image';
import type { CSSProperties } from 'react';
import { useMemo, useRef, useState } from 'react';
import {
  BadgeDollarSign,
  BookOpen,
  CircleDollarSign,
  Crown,
  Landmark,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';
import { emitGameSound } from '@/lib/sound-events';

type BaccaratBet = 'PLAYER' | 'BANKER' | 'TIE';
type BaccaratSide = 'PLAYER' | 'BANKER';

type BaccaratCard = {
  rank: string;
  suit: string;
  value: number;
};

type DealStep = {
  side: BaccaratSide;
  card: BaccaratCard;
};

type BaccaratResult = {
  banker: BaccaratCard[];
  bankerTotal: number;
  bet: number;
  betOn: BaccaratBet;
  dealOrder: DealStep[];
  natural: boolean;
  net: number;
  payout: number;
  player: BaccaratCard[];
  playerTotal: number;
  winner: BaccaratBet;
};

const betOptions: Array<{ key: BaccaratBet; label: string; text: string; payout: string }> = [
  { key: 'PLAYER', label: 'Player', payout: '1:1', text: 'Main joueur' },
  { key: 'BANKER', label: 'Banker', payout: '0.95:1', text: 'Main banque' },
  { key: 'TIE', label: 'Tie', payout: '8:1', text: 'Egalite' },
];

function cardAsset(card: BaccaratCard) {
  return `/assets/cards/${card.suit}_${card.rank}.png`;
}

function formatCredits(value?: number) {
  return `${Number(value ?? 0).toLocaleString('fr-FR')} crédits`;
}

function BaccaratCardView({ card, index }: { card: BaccaratCard; index: number }) {
  return (
    <div
      className="baccarat-card"
      style={{ '--card-offset': `${index * 8}px`, '--card-rotate': `${(index - 1) * 5}deg` } as CSSProperties}
    >
      <Image src={cardAsset(card)} alt={`${card.rank} ${card.suit}`} width={144} height={202} priority />
    </div>
  );
}

function BaccaratContent() {
  const [bet, setBet] = useState(25);
  const [betOn, setBetOn] = useState<BaccaratBet>('PLAYER');
  const [playerCards, setPlayerCards] = useState<BaccaratCard[]>([]);
  const [bankerCards, setBankerCards] = useState<BaccaratCard[]>([]);
  const [result, setResult] = useState<BaccaratResult | null>(null);
  const [pendingResult, setPendingResult] = useState<BaccaratResult | null>(null);
  const [dealing, setDealing] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [error, setError] = useState('');
  const timersRef = useRef<number[]>([]);

  const playerTotal = result?.playerTotal ?? playerCards.reduce((sum, card) => sum + card.value, 0) % 10;
  const bankerTotal = result?.bankerTotal ?? bankerCards.reduce((sum, card) => sum + card.value, 0) % 10;
  const activeBet = useMemo(() => betOptions.find((option) => option.key === betOn), [betOn]);

  function clearTimers() {
    for (const timer of timersRef.current) window.clearTimeout(timer);
    timersRef.current = [];
  }

  function resetTable() {
    if (dealing) return;
    clearTimers();
    setPlayerCards([]);
    setBankerCards([]);
    setResult(null);
    setPendingResult(null);
    setError('');
  }

  async function play() {
    if (dealing) return;
    const nextBet = Math.trunc(Number(bet));
    if (!Number.isFinite(nextBet) || nextBet <= 0) {
      setError('Mise invalide. Entre un montant positif et disponible sur ton solde.');
      return;
    }

    clearTimers();
    setError('');
    setDealing(true);
    setPlayerCards([]);
    setBankerCards([]);
    setResult(null);
    setPendingResult(null);

    try {
      emitBalanceDelta(-nextBet, 'baccarat-bet');
      emitGameSound('deal');
      const out = await apiPost<BaccaratResult>('/baccarat/play', { bet: nextBet, betOn });
      setPendingResult(out);

      out.dealOrder.forEach((step, index) => {
        const timer = window.setTimeout(() => {
          emitGameSound('card');
          if (step.side === 'PLAYER') setPlayerCards((cards) => [...cards, step.card]);
          else setBankerCards((cards) => [...cards, step.card]);
        }, 430 * index);
        timersRef.current.push(timer);
      });

      const finishTimer = window.setTimeout(() => {
        setResult(out);
        setPendingResult(null);
        setDealing(false);
        emitGameSound(Number(out.payout ?? 0) > 0 ? 'win' : 'loss');
        if (Number(out.payout ?? 0) > 0) emitBalanceDelta(Number(out.payout), 'baccarat-payout');
      }, 430 * out.dealOrder.length + 560);
      timersRef.current.push(finishTimer);
    } catch (err) {
      emitBalanceDelta(nextBet, 'baccarat-refund');
      setDealing(false);
      setError(err instanceof Error ? err.message : 'Impossible de distribuer au Baccarat. Vérifie ta mise et ton solde.');
    }
  }

  const statusText = useMemo(() => {
    if (dealing) return 'Distribution en cours.';
    if (!result) return `Mise sur ${activeBet?.label ?? 'Player'}, puis lance la main.`;
    if (result.winner === 'TIE') return 'Egalite. Les mises Player/Banker sont remboursees.';
    return `${result.winner === 'PLAYER' ? 'Player' : 'Banker'} gagne avec ${result.winner === 'PLAYER' ? result.playerTotal : result.bankerTotal}.`;
  }, [activeBet, dealing, result]);

  return (
    <section className="baccarat-page">
      <header className="baccarat-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Baccarat</span>
          <h1>Choisis ton cote.</h1>
          <p>Mise sur Player, Banker ou Tie, puis regarde la distribution decider la main gagnante.</p>
          <div className="button-row">
            <button className="button" disabled={dealing || bet <= 0} onClick={() => void play()} type="button">
              <Play size={18} /> Distribuer
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Règles
            </button>
          </div>
        </div>
        <div className="baccarat-hero-badges" aria-hidden="true">
          <span>Player</span>
          <strong>9</strong>
          <span>Banker</span>
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="baccarat-layout">
        <section className="baccarat-table-panel interactive-card">
          <div className="baccarat-table">
            <div className="baccarat-score player">
              <span>Player</span>
              <strong>{playerTotal}</strong>
            </div>
            <div className="baccarat-score banker">
              <span>Banker</span>
              <strong>{bankerTotal}</strong>
            </div>

            <div className={result?.winner === 'PLAYER' ? 'baccarat-hand winner' : 'baccarat-hand'} data-side="Player">
              {playerCards.map((card, index) => <BaccaratCardView card={card} index={index} key={`${card.suit}-${card.rank}-${index}`} />)}
            </div>

            <div className={result?.winner === 'BANKER' ? 'baccarat-hand winner' : 'baccarat-hand'} data-side="Banker">
              {bankerCards.map((card, index) => <BaccaratCardView card={card} index={index} key={`${card.suit}-${card.rank}-${index}`} />)}
            </div>

            <div className={result?.winner === 'TIE' ? 'baccarat-tie-badge show' : 'baccarat-tie-badge'}>
              Tie
            </div>
          </div>
          <div className="baccarat-table-actions">
            <button className="button" disabled={dealing || bet <= 0} onClick={() => void play()} type="button">
              <Play size={18} /> Distribuer
            </button>
            <button className="button secondary" disabled={dealing} onClick={resetTable} type="button">
              <RotateCcw size={18} /> Nouvelle main
            </button>
          </div>
        </section>

        <aside className="baccarat-side">
          <section className="baccarat-panel interactive-card">
            <div className="card-heading">
              <h2>Ticket</h2>
              <Landmark size={19} />
            </div>
            <label>
              <span>Mise</span>
              <input disabled={dealing} min={1} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <div className="baccarat-bet-grid">
              {betOptions.map((option) => (
                <button className={betOn === option.key ? 'selected' : ''} disabled={dealing} key={option.key} onClick={() => setBetOn(option.key)} type="button">
                  <strong>{option.label}</strong>
                  <span>{option.text}</span>
                  <em>{option.payout}</em>
                </button>
              ))}
            </div>
            <p>{statusText}</p>
          </section>

          <section className="baccarat-panel interactive-card">
            <div className="card-heading">
              <h2>Résultat</h2>
              <Trophy size={19} />
            </div>
            <div className="baccarat-kpis">
              <span>Gagnant <strong>{result?.winner ?? '-'}</strong></span>
              <span>Gain <strong className={Number(result?.payout ?? 0) > 0 ? 'positive' : ''}>{formatCredits(result?.payout)}</strong></span>
              <span>Net <strong className={Number(result?.net ?? 0) >= 0 ? 'positive' : 'negative'}>{formatCredits(result?.net)}</strong></span>
              <span>Naturel <strong>{(result ?? pendingResult)?.natural ? 'Oui' : 'Non'}</strong></span>
            </div>
            <button className="button secondary" disabled={dealing} onClick={resetTable} type="button">
              <RotateCcw size={18} /> Nouvelle main
            </button>
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'baccarat-rules-drawer open' : 'baccarat-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Règles du Baccarat</h2>
            <p>Le total est toujours calcule modulo 10.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="baccarat-rules-scroll">
          <article>
            <Crown size={18} />
            <div>
              <h3>Objectif</h3>
              <p>La main la plus proche de 9 gagne. Les 10, valet, dame et roi valent 0.</p>
            </div>
          </article>
          <article>
            <CircleDollarSign size={18} />
            <div>
              <h3>Paiements</h3>
              <p>Player paie 1:1, Banker paie 0.95:1 avec commission, Tie paie 8:1.</p>
            </div>
          </article>
          <article>
            <BadgeDollarSign size={18} />
            <div>
              <h3>Egalite</h3>
              <p>Si le resultat est Tie, les mises Player et Banker sont remboursees.</p>
            </div>
          </article>
          <article>
            <BookOpen size={18} />
            <div>
              <h3>Troisieme carte</h3>
              <p>Le tirage de la troisieme carte suit la table Baccarat classique. En cas de naturel 8 ou 9, personne ne tire.</p>
            </div>
          </article>
        </div>
      </aside>
    </section>
  );
}

export default function BaccaratPage() {
  return (
    <RequireAuth>
      <BaccaratContent />
    </RequireAuth>
  );
}
