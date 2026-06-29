import Link from 'next/link';

const games = [
  ['Poker', '/games/poker', 'Tables, blinds, actions et showdown.'],
  ['Blackjack', '/games/blackjack', 'Lobby, mises, hit, stand et dealer.'],
  ['Roulette', '/games/roulette', 'Paris rapides et resultats instantanes.'],
  ['Slots', '/games/slots', 'Machines 3x3, 3x5 et 5x5.'],
  ['Craps', '/games/craps', 'Jeu secret lie aux cles.'],
];

export default function GamesPage() {
  return (
    <section className="page">
      <div className="page-title">
        <div>
          <h1>Jeux</h1>
          <p>Choisis ta table ou lance une session solo.</p>
        </div>
      </div>
      <div className="grid three">
        {games.map(([title, href, text]) => (
          <Link className="game-card" href={href} key={href}>
            <span className="mark">{title[0]}</span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
            <span className="tag">Ouvrir</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
