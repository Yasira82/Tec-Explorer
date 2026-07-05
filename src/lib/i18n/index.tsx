'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { en } from './en';
import { ar } from './ar';

type Locale        = 'en' | 'ar';
type Translations  = typeof en;

interface LocaleContextValue {
  locale:    Locale;
  setLocale: (locale: Locale) => void;
  t:         Translations;
  dir:       'ltr' | 'rtl';
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);
const translations  = { en, ar };

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('tec_locale') as Locale;
      if (saved === 'en' || saved === 'ar') setLocaleState(saved);
    } catch { /* ignore */ }
  }, []);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try { localStorage.setItem('tec_locale', newLocale); } catch { /* ignore */ }
  };

  return (
    <LocaleContext.Provider value={{
      locale,
      setLocale,
      t:   translations[locale],
      dir: locale === 'ar' ? 'rtl' : 'ltr',
    }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useTranslation() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useTranslation must be used within LocaleProvider');
  return context;
}
