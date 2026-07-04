'use client';

import { CSSProperties, FormEvent, useEffect, useMemo, useState } from 'react';
import { BookOpen, CircleDot, Coins, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { apiGet, apiPost } from '@/api/client';
import { RequireAuth } from '@/auth/require-auth';
import { useAuth } from '@/auth/auth-context';
import { StatusMessage } from '@/components/ui';
import { emitBalanceDelta } from '@/lib/balance-events';

type RouletteColor = 'RED' | 'BLACK' | 'GREEN';

type BetType =
  | 'STRAIGHT'
  | 'SPLIT'
  | 'STREET'
  | 'CORNER'
  | 'SIX_LINE'
  | 'DOZEN'
  | 'COLUMN'
  | 'RED'
  | 'BLACK'
  | 'EVEN'
  | 'ODD'
  | 'LOW'
  | 'HIGH';

type BetSelection =
  | { number: number }
  | { numbers: number[] }
  | { dozen: number }
  | { column: number }
  | Record<string, never>;

type BetPreset = {
  key: string;
  label: string;
  selection: BetSelection;
  covered: number[];
};

type BetConfig = {
  type: BetType;
  label: string;
  payout: string;
  description: string;
  presets?: BetPreset[];
  inputCount?: number;
};

type BetDraft = {
  id: string;
  type: BetType;
  amount: number;
  selectionKey: string;
  manualNumbers: number[];
};

type RouletteResponse = {
  result: {
    number: number;
    color: RouletteColor;
  };
  settlement: {
    totalStaked: number;
    totalProfit: number;
    totalReturn: number;
    winningBets: Array<{
      bet: {
        type: BetType;
        amount: number;
        selection?: BetSelection;
      };
      profit: number;
      returned: number;
    }>;
  };
  balance: number;
};

type RouletteStats = {
  period?: {
    key: string;
    startsAt: string;
  };
  totalSpins: number;
  hotNumbers: Array<{ number: number; count: number; percentage: number; color: RouletteColor }>;
  coldNumbers: Array<{ number: number; count: number; percentage: number; color: RouletteColor }>;
  distribution: Record<'even' | 'odd' | 'red' | 'black' | 'green', { count: number; percentage: number }>;
};

const wheelOrder = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const redNumbers = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const rows = Array.from({ length: 12 }, (_, row) => [row * 3 + 1, row * 3 + 2, row * 3 + 3]);
const tableRows = [
  Array.from({ length: 12 }, (_, index) => (index + 1) * 3),
  Array.from({ length: 12 }, (_, index) => (index + 1) * 3 - 1),
  Array.from({ length: 12 }, (_, index) => (index + 1) * 3 - 2),
];
const numberBetDefaults: Partial<Record<BetType, number[]>> = {
  STRAIGHT: [7],
  SPLIT: [7, 8],
  STREET: [7, 8, 9],
  CORNER: [7, 8, 10, 11],
  SIX_LINE: [7, 8, 9, 10, 11, 12],
};

function colorOf(number: number): RouletteColor {
  if (number === 0) return 'GREEN';
  return redNumbers.has(number) ? 'RED' : 'BLACK';
}

function makeBetConfigs(): BetConfig[] {
  return [
    { type: 'STRAIGHT', label: 'Plein', payout: '35:1', description: 'Un seul numero exact.', inputCount: 1 },
    { type: 'SPLIT', label: 'Cheval', payout: '17:1', description: 'Deux numeros voisins sur le tapis.', inputCount: 2 },
    { type: 'STREET', label: 'Transversale', payout: '11:1', description: 'Une ligne de trois numeros.', inputCount: 3 },
    { type: 'CORNER', label: 'Carre', payout: '8:1', description: 'Quatre numeros en bloc.', inputCount: 4 },
    { type: 'SIX_LINE', label: 'Sixain', payout: '5:1', description: 'Deux lignes de trois numeros.', inputCount: 6 },
    {
      type: 'DOZEN',
      label: 'Douzaine',
      payout: '2:1',
      description: '1-12, 13-24 ou 25-36.',
      presets: [
        { key: '1', label: '1ere douzaine (1-12)', selection: { dozen: 1 }, covered: Array.from({ length: 12 }, (_, i) => i + 1) },
        { key: '2', label: '2eme douzaine (13-24)', selection: { dozen: 2 }, covered: Array.from({ length: 12 }, (_, i) => i + 13) },
        { key: '3', label: '3eme douzaine (25-36)', selection: { dozen: 3 }, covered: Array.from({ length: 12 }, (_, i) => i + 25) },
      ],
    },
    {
      type: 'COLUMN',
      label: 'Colonne',
      payout: '2:1',
      description: 'Une des trois colonnes verticales.',
      presets: [
        { key: '1', label: 'Colonne 1', selection: { column: 1 }, covered: rows.map((row) => row[0]) },
        { key: '2', label: 'Colonne 2', selection: { column: 2 }, covered: rows.map((row) => row[1]) },
        { key: '3', label: 'Colonne 3', selection: { column: 3 }, covered: rows.map((row) => row[2]) },
      ],
    },
    { type: 'RED', label: 'Rouge', payout: '1:1', description: 'Tous les numeros rouges.', presets: [{ key: 'RED', label: 'Rouge', selection: {}, covered: Array.from(redNumbers) }] },
    { type: 'BLACK', label: 'Noir', payout: '1:1', description: 'Tous les numeros noirs.', presets: [{ key: 'BLACK', label: 'Noir', selection: {}, covered: Array.from({ length: 36 }, (_, i) => i + 1).filter((n) => !redNumbers.has(n)) }] },
    { type: 'EVEN', label: 'Pair', payout: '1:1', description: 'Numeros pairs de 1 a 36.', presets: [{ key: 'EVEN', label: 'Pair', selection: {}, covered: Array.from({ length: 18 }, (_, i) => (i + 1) * 2) }] },
    { type: 'ODD', label: 'Impair', payout: '1:1', description: 'Numeros impairs de 1 a 36.', presets: [{ key: 'ODD', label: 'Impair', selection: {}, covered: Array.from({ length: 18 }, (_, i) => i * 2 + 1) }] },
    { type: 'LOW', label: 'Manque', payout: '1:1', description: 'Numeros 1 a 18.', presets: [{ key: 'LOW', label: '1 - 18', selection: {}, covered: Array.from({ length: 18 }, (_, i) => i + 1) }] },
    { type: 'HIGH', label: 'Passe', payout: '1:1', description: 'Numeros 19 a 36.', presets: [{ key: 'HIGH', label: '19 - 36', selection: {}, covered: Array.from({ length: 18 }, (_, i) => i + 19) }] },
  ];
}

const betConfigs = makeBetConfigs();

function getBetConfig(type: BetType) {
  return betConfigs.find((config) => config.type === type) ?? betConfigs[0];
}

function createBetDraft(id: string, type: BetType = 'RED'): BetDraft {
  const config = getBetConfig(type);
  return {
    id,
    type,
    amount: 10,
    selectionKey: config.presets?.[0]?.key ?? '',
    manualNumbers: numberBetDefaults[type] ?? [],
  };
}

function resultAngle(number: number) {
  const index = Math.max(0, wheelOrder.indexOf(number));
  return (index + 0.5) * (360 / wheelOrder.length);
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function nextClockwiseAngle(previous: number, target: number, turns: number) {
  const delta = (normalizeAngle(target) - normalizeAngle(previous) + 360) % 360;
  return previous + turns * 360 + delta;
}

function nextCounterClockwiseAngle(previous: number, target: number, turns: number) {
  const delta = (normalizeAngle(previous) - normalizeAngle(target) + 360) % 360;
  return previous - turns * 360 - delta;
}

function buildBet(type: BetType, amount: number, preset: BetPreset | undefined, numbers: number[]) {
  if (type === 'STRAIGHT') {
    return {
      type,
      amount,
      selection: { number: Number(numbers[0]) },
    };
  }

  if (numberBetDefaults[type]) {
    return {
      type,
      amount,
      selection: { numbers: numbers.slice(0, numberBetDefaults[type]?.length ?? 0).map(Number) },
    };
  }

  return {
    type,
    amount,
    selection: preset?.selection ?? {},
  };
}

function buildBetFromDraft(draft: BetDraft) {
  const config = getBetConfig(draft.type);
  const preset = config.presets?.find((item) => item.key === draft.selectionKey) ?? config.presets?.[0];
  return buildBet(draft.type, Number(draft.amount), preset, draft.manualNumbers);
}

function getDraftCoveredNumbers(draft: BetDraft) {
  const config = getBetConfig(draft.type);
  if (config.inputCount) return draft.manualNumbers.slice(0, config.inputCount);
  const preset = config.presets?.find((item) => item.key === draft.selectionKey) ?? config.presets?.[0];
  return preset?.covered ?? [];
}

function describeBet(bet: RouletteResponse['settlement']['winningBets'][number]['bet']) {
  const config = betConfigs.find((item) => item.type === bet.type);
  const selection = bet.selection ?? {};

  if ('number' in selection) {
    return `${config?.label ?? bet.type} ${selection.number}`;
  }

  if ('numbers' in selection && Array.isArray(selection.numbers)) {
    return `${config?.label ?? bet.type} ${selection.numbers.join(' / ')}`;
  }

  if ('dozen' in selection) {
    return `${config?.label ?? bet.type} ${selection.dozen}`;
  }

  if ('column' in selection) {
    return `${config?.label ?? bet.type} ${selection.column}`;
  }

  return config?.label ?? bet.type;
}

function RouletteContent() {
  const { refreshUser, user } = useAuth();
  const [bets, setBets] = useState<BetDraft[]>(() => [createBetDraft('bet-1')]);
  const [activeBetId, setActiveBetId] = useState(() => 'bet-1');
  const [nextBetId, setNextBetId] = useState(2);
  const [result, setResult] = useState<RouletteResponse | null>(null);
  const [error, setError] = useState('');
  const [spinning, setSpinning] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [stats, setStats] = useState<RouletteStats | null>(null);
  const [statsError, setStatsError] = useState('');
  const [wheelAngle, setWheelAngle] = useState(0);
  const [ballAngle, setBallAngle] = useState(0);

  const activeBet = bets.find((bet) => bet.id === activeBetId) ?? bets[0];
  const activeConfig = useMemo(() => getBetConfig(activeBet.type), [activeBet.type]);
  const isNumberBet = Boolean(activeConfig.inputCount);
  const coveredNumbers = getDraftCoveredNumbers(activeBet);
  const totalStake = bets.reduce((sum, bet) => sum + Number(bet.amount), 0);
  const net = result ? result.settlement.totalReturn - result.settlement.totalStaked : 0;
  const distributionRows: Array<[string, RouletteStats['distribution'][keyof RouletteStats['distribution']] | undefined]> = [
    ['Pair', stats?.distribution.even],
    ['Impair', stats?.distribution.odd],
    ['Rouge', stats?.distribution.red],
    ['Noir', stats?.distribution.black],
    ['Zero', stats?.distribution.green],
  ];

  async function loadStats() {
    try {
      setStatsError('');
      const nextStats = await apiGet<RouletteStats>('/roulette/stats');
      setStats(nextStats);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Stats roulette indisponibles');
    }
  }

  useEffect(() => {
    void loadStats();
  }, []);

  function updateActiveBet(updater: (bet: BetDraft) => BetDraft) {
    setBets((current) => current.map((bet) => (bet.id === activeBet.id ? updater(bet) : bet)));
  }

  function addBet() {
    const next = createBetDraft(`bet-${nextBetId}`);
    setNextBetId((value) => value + 1);
    setBets((current) => [...current, next]);
    setActiveBetId(next.id);
  }

  function removeBet(id: string) {
    setBets((current) => {
      if (current.length === 1) return current;
      const next = current.filter((bet) => bet.id !== id);
      if (id === activeBetId) setActiveBetId(next[0].id);
      return next;
    });
  }

  function changeType(next: BetType) {
    const nextConfig = betConfigs.find((config) => config.type === next) ?? betConfigs[0];
    updateActiveBet((bet) => ({
      ...bet,
      type: next,
      selectionKey: nextConfig.presets?.[0]?.key ?? '',
      manualNumbers: numberBetDefaults[next] ?? [],
    }));
  }

  function updateManualNumber(index: number, value: number) {
    updateActiveBet((bet) => {
      const next = [...bet.manualNumbers];
      next[index] = value;
      return { ...bet, manualNumbers: next };
    });
  }

  function changeAmount(next: number) {
    updateActiveBet((bet) => ({ ...bet, amount: next }));
  }

  function changeSelectionKey(next: string) {
    updateActiveBet((bet) => ({ ...bet, selectionKey: next }));
  }

  function selectTableBet(type: BetType, value?: number | string) {
    const wasSameType = activeBet.type === type;

    if (numberBetDefaults[type]) {
      const count = numberBetDefaults[type]?.length ?? 1;
      const nextNumber = Number(value ?? 0);

      if (type === 'STRAIGHT') {
        updateActiveBet((bet) => ({ ...bet, type, selectionKey: '', manualNumbers: [nextNumber] }));
        return;
      }

      updateActiveBet((bet) => {
        const currentNumbers = wasSameType ? bet.manualNumbers.slice(0, count).filter((number) => Number.isFinite(number)) : [];
        if (currentNumbers.includes(nextNumber)) {
          return { ...bet, type, selectionKey: '', manualNumbers: currentNumbers.filter((number) => number !== nextNumber) };
        }

        const nextNumbers = [...currentNumbers, nextNumber];
        return {
          ...bet,
          type,
          selectionKey: '',
          manualNumbers: nextNumbers.length > count ? nextNumbers.slice(nextNumbers.length - count) : nextNumbers,
        };
      });
      return;
    }

    if (type === 'DOZEN' || type === 'COLUMN') {
      updateActiveBet((bet) => ({ ...bet, type, selectionKey: String(value ?? 1), manualNumbers: [] }));
      return;
    }

    updateActiveBet((bet) => ({ ...bet, type, selectionKey: type, manualNumbers: [] }));
  }

  async function spin(event: FormEvent) {
    event.preventDefault();
    setError('');
    setResult(null);
    setSpinning(true);
    const startedAt = Date.now();

    try {
      emitBalanceDelta(-totalStake, 'roulette-bet');
      const out = await apiPost<RouletteResponse>('/roulette/solo/spin', { bets: bets.map(buildBetFromDraft) });
      const targetWheel = -resultAngle(out.result.number);
      const spinDelay = Math.max(90 - (Date.now() - startedAt), 0);
      window.setTimeout(() => {
        setWheelAngle((angle) => nextClockwiseAngle(angle, targetWheel, 7));
        setBallAngle((angle) => nextCounterClockwiseAngle(angle, 0, 11));
      }, spinDelay);

      const remainingSpinMs = Math.max(3900 - (Date.now() - startedAt), 1200);
      window.setTimeout(async () => {
        setResult(out);
        setSpinning(false);
        if (out.settlement.totalReturn > 0) {
          emitBalanceDelta(out.settlement.totalReturn, 'roulette-payout');
        }
        await refreshUser();
        await loadStats();
      }, remainingSpinMs);
    } catch (err) {
      emitBalanceDelta(totalStake, 'roulette-refund');
      setSpinning(false);
      setError(err instanceof Error ? err.message : 'Spin impossible');
    }
  }

  return (
    <section className="roulette-page">
      <div className="roulette-hero">
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Table roulette</span>
          <h1>Fais tourner la roue.</h1>
          <p>Choisis une mise, lance la bille et attends que le numero tombe pour voir le resultat.</p>
        </div>
        <div className="roulette-balance-card">
          <span>Credits</span>
          <strong>{user?.credits ?? 0}</strong>
        </div>
      </div>

      {error ? <StatusMessage type="error">{error}</StatusMessage> : null}

      <div className="roulette-layout">
        <section className="roulette-stage-card">
          <div
            className={`roulette-live-wheel ${spinning ? 'spinning' : 'settled'}`}
            style={{ '--wheel-angle': `${wheelAngle}deg`, '--ball-angle': `${ballAngle}deg` } as CSSProperties}
          >
              <div className="roulette-wheel-face">
              {wheelOrder.map((number, index) => (
                <span
                  className={`roulette-pocket-label ${colorOf(number).toLowerCase()}`}
                  key={number}
                  style={{ '--pocket-angle': `${(index + 0.5) * (360 / wheelOrder.length)}deg` } as CSSProperties}
                >
                  {number}
                </span>
              ))}
              <div className="roulette-wheel-ring" />
              <div className="roulette-wheel-hub" />
            </div>
            <div className="roulette-ball-orbit">
              <span className="roulette-ball" />
            </div>
            {result ? (
              <div className={`roulette-wheel-result ${result.result.color.toLowerCase()}`}>
                {result.result.number}
              </div>
            ) : null}
          </div>

          <div className="roulette-result-strip">
            {result ? (
              <>
                <div className={`roulette-result-number ${result.result.color.toLowerCase()}`}>{result.result.number}</div>
                <div>
                  <span>Resultat</span>
                  <strong>{result.result.color === 'GREEN' ? 'Vert' : result.result.color === 'RED' ? 'Rouge' : 'Noir'}</strong>
                </div>
                <div>
                  <span>Gain total</span>
                  <strong>{result.settlement.totalReturn} credits</strong>
                </div>
                <div>
                  <span>Net</span>
                  <strong className={net >= 0 ? 'positive' : 'negative'}>{net >= 0 ? '+' : ''}{net} credits</strong>
                </div>
                <div className="roulette-payout-lines">
                  {result.settlement.winningBets.length > 0 ? (
                    result.settlement.winningBets.map((line, index) => (
                      <span key={`${line.profit}-${index}`}>
                        <em>{describeBet(line.bet)}</em>
                        <strong>+{line.profit} credits</strong>
                      </span>
                    ))
                  ) : (
                    <span>
                      <em>Aucune mise gagnante</em>
                      <strong>0 credit</strong>
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p>{spinning ? 'La bille cherche sa case...' : 'Le prochain numero attend ton spin.'}</p>
            )}
          </div>
        </section>

        <aside className="roulette-bet-card">
          <div className="roulette-panel-head">
            <div>
              <span>Pari</span>
              <h2>{activeConfig.label}</h2>
            </div>
            <div className="roulette-header-actions">
              <button className="icon-button" onClick={addBet} type="button" aria-label="Ajouter une mise">
                <Plus size={18} />
              </button>
              <button className="icon-button" onClick={() => setRulesOpen(true)} type="button" aria-label="Ouvrir les regles">
                <BookOpen size={18} />
              </button>
            </div>
          </div>

          <form className="roulette-form" onSubmit={spin}>
            <div className="roulette-ticket-list">
              {bets.map((bet, index) => {
                const config = getBetConfig(bet.type);
                const draftNumbers = getDraftCoveredNumbers(bet);

                return (
                  <article className={bet.id === activeBet.id ? 'active' : ''} key={bet.id}>
                    <button onClick={() => setActiveBetId(bet.id)} type="button">
                      <span>Mise {index + 1}</span>
                      <strong>{config.label}</strong>
                      <em>{bet.amount} credits{draftNumbers.length ? ` - ${draftNumbers.slice(0, 4).join(' / ')}${draftNumbers.length > 4 ? '...' : ''}` : ''}</em>
                    </button>
                    <button
                      aria-label="Supprimer la mise"
                      className="icon-button roulette-remove-bet"
                      disabled={bets.length === 1 || spinning}
                      onClick={() => removeBet(bet.id)}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </article>
                );
              })}
            </div>

            <label className="field">
              <span>Type de mise</span>
              <select value={activeBet.type} onChange={(event) => changeType(event.target.value as BetType)} disabled={spinning}>
                {betConfigs.map((config) => (
                  <option key={config.type} value={config.type}>
                    {config.label} - {config.payout}
                  </option>
                ))}
              </select>
            </label>

            {isNumberBet ? (
              <div className="roulette-number-inputs">
                <span>Numeros</span>
                <div>
                  {Array.from({ length: activeConfig.inputCount ?? 0 }, (_, index) => (
                    <label key={index}>
                      <span>{index + 1}</span>
                      <input
                        disabled={spinning}
                        max={36}
                        min={activeBet.type === 'STRAIGHT' ? 0 : 1}
                        type="number"
                        value={activeBet.manualNumbers[index] ?? ''}
                        onChange={(event) => updateManualNumber(index, Number(event.target.value))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ) : activeConfig.presets && activeConfig.presets.length > 1 ? (
              <label className="field">
                <span>Selection</span>
                <select value={activeBet.selectionKey} onChange={(event) => changeSelectionKey(event.target.value)} disabled={spinning}>
                  {activeConfig.presets.map((preset) => (
                    <option key={preset.key} value={preset.key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="field">
              <span>Montant</span>
              <input
                disabled={spinning}
                min={1}
                step={1}
                type="number"
                value={activeBet.amount}
                onChange={(event) => changeAmount(Number(event.target.value))}
              />
            </label>

            <div className="roulette-bet-preview">
              <span>{activeConfig.description}</span>
              <strong>Paye {activeConfig.payout}</strong>
              <div>
                {coveredNumbers.slice(0, 18).map((number) => (
                  <i className={colorOf(number).toLowerCase()} key={number}>{number}</i>
                ))}
                {coveredNumbers.length > 18 ? <em>+{coveredNumbers.length - 18}</em> : null}
              </div>
            </div>

            <button className="button" disabled={spinning} type="submit">
              <CircleDot size={18} /> {spinning ? 'Rotation...' : `Miser ${totalStake} credits`}
            </button>
            <button className="button secondary" onClick={() => setResult(null)} disabled={spinning || !result} type="button">
              <RotateCcw size={18} /> Nouveau resultat
            </button>
          </form>
        </aside>
      </div>

      <section className="roulette-table-card">
        <div>
          <span className="eyebrow"><Coins size={14} /> Tapis</span>
          <h2>Schema des mises</h2>
        </div>
        <RouletteTableDiagram
          activeBetType={activeBet.type}
          activeNumbers={coveredNumbers}
          activeSelectionKey={activeBet.selectionKey}
          onSelectBet={selectTableBet}
        />
      </section>

      <section className="roulette-stats-card">
        <div className="roulette-stats-head">
          <div>
            <span className="eyebrow"><Sparkles size={14} /> Historique joueur</span>
            <h2>Stats roulette</h2>
            <p>Reinitialise chaque lundi.</p>
          </div>
          <strong>{stats?.totalSpins ?? 0} lances</strong>
        </div>

        {statsError ? <StatusMessage type="error">{statsError}</StatusMessage> : null}

        <div className="roulette-stats-grid">
          <RouletteNumberStats title="Numeros chauds" numbers={stats?.hotNumbers ?? []} />
          <RouletteNumberStats title="Numeros froids" numbers={stats?.coldNumbers ?? []} />
          <div className="roulette-distribution-card">
            {distributionRows.map(([label, value]) => (
              <div key={String(label)}>
                <span>{String(label)}</span>
                <strong>{value?.percentage ?? 0}%</strong>
                <em>{value?.count ?? 0} fois</em>
                <i style={{ width: `${value?.percentage ?? 0}%` }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {rulesOpen ? (
        <>
          <div className="drawer-backdrop poker-rules-backdrop" onClick={() => setRulesOpen(false)} />
          <aside className="roulette-rules-drawer poker-rules-drawer open" aria-label="Regles roulette">
            <div className="roulette-panel-head">
              <div>
                <span>Regles</span>
                <h2>Roulette europeenne</h2>
              </div>
              <button className="icon-button" onClick={() => setRulesOpen(false)} type="button" aria-label="Fermer les regles">
                x
              </button>
            </div>
            <div className="roulette-rules-scroll">
              <div className="rules-list">
                {betConfigs.map((config, index) => (
                  <article className={config.type === activeBet.type ? 'active' : ''} key={config.type}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{config.label} - {config.payout}</strong>
                      <p>{config.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}

function RouletteNumberStats({
  title,
  numbers,
}: {
  title: string;
  numbers: Array<{ number: number; count: number; percentage: number; color: RouletteColor }>;
}) {
  return (
    <div className="roulette-number-stats">
      <h3>{title}</h3>
      <div>
        {numbers.length > 0 ? numbers.map((item) => (
          <article key={item.number}>
            <span className={item.color.toLowerCase()}>{item.number}</span>
            <strong>{item.count} fois</strong>
            <em>{item.percentage}%</em>
          </article>
        )) : (
          <p>Aucun lance pour le moment.</p>
        )}
      </div>
    </div>
  );
}

function RouletteTableDiagram({
  activeBetType,
  activeNumbers,
  activeSelectionKey,
  compact = false,
  onSelectBet,
}: {
  activeBetType?: BetType;
  activeNumbers: number[];
  activeSelectionKey?: string;
  compact?: boolean;
  onSelectBet?: (type: BetType, value?: number | string) => void;
}) {
  const activeSet = new Set(activeNumbers);
  const clickable = Boolean(onSelectBet);

  function buttonClass(base: string, active: boolean) {
    return `${base} ${active ? 'active' : ''}`;
  }

  return (
    <div className={`roulette-table-diagram ${compact ? 'compact' : ''}`}>
      <button
        className={buttonClass('roulette-zero', activeBetType === 'STRAIGHT' && activeSet.has(0))}
        disabled={!clickable}
        onClick={() => onSelectBet?.('STRAIGHT', 0)}
        type="button"
      >
        0
      </button>
      <div className="roulette-number-grid">
        {tableRows.map((row) =>
          row.map((number) => (
            <button
              className={`${colorOf(number).toLowerCase()} ${activeSet.has(number) ? 'active' : ''}`}
              key={number}
              disabled={!clickable}
              onClick={() => onSelectBet?.(activeBetType && numberBetDefaults[activeBetType] ? activeBetType : 'STRAIGHT', number)}
              type="button"
            >
              {number}
            </button>
          )),
        )}
      </div>
      <div className="roulette-column-grid">
        {[3, 2, 1].map((column) => (
          <button
            className={activeBetType === 'COLUMN' && activeSelectionKey === String(column) ? 'active' : ''}
            disabled={!clickable}
            key={column}
            onClick={() => onSelectBet?.('COLUMN', column)}
            type="button"
          >
            2 - 1
          </button>
        ))}
      </div>
      <div className="roulette-dozen-grid">
        {[
          ['1', '1st 12'],
          ['2', '2nd 12'],
          ['3', '3rd 12'],
        ].map(([key, label]) => (
          <button
            className={activeBetType === 'DOZEN' && activeSelectionKey === key ? 'active' : ''}
            disabled={!clickable}
            key={key}
            onClick={() => onSelectBet?.('DOZEN', key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      <div className="roulette-outside-grid">
        <button className={activeBetType === 'LOW' ? 'active' : ''} disabled={!clickable} onClick={() => onSelectBet?.('LOW')} type="button">1 to 18</button>
        <button className={activeBetType === 'EVEN' ? 'active' : ''} disabled={!clickable} onClick={() => onSelectBet?.('EVEN')} type="button">Even</button>
        <button className={`red-diamond ${activeBetType === 'RED' ? 'active' : ''}`} disabled={!clickable} onClick={() => onSelectBet?.('RED')} type="button" aria-label="Rouge" />
        <button className={`black-diamond ${activeBetType === 'BLACK' ? 'active' : ''}`} disabled={!clickable} onClick={() => onSelectBet?.('BLACK')} type="button" aria-label="Noir" />
        <button className={activeBetType === 'ODD' ? 'active' : ''} disabled={!clickable} onClick={() => onSelectBet?.('ODD')} type="button">Odd</button>
        <button className={activeBetType === 'HIGH' ? 'active' : ''} disabled={!clickable} onClick={() => onSelectBet?.('HIGH')} type="button">19 to 36</button>
      </div>
    </div>
  );
}

export default function RoulettePage() {
  return (
    <RequireAuth>
      <RouletteContent />
    </RequireAuth>
  );
}
