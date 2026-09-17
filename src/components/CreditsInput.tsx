"use client";

import { CREDIT_TYPES, type Credit, type CreditTypeId } from "@/lib/domain";
import { useLocale } from "./LocaleProvider";

interface Props {
  credits: Credit[];
  onChange: (credits: Credit[]) => void;
}

const EMPTY = "";

/**
 * Créditos/marcações do post. Começa com um único seletor "nenhum";
 * o campo do @ só aparece depois que um tipo é escolhido. Preenchido um,
 * surge o "+" para adicionar outro. Tudo opcional.
 */
export function CreditsInput({ credits, onChange }: Props) {
  const { dict } = useLocale();
  // Linha em edição: sempre existe uma "vazia" no fim para começar a primeira.
  const rows: (Credit | null)[] = [...credits, null];

  function setType(index: number, type: string) {
    if (!type) {
      // voltou para "nenhum" -> remove a linha
      onChange(credits.filter((_, i) => i !== index));
      return;
    }
    const next = [...credits];
    if (index >= credits.length) {
      next.push({ type: type as CreditTypeId, handle: "" });
    } else {
      next[index] = { ...next[index], type: type as CreditTypeId };
    }
    onChange(next);
  }

  function setHandle(index: number, handle: string) {
    const next = [...credits];
    if (next[index]) {
      next[index] = { ...next[index], handle };
      onChange(next);
    }
  }

  function remove(index: number) {
    onChange(credits.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {rows.map((credit, i) => {
        const isNew = credit === null;
        // A linha "nova" só aparece se a anterior já tiver um @ preenchido
        if (isNew && credits.length > 0 && !credits[credits.length - 1].handle.trim()) {
          return null;
        }

        return (
          <div key={i} className="space-y-2">
            {isNew && credits.length > 0 ? (
              // Botão "+" para adicionar outro crédito
              <details className="group">
                <summary className="btn-ghost w-full cursor-pointer list-none">
                  {dict.creditsInput.addAnother}
                </summary>
                <div className="mt-2">
                  <TypeSelect value={EMPTY} onChange={(v) => setType(i, v)} />
                </div>
              </details>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <TypeSelect
                  value={credit?.type ?? EMPTY}
                  onChange={(v) => setType(i, v)}
                  className="sm:w-56"
                />

                {/* O @ só abre depois de escolher o tipo */}
                {credit && (
                  <div className="flex flex-1 gap-2">
                    <input
                      className="input flex-1"
                      value={credit.handle}
                      onChange={(e) => setHandle(i, e.target.value)}
                      placeholder={dict.creditsInput.handlePlaceholder}
                      aria-label={dict.creditsInput.handleAriaLabel}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="btn-danger btn-sm shrink-0"
                      aria-label={dict.creditsInput.removeAriaLabel}
                    >
                      {dict.creditsInput.remove}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TypeSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { dict } = useLocale();
  return (
    <select
      className={`input ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={dict.creditsInput.typeAriaLabel}
    >
      <option value="">{dict.creditsInput.noneOption}</option>
      {CREDIT_TYPES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.emoji} {dict.common.credit[t.id]}
        </option>
      ))}
    </select>
  );
}
