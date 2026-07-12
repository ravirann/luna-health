'use client';

type Props = { copy: string };

export function RecallCard({ copy }: Props) {
  return (
    <div className="recall-card" aria-live="polite">
      <p className="recall-card__copy">{copy}</p>
    </div>
  );
}
