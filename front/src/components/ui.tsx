import type { Card } from '@/types/api';

export function StatusMessage({ type = 'info', children }: { type?: 'info' | 'error' | 'success'; children: React.ReactNode }) {
  return <p className={`status-message ${type}`}>{children}</p>;
}

export function PlayingCard({ card, hidden = false }: { card?: Card; hidden?: boolean }) {
  if (hidden || !card) return <span className="playing-card back">R</span>;
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <span className={red ? 'playing-card red' : 'playing-card'}>
      {card.rank}
      {card.suit}
    </span>
  );
}

export function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}
