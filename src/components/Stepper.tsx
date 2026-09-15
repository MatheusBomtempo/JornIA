"use client";

interface Props {
  steps: string[];
  /** Índice (0-based) do passo atual. */
  current: number;
  /** Índice mais alto que já pode ser aberto clicando no chip. */
  reachable?: number;
  onStepClick?: (index: number) => void;
}

/**
 * Indicador visual de progresso em 3 passos — pensado pra mobile primeiro:
 * chips grandes o bastante pro toque, rótulo sempre visível (nunca só o
 * número), e clicáveis quando o passo já pode ser revisitado.
 */
export function Stepper({ steps, current, reachable = current, onStepClick }: Props) {
  return (
    <ol className="flex items-center">
      {steps.map((label, i) => {
        const active = i === current;
        const done = i < current;
        const clickable = !!onStepClick && i <= reachable && !active;
        return (
          <li key={label} className="flex flex-1 items-center last:flex-none">
            <button
              type="button"
              disabled={!clickable}
              onClick={() => clickable && onStepClick!(i)}
              className={`flex min-h-9 items-center gap-1.5 rounded-full px-2 py-1.5 text-xs font-medium transition-colors sm:gap-2 sm:px-3 sm:text-sm ${
                active
                  ? "bg-brand-500/15 text-brand-300"
                  : done
                    ? "text-emerald-400"
                    : "text-faint"
              } ${clickable ? "cursor-pointer hover:bg-elevated" : "cursor-default"}`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  active ? "bg-brand-500 text-white" : done ? "bg-emerald-500/20" : "bg-line"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              <span className="whitespace-nowrap">{label}</span>
            </button>
            {i < steps.length - 1 && (
              <span className="mx-1 h-px min-w-3 flex-1 bg-line sm:mx-2" />
            )}
          </li>
        );
      })}
    </ol>
  );
}
