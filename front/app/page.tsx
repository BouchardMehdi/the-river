import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CircleDot, Club, Diamond, Spade } from 'lucide-react';

const games = [
  { href: '/games/poker', title: 'Poker', text: 'Tables casual, competition, blinds, bots et showdown.', mark: 'P' },
  { href: '/games/blackjack', title: 'Blackjack', text: 'Tables multijoueurs, mises, dealer automatique et chat.', mark: 'B' },
  { href: '/games/roulette', title: 'Roulette', text: 'Paris simples et inside bets sur roulette francaise.', mark: 'R' },
  { href: '/games/slots', title: 'Slots', text: 'Trois machines, patterns, jackpots et cles secretes.', mark: 'S' },
];

export default function HomePage() {
  return (
    <section className="hero-page">
      <div className="hero-copy">
        <div className="mini-list">
          <span className="tag">
            <Spade size={15} /> Casino social
          </span>
          <span className="tag">
            <Club size={15} /> Temps reel
          </span>
          <span className="tag">
            <Diamond size={15} /> Quetes
          </span>
        </div>
        <h1>THE RIVER</h1>
        <p>
          Un casino web connecte avec poker, blackjack, roulette, slots, progression,
          classements et surprises cachees.
        </p>
        <div className="button-row">
          <Link className="button" href="/dashboard">
            <ArrowRight size={18} />
            Entrer
          </Link>
          <Link className="button secondary" href="/register">
            Creer un compte
          </Link>
        </div>
        <div className="grid two" style={{ marginTop: 28 }}>
          {games.map((game) => (
            <Link className="game-card" href={game.href} key={game.href}>
              <span className="mark">{game.mark}</span>
              <div>
                <h2>{game.title}</h2>
                <p>{game.text}</p>
              </div>
              <span className="tag">
                <CircleDot size={14} /> Jouer
              </span>
            </Link>
          ))}
        </div>
      </div>

      <div className="hero-logo" aria-hidden="true">
        <Image src="/assets/logo-the-river.png" alt="" width={360} height={360} priority />
      </div>
    </section>
  );
}
