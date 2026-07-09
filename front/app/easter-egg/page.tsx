'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Crown, LockKeyhole, Sparkles, Swords } from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';
import { emitGameSound } from '@/lib/sound-events';

type EggStatus = {
  unlocked?: boolean;
  title?: string;
  game?: string | null;
  claimedAt?: string | null;
};

type DragonTigerBet = 'DRAGON' | 'TIGER' | 'TIE';

type DragonTigerCard = {
  rank: string;
  suit: string;
  value: number;
};

type DragonTigerRound = {
  bet: number;
  betOn: DragonTigerBet;
  credits?: number | null;
  dragon: DragonTigerCard;
  net: number;
  payout: number;
  tiger: DragonTigerCard;
  winner: DragonTigerBet;
};

const bets: Array<{ key: DragonTigerBet; label: string; text: string }> = [
  { key: 'DRAGON', label: 'Dragon', text: 'La carte Dragon bat Tiger.' },
  { key: 'TIGER', label: 'Tiger', text: 'La carte Tiger bat Dragon.' },
  { key: 'TIE', label: 'Tie', text: 'Les deux cartes ont la meme valeur.' },
];

function cardAsset(card?: DragonTigerCard | null) {
  if (!card) return '/assets/cards/card-back.svg';
  return `/assets/cards/${card.suit}_${card.rank}.png`;
}

function winnerLabel(winner?: DragonTigerBet) {
  if (winner === 'DRAGON') return 'Dragon gagne';
  if (winner === 'TIGER') return 'Tiger gagne';
  if (winner === 'TIE') return 'Egalite';
  return 'En attente';
}

function EasterEggContent() {
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState<EggStatus | null>(null);
  const [bet, setBet] = useState(25);
  const [betOn, setBetOn] = useState<DragonTigerBet>('DRAGON');
  const [round, setRound] = useState<DragonTigerRound | null>(null);
  const [dealing, setDealing] = useState(false);
  const [error, setError] = useState('');

  const unlocked = Boolean(status?.unlocked);
  const selectedBet = useMemo(() => bets.find((item) => item.key === betOn), [betOn]);

  async function load() {
    try {
      setStatus(await apiGet<EggStatus>('/easter-egg/status'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de vérifier l’accès au Salon du Dragon.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function play() {
    setError('');
    setDealing(true);
    setRound(null);

    try {
      emitBalanceDelta(-Math.trunc(bet), 'dragon-tiger-bet');
      emitGameSound('deal');
      const result = await apiPost<DragonTigerRound>('/dragon-tiger/play', { bet, betOn });
      window.setTimeout(() => {
        setRound(result);
        emitGameSound(Number(result.payout ?? 0) > 0 ? 'win' : 'loss');
        if (Number(result.payout ?? 0) > 0) emitBalanceDelta(result.payout, 'dragon-tiger-payout');
        void refreshUser();
        setDealing(false);
      }, 650);
    } catch (err) {
      setDealing(false);
      setError(err instanceof Error ? err.message : 'Impossible de lancer la partie. Vérifie ta mise et ton accès au salon.');
      emitBalanceDelta(Math.trunc(bet), 'dragon-tiger-refund');
    }
  }

  if (!unlocked) {
    return (
      <section className="dragon-page locked">
        <div className="dragon-locked-card">
          <span className="welcome-pill">
            <LockKeyhole size={15} /> Salon ferme
          </span>
          <h1>???</h1>
          <p>Une invitation circule dans les salles privees. Termine la quete secrete du dashboard pour ouvrir cette porte.</p>
          <Link className="button" href="/dashboard">
            Voir les quetes <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="dragon-page">
      <header className="dragon-hero">
        <div>
          <span className="welcome-pill">
            <Sparkles size={15} /> Salon du Dragon
          </span>
          <h1>Dragon Tiger</h1>
          <p>Deux cartes, une decision. Mise sur Dragon, Tiger ou l egalite.</p>
        </div>
        <div className="dragon-rules">
          <strong>Règles rapides</strong>
          <span>Dragon/Tiger paient 1:1</span>
          <span>Tie paie 8:1</span>
          <span>En egalite, Dragon/Tiger sont rembourses</span>
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <section className="dragon-table-panel">
        <div className="dragon-table">
          <div className="dragon-side dragon-side-left">
            <span>Dragon</span>
            <div className={round?.winner === 'DRAGON' ? 'dragon-card winner' : 'dragon-card'}>
              <Image src={dealing ? '/assets/cards/card-back.svg' : cardAsset(round?.dragon)} alt="Carte Dragon" width={190} height={266} />
            </div>
          </div>

          <div className="dragon-center">
            <div className="dragon-deck">
              <Image src="/assets/cards/card-back.svg" alt="Paquet" width={190} height={266} />
            </div>
            <div className="dragon-vs">
              <Swords size={26} />
              <strong>{winnerLabel(round?.winner)}</strong>
              <span>{round ? `${round.payout} crédits retournés` : selectedBet?.text}</span>
            </div>
          </div>

          <div className="dragon-side dragon-side-right">
            <span>Tiger</span>
            <div className={round?.winner === 'TIGER' ? 'dragon-card winner' : 'dragon-card'}>
              <Image src={dealing ? '/assets/cards/card-back.svg' : cardAsset(round?.tiger)} alt="Carte Tiger" width={190} height={266} />
            </div>
          </div>
        </div>

        <aside className="dragon-controls">
          <h2>Ticket</h2>
          <label>
            Mise
            <input min={1} onChange={(event) => setBet(Math.max(1, Math.trunc(Number(event.target.value) || 1)))} type="number" value={bet} />
          </label>
          <div className="dragon-bet-grid">
            {bets.map((item) => (
              <button className={betOn === item.key ? 'dragon-bet active' : 'dragon-bet'} key={item.key} onClick={() => setBetOn(item.key)} type="button">
                <Crown size={16} />
                <strong>{item.label}</strong>
                <span>{item.text}</span>
              </button>
            ))}
          </div>
          <button className="button" disabled={dealing} onClick={() => void play()} type="button">
            {dealing ? 'Distribution...' : 'Jouer'} <ArrowRight size={17} />
          </button>
        </aside>
      </section>
    </section>
  );
}

export default function EasterEggPage() {
  return (
    <RequireAuth>
      <EasterEggContent />
    </RequireAuth>
  );
}
