import Image from 'next/image';
import Link from 'next/link';
import { BarChart3, Radar, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { HomeAsset } from '@/components/home-asset';

const benefits = [
  {
    icon: BarChart3,
    title: 'Statistiques detaillees',
    text: 'Visualise tes gains, pertes et tendances en temps reel.',
  },
  {
    icon: Radar,
    title: 'Analyse avancee',
    text: 'Comprends tes habitudes et ajuste tes strategies.',
  },
  {
    icon: ShieldCheck,
    title: 'Securise et prive',
    text: 'Ton compte, tes credits et ta progression restent proteges.',
  },
  {
    icon: Zap,
    title: 'Mises a jour live',
    text: 'Suis les tables, les quetes et les resultats instantanement.',
  },
];

const games = [
  {
    href: '/games/slots',
    image: '/assets/home/game-slot.png',
    title: 'Machine a sous',
    variant: 'slots',
  },
  {
    href: '/games/roulette',
    image: '/assets/home/game-roulette.png',
    title: 'Roulette',
    variant: 'roulette',
  },
  {
    href: '/games/poker',
    image: '/assets/home/game-poker.png',
    title: 'Poker',
    variant: 'poker',
  },
  {
    href: '/games/blackjack',
    image: '/assets/home/game-blackjack.png',
    title: 'Blackjack',
    variant: 'blackjack',
  },
  {
    href: '/games/craps',
    image: '/assets/home/game-craps.png',
    title: 'Craps',
    variant: 'craps',
  },
  {
    href: '/games/pachinko',
    image: '/assets/home/game-pachinko.png',
    title: 'Pachinko',
    variant: 'pachinko',
  },
  {
    href: '/games/hi-lo',
    image: '/assets/home/game-hilo.png',
    title: 'Hi-Lo',
    variant: 'hilo',
  },
  {
    href: '/games/mines',
    image: '/assets/home/game-mines.png',
    title: 'Mines',
    variant: 'mines',
  },
  {
    href: '/games/keno',
    image: '/assets/home/game-keno.png',
    title: 'Keno',
    variant: 'keno',
  },
  {
    href: '/games/baccarat',
    image: '/assets/home/game-baccarat.png',
    title: 'Baccarat',
    variant: 'baccarat',
  },
  {
    href: '/games/wheel-of-fortune',
    image: '/assets/home/game-wheel.png',
    title: 'Wheel of Fortune',
    variant: 'wheel',
  },
  {
    href: '/games/crash',
    image: '/assets/home/game-crash.png',
    title: 'Crash',
    variant: 'crash',
  },
] as const;

export default function HomePage() {
  return (
    <section className="landing-page">
      <div className="landing-hero">
        <div className="landing-copy">
          <span className="welcome-pill">
            <Sparkles size={15} /> Bienvenue chez THE RIVER
          </span>
          <h1>
            Votre espace.
            <span>Vos performances.</span>
            Vos victoires.
          </h1>
          <p>
            Analyse tes statistiques, suis tes credits, progresse dans les quetes et
            prends le controle de tes sessions casino.
          </p>
          <div className="button-row">
            <Link className="button" href="/register">
              Creer un compte
            </Link>
            <Link className="button secondary" href="/login">
              Se connecter
            </Link>
          </div>
        </div>

        <HomeAsset
          alt="Roulette, cartes et jetons THE RIVER"
          className="hero-product-image"
          src="/assets/home/hero-casino.png"
          variant="hero"
        />
      </div>

      <div className="benefit-grid">
        {benefits.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <article className="benefit-card" key={benefit.title}>
              <Icon size={28} />
              <h2>{benefit.title}</h2>
              <p>{benefit.text}</p>
            </article>
          );
        })}
      </div>

      <section className="landing-section">
        <div className="section-heading">
          <h2>Nos jeux</h2>
          <p>Retrouve les tables et machines principales de THE RIVER.</p>
        </div>
        <div className="landing-games">
          {games.map((game) => (
            <Link className="landing-game-card" href={game.href} key={game.href}>
              <HomeAsset
                alt={`${game.title} THE RIVER`}
                className="landing-game-image"
                src={game.image}
                variant={game.variant}
              />
              <h3>{game.title}</h3>
              <span className="button secondary small">Voir mes stats</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="landing-cta">
        <div className="gift-box" aria-hidden="true" />
        <div>
          <h2>Pret a ameliorer votre experience ?</h2>
          <p>Rejoins les joueurs de THE RIVER et pilote tes performances en credits.</p>
        </div>
        <Link className="button" href="/register">
          Creer un compte maintenant
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="footer-brand">
          <Image src="/assets/logo-the-river.png" alt="THE RIVER" width={76} height={76} />
          <strong>THE RIVER</strong>
        </div>
        <div>
          <strong>Navigation</strong>
          <Link href="/">Accueil</Link>
          <Link href="/games">Jeux</Link>
          <Link href="/dashboard">Dashboard</Link>
        </div>
        <div>
          <strong>Compte</strong>
          <Link href="/login">Connexion</Link>
          <Link href="/register">Inscription</Link>
        </div>
        <div>
          <strong>Casino</strong>
          <span>Credits</span>
          <span>Quetes</span>
          <span>Classements</span>
        </div>
      </footer>
    </section>
  );
}
