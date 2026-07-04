'use client';

import { useState } from 'react';

type AssetVariant =
  | 'hero'
  | 'slots'
  | 'roulette'
  | 'poker'
  | 'blackjack'
  | 'craps'
  | 'pachinko'
  | 'keno'
  | 'baccarat'
  | 'wheel';

type HomeAssetProps = {
  alt: string;
  className?: string;
  src: string;
  variant: AssetVariant;
};

export function HomeAsset({ alt, className, src, variant }: HomeAssetProps) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className={`home-asset ${className ?? ''}`}>
      {!hasError ? (
        <img
          alt={alt}
          decoding="async"
          loading={variant === 'hero' ? 'eager' : 'lazy'}
          onError={() => setHasError(true)}
          src={src}
        />
      ) : (
        <AssetFallback variant={variant} />
      )}
    </div>
  );
}

function AssetFallback({ variant }: { variant: AssetVariant }) {
  return (
    <div className={`asset-fallback ${variant}`} aria-hidden="true">
      {variant === 'hero' ? (
        <>
          <div className="hero-card hero-card-a">
            A<span>S</span>
          </div>
          <div className="hero-card hero-card-b">
            A<span>H</span>
          </div>
          <div className="hero-card hero-card-c">
            K<span>C</span>
          </div>
          <div className="roulette-wheel fallback-wheel">
            <div className="roulette-inner" />
            <div className="roulette-hub" />
          </div>
          <div className="chip-stack chip-green" />
          <div className="chip-stack chip-gold" />
          <div className="chip-stack chip-purple" />
        </>
      ) : null}
      {variant === 'slots' ? <span>777</span> : null}
      {variant === 'roulette' ? <div className="mini-wheel" /> : null}
      {variant === 'poker' ? <div className="mini-chips" /> : null}
      {variant === 'blackjack' ? <span>A K</span> : null}
      {variant === 'craps' ? <span>7</span> : null}
      {variant === 'pachinko' ? <span>9x</span> : null}
      {variant === 'keno' ? <span>22</span> : null}
      {variant === 'baccarat' ? <span>9</span> : null}
      {variant === 'wheel' ? <span>50x</span> : null}
    </div>
  );
}
