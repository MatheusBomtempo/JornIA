"use client";

import { useLocale } from "./LocaleProvider";
import type { Locale } from "@/lib/i18n/config";

const OPTIONS: Locale[] = ["pt", "en"];

/** Troca de idioma da interface — só afeta os textos do produto, nunca o post gerado pela IA. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, dict, setLocale } = useLocale();

  return (
    <div
      role="group"
      aria-label={dict.common.language.label}
      className={`inline-flex rounded-full border border-line bg-elevated p-0.5 text-xs font-medium ${className}`}
    >
      {OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setLocale(option)}
          aria-pressed={locale === option}
          className={`rounded-full px-3 py-1.5 transition-colors ${
            locale === option ? "bg-brand-500 text-white" : "text-muted hover:text-ink"
          }`}
        >
          {dict.common.language[option]}
        </button>
      ))}
    </div>
  );
}
