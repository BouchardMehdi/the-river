import Image from 'next/image';

type CurrencyAmountProps = {
  className?: string;
  prefix?: string;
  suffix?: string;
  value?: number | null;
};

export function formatCreditValue(value?: number | null) {
  return Number(value ?? 0).toLocaleString('fr-FR');
}

export function CurrencyAmount({ className = '', prefix, suffix, value }: CurrencyAmountProps) {
  const classes = className ? `currency-amount ${className}` : 'currency-amount';

  return (
    <span className={classes}>
      {prefix ? <span className="currency-prefix">{prefix}</span> : null}
      <Image src="/assets/jetons/jeton_credits.png" alt="" width={28} height={28} />
      <span>{formatCreditValue(value)}</span>
      {suffix ? <span className="currency-suffix">{suffix}</span> : null}
    </span>
  );
}
