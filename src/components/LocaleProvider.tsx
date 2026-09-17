"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/lib/i18n/config";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionary";

interface LocaleContextValue {
  locale: Locale;
  dict: Dictionary;
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

/**
 * Não usa roteamento por URL (sem /en, /pt) — o idioma é só um cookie, e a
 * troca é instantânea via Context, sem precisar de reload de página. O
 * servidor (layout) só usa o cookie para decidir o idioma do 1º render.
 */
export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const dict = getDictionary(locale);

  // Só sincroniza no client depois da troca manual — o título inicial já
  // vem certo do generateMetadata (server), isso é só pra não ficar preso
  // no idioma do 1º load depois que a pessoa troca pelo switch.
  useEffect(() => {
    document.documentElement.lang = locale === "pt" ? "pt-BR" : "en";
    document.title = dict.rootMetadata.title;
  }, [locale, dict]);

  function setLocale(next: Locale) {
    setLocaleState(next);
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    // Componentes client trocam na hora pelo Context; mas dashboard/admin/
    // capture renderizam texto no server (cookie lido em getServerDictionary),
    // então precisam de um refresh pra buscar o RSC de novo com o cookie novo.
    router.refresh();
  }

  return (
    <LocaleContext.Provider value={{ locale, dict, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}
