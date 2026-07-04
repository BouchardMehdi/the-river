import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CircleDot, Sparkles } from 'lucide-react';

export const dynamic = 'force-dynamic';

const games = [
  {
    href: '/games/slots',
    image: '/assets/home/game-slot.png',
    kind: 'Solo',
    status: 'Disponible',
    title: 'Machine a sous',
    text: 'Machines rapides, spins courts et resultats instantanes.',
    tone: 'blue',
  },
  {
    href: '/games/roulette',
    image: '/assets/home/game-roulette.png',
    kind: 'Solo',
    status: 'Disponible',
    title: 'Roulette',
    text: 'Paris simples, mises rapides et suivi direct des gains.',
    tone: 'green',
  },
  {
    href: '/games/poker',
    image: '/assets/home/game-poker.png',
    kind: 'Table',
    status: 'Multijoueur',
    title: 'Poker',
    text: 'Tables, blinds, actions et showdown entre joueurs.',
    tone: 'red',
  },
  {
    href: '/games/blackjack',
    image: '/assets/home/game-blackjack.png',
    kind: 'Table',
    status: 'Multijoueur',
    title: 'Blackjack',
    text: 'Lobby, mises, hit, stand et dealer automatique.',
    tone: 'gold',
  },
  {
    href: '/games/craps',
    image: '/assets/home/game-craps.png',
    kind: 'Solo',
    status: 'Disponible',
    title: 'Craps',
    text: 'Table de des, pass line, field, hardways et mises rapides.',
    tone: 'craps',
  },
  {
    href: '/games/pachinko',
    image: '/assets/home/game-pachinko.png',
    kind: 'Solo',
    status: 'Disponible',
    title: 'Pachinko',
    text: 'Bille, pegs, risques et multiplicateurs en cascade.',
    tone: 'pachinko',
  },
  {
    href: '/games/hi-lo',
    image: '/assets/cards/spades_A.png',
    kind: 'Solo',
    status: 'Disponible',
    title: 'Hi-Lo',
    text: 'Devine plus haut ou plus bas et cashout avant de casser ta serie.',
    tone: 'hilo',
  },
  {
    href: '/games/mines',
    image: '/assets/home/game-mines.svg',
    kind: 'Solo',
    status: 'Disponible',
    title: 'Mines',
    text: 'Ouvre les gemmes, evite les bombes et cashout au bon moment.',
    tone: 'mines',
  },
  {
    href: '/games/keno',
    image: '/assets/home/game-keno.svg',
    kind: 'Solo',
    status: 'Disponible',
    title: 'Keno',
    text: 'Choisis tes numeros, suis le tirage et vise les gros multiplicateurs.',
    tone: 'keno',
  },
] as const;

const dayIndex = Math.floor(Date.now() / 86_400_000) % games.length;
const featured = games[dayIndex];

export default function GamesPage() {
  return (
    <section className="games-page">
      <header className="games-hero">
        <div className="games-hero-copy">
          <span className="welcome-pill">
            <Sparkles size={15} /> Hub des jeux
          </span>
          <h1>Choisis ta table.</h1>
          <p>Lance une session, rejoins une table ou choisis ton jeu casino prefere.</p>
          <div className="button-row">
            <Link className="button" href={featured.href}>
              Jouer maintenant <ArrowRight size={17} />
            </Link>
            <Link className="button secondary" href="/dashboard">
              Voir mes stats
            </Link>
          </div>
        </div>

        <Link className="featured-game-card" href={featured.href}>
          <div>
            <span>{featured.status}</span>
            <h2>{featured.title}</h2>
            <p>{featured.text}</p>
          </div>
          <Image src={featured.image} alt={featured.title} width={360} height={260} priority />
        </Link>
      </header>

      <section className="games-library">
        <div className="section-heading games-heading">
          <div>
            <h2>Tous les jeux</h2>
            <p>Chaque carte ouvre la vraie page de jeu correspondante.</p>
          </div>
        </div>

        <div className="games-grid">
          {games.map((game) => (
            <Link className={`casino-game-card ${game.tone}`} href={game.href} key={game.href}>
              <div className="casino-game-image">
                <Image className={`game-art game-art-${game.tone}`} src={game.image} alt={game.title} width={420} height={260} />
              </div>
              <div className="casino-game-body">
                <div className="casino-game-meta">
                  <span><CircleDot size={13} /> {game.kind}</span>
                  <em>{game.status}</em>
                </div>
                <h3>{game.title}</h3>
                <p>{game.text}</p>
                <span className="button secondary small">
                  Ouvrir <ArrowRight size={15} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
