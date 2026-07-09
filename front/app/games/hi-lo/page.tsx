'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  BadgeDollarSign,
  BookOpen,
  CircleDollarSign,
  Play,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';
import { emitGameSound } from '@/lib/sound-events';

type HiLoGuess = 'HIGHER' | 'LOWER';

type HiLoCard = {
  rank: string;
  suit: string;
  value: number;
};

type HiLoHistory = {
  guess: HiLoGuess;
  nextCard: HiLoCard;
  outcome: 'WIN' | 'LOSE' | 'PUSH';
};

type HiLoSession = {
  active: boolean;
  bet?: number;
  currentCard?: HiLoCard;
  history?: HiLoHistory[];
  multiplier?: number;
  potentialPayout?: number;
  resumed?: boolean;
  streak?: number;
};

type HiLoActionResult = HiLoSession & {
  credits?: number | null;
  net?: number;
  outcome?: 'WIN' | 'LOSE' | 'PUSH' | 'CASHOUT';
  payout?: number;
  previousCard?: HiLoCard;
};

const rankLabels: Record<string, string> = {
  A: 'As',
  J: 'Valet',
  Q: 'Dame',
  K: 'Roi',
};

function cardAsset(card?: HiLoCard) {
  if (!card) return '/assets/cards/card-back.svg';
  return `/assets/cards/${card.suit}_${card.rank}.png`;
}

function cardLabel(card?: HiLoCard) {
  if (!card) return 'Carte cachee';
  return `${rankLabels[card.rank] ?? card.rank} de ${card.suit}`;
}

function formatMultiplier(value?: number) {
  return `${Number(value ?? 1).toLocaleString('fr-FR', { maximumFractionDigits: 2 })}x`;
}

function HiLoCardView({ card, muted = false }: { card?: HiLoCard; muted?: boolean }) {
  return (
    <div className={muted ? 'hilo-card muted' : 'hilo-card'}>
      <Image src={cardAsset(card)} alt={cardLabel(card)} width={240} height={336} priority />
      {card ? (
        <span>{card.rank}</span>
      ) : null}
    </div>
  );
}

function HiLoContent() {
  const [bet, setBet] = useState(25);
  const [session, setSession] = useState<HiLoActionResult | null>(null);
  const [previousCard, setPreviousCard] = useState<HiLoCard | undefined>();
  const [lastOutcome, setLastOutcome] = useState<HiLoActionResult['outcome']>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rulesOpen, setRulesOpen] = useState(false);

  const isActive = Boolean(session?.active);
  const currentCard = session?.currentCard;
  const history = session?.history ?? [];
  const canCashout = isActive && Number(session?.streak ?? 0) > 0;
  const potentialPayout = Number(session?.potentialPayout ?? 0);
  const streak = Number(session?.streak ?? 0);
  const multiplier = Number(session?.multiplier ?? 1);

  const statusText = useMemo(() => {
    if (!session) return 'Démarre une manche et lis la carte.';
    if (lastOutcome === 'LOSE') return 'Mauvaise lecture. La mise est perdue.';
    if (lastOutcome === 'CASHOUT') return `Cashout réussi pour ${Number(session.payout ?? 0).toLocaleString('fr-FR')} crédits.`;
    if (lastOutcome === 'PUSH') return 'Égalité: la carte change, la série reste intacte.';
    if (lastOutcome === 'WIN') return 'Bien vu. Le multiplicateur monte.';
    return 'Choisis si la prochaine carte sera plus haute ou plus basse.';
  }, [lastOutcome, session]);

  async function loadSession() {
    try {
      const out = await apiGet<HiLoSession>('/hilo/session');
      if (out.active) setSession(out);
    } catch {
      // Le jeu reste jouable même si aucune session n'est chargée.
    }
  }

  useEffect(() => {
    void loadSession();
  }, []);

  async function start() {
    if (loading) return;
    setError('');
    setLoading(true);
    setPreviousCard(undefined);
    setLastOutcome(undefined);

    try {
      const nextBet = Number(bet);
      emitBalanceDelta(-nextBet, 'hilo-bet');
      emitGameSound('deal');
      const out = await apiPost<HiLoSession>('/hilo/start', { bet: Number(bet) });
      if (out.resumed) emitBalanceDelta(nextBet, 'hilo-resume-refund');
      setSession(out);
    } catch (err) {
      emitBalanceDelta(Number(bet), 'hilo-refund');
      setError(err instanceof Error ? err.message : 'Impossible de démarrer Hi-Lo. Vérifie ta mise et ton solde.');
    } finally {
      setLoading(false);
    }
  }

  async function guess(nextGuess: HiLoGuess) {
    if (loading || !isActive) return;
    setError('');
    setLoading(true);
    setLastOutcome(undefined);

    try {
      const out = await apiPost<HiLoActionResult>('/hilo/guess', { guess: nextGuess });
      emitGameSound(out.outcome === 'LOSE' ? 'loss' : out.outcome === 'PUSH' ? 'toggle' : 'card');
      setPreviousCard(out.previousCard);
      setSession(out);
      setLastOutcome(out.outcome);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible. Démarre une manche puis choisis plus haut ou plus bas.');
    } finally {
      setLoading(false);
    }
  }

  async function cashout() {
    if (loading || !canCashout) return;
    setError('');
    setLoading(true);

    try {
      const out = await apiPost<HiLoActionResult>('/hilo/cashout');
      emitGameSound('cashout');
      if (Number(out.payout ?? 0) > 0) emitBalanceDelta(Number(out.payout), 'hilo-payout');
      setSession(out);
      setLastOutcome('CASHOUT');
      setPreviousCard(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cashout impossible. Il faut au moins une bonne réponse avant d’encaisser.');
    } finally {
      setLoading(false);
    }
  }

  function newRound() {
    setSession(null);
    setPreviousCard(undefined);
    setLastOutcome(undefined);
    setError('');
  }

  return (
    <section className="hilo-page">
      <header className="hilo-hero interactive-card">
        <div>
          <span className="welcome-pill"><Sparkles size={15} /> Hi-Lo</span>
          <h1>Lis la prochaine carte.</h1>
          <p>Devine si elle sera plus haute ou plus basse. Plus ta série dure, plus ton cashout grimpe.</p>
          <div className="button-row">
            <button className="button" disabled={loading || isActive || bet <= 0} onClick={() => void start()} type="button">
              <Play size={18} /> Démarrer
            </button>
            <button className="button secondary" onClick={() => setRulesOpen(true)} type="button">
              <BookOpen size={18} /> Règles
            </button>
          </div>
        </div>
        <div className="hilo-hero-stack" aria-hidden="true">
          <HiLoCardView card={{ rank: 'A', suit: 'spades', value: 14 }} muted />
          <HiLoCardView card={{ rank: '7', suit: 'hearts', value: 7 }} />
        </div>
      </header>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="hilo-layout">
        <section className="hilo-table interactive-card">
          <div className="hilo-table-felt">
            <div className="hilo-card-zone previous">
              <span>Carte precedente</span>
              <HiLoCardView card={previousCard} muted={!previousCard} />
            </div>

            <div className={`hilo-card-zone current ${lastOutcome ? lastOutcome.toLowerCase() : ''}`}>
              <span>Carte actuelle</span>
              <HiLoCardView card={currentCard} />
            </div>

            <div className="hilo-streak-orbit">
              <strong>{streak}</strong>
              <span>serie</span>
            </div>
          </div>

          <div className="hilo-action-strip">
            <button className="button secondary hilo-lower" disabled={loading || !isActive} onClick={() => void guess('LOWER')} type="button">
              <ArrowDown size={20} /> Plus bas
            </button>
            <button className="button hilo-cashout" disabled={loading || !canCashout} onClick={() => void cashout()} type="button">
              <BadgeDollarSign size={20} /> Cashout {potentialPayout.toLocaleString('fr-FR')}
            </button>
            <button className="button secondary hilo-higher" disabled={loading || !isActive} onClick={() => void guess('HIGHER')} type="button">
              <ArrowUp size={20} /> Plus haut
            </button>
          </div>
        </section>

        <aside className="hilo-side">
          <section className="hilo-panel interactive-card">
            <div className="card-heading">
              <h2>Manche</h2>
              <button className="icon-button" onClick={newRound} type="button" title="Nouvelle manche">
                <RotateCcw size={17} />
              </button>
            </div>
            <label>
              <span>Mise</span>
              <input disabled={loading || isActive} min={1} type="number" value={bet} onChange={(event) => setBet(Number(event.target.value))} />
            </label>
            <div className="hilo-kpis">
              <span>Multiplicateur <strong>{formatMultiplier(multiplier)}</strong></span>
              <span>Cashout <strong>{potentialPayout.toLocaleString('fr-FR')}</strong></span>
              <span>Mise <strong>{Number(session?.bet ?? bet).toLocaleString('fr-FR')}</strong></span>
            </div>
            <p>{statusText}</p>
          </section>

          <section className="hilo-panel interactive-card">
            <div className="card-heading">
              <h2>Historique</h2>
              {lastOutcome === 'CASHOUT' ? <Trophy size={19} /> : null}
            </div>
            <div className="hilo-history">
              {history.length > 0 ? history.slice().reverse().map((item, index) => (
                <article className={item.outcome.toLowerCase()} key={`${item.nextCard.suit}-${item.nextCard.rank}-${index}`}>
                  <span>{item.guess === 'HIGHER' ? 'Plus haut' : 'Plus bas'}</span>
                  <strong>{item.nextCard.rank}</strong>
                  <em>{item.outcome === 'WIN' ? 'Correct' : item.outcome === 'PUSH' ? 'Egalite' : 'Perdu'}</em>
                </article>
              )) : <p>Aucune carte jouee pour le moment.</p>}
            </div>
          </section>
        </aside>
      </div>

      <aside className={rulesOpen ? 'hilo-rules-drawer open' : 'hilo-rules-drawer'} aria-hidden={!rulesOpen}>
        <div className="panel-heading">
          <div>
            <h2>Règles du Hi-Lo</h2>
            <p>Un jeu rapide base sur la valeur des cartes.</p>
          </div>
          <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" title="Fermer">
            <X size={18} />
          </button>
        </div>
        <div className="hilo-rules-scroll">
          <article>
            <CircleDollarSign size={18} />
            <div>
              <h3>Mise</h3>
              <p>La mise est retiree au demarrage de la manche. Tu peux cashout apres au moins une bonne reponse.</p>
            </div>
          </article>
          <article>
            <ArrowUp size={18} />
            <div>
              <h3>Plus haut / plus bas</h3>
              <p>Les cartes vont de 2 a As. Si la valeur est egale, le tour est push et ta serie ne change pas.</p>
            </div>
          </article>
          <article>
            <Trophy size={18} />
            <div>
              <h3>Serie</h3>
              <p>Chaque bonne lecture augmente le multiplicateur. Une mauvaise lecture termine la manche et perd la mise.</p>
            </div>
          </article>
        </div>
      </aside>
    </section>
  );
}

export default function HiLoPage() {
  return (
    <RequireAuth>
      <HiLoContent />
    </RequireAuth>
  );
}
