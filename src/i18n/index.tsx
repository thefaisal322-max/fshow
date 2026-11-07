import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { en, fa, ps, StringKey } from './strings';

export type Lang = 'ps' | 'fa' | 'en';
export type { StringKey };

export const LANGUAGES: { code: Lang; name: string; native: string; rtl: boolean }[] = [
  { code: 'ps', name: 'Pashto', native: 'پښتو', rtl: true },
  { code: 'fa', name: 'Dari', native: 'دری', rtl: true },
  { code: 'en', name: 'English', native: 'English', rtl: false },
];

const DICTS = { ps, fa, en } as const;
const KEY = 'fshow.lang';

// Module-level copy so non-React code (error messages, time ago) can translate too.
let current: Lang = 'ps';

export function tr(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = DICTS[current][key] ?? ps[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Layout helpers that flip between right-to-left (Pashto, Dari) and left-to-right (English). */
export type Dir = {
  rtl: boolean;
  /** flexDirection for a row that starts at the reading side */
  row: 'row' | 'row-reverse';
  /** flexDirection for a row that starts at the opposite side */
  rowOpp: 'row' | 'row-reverse';
  /** textAlign for the reading side */
  align: 'left' | 'right';
  /** alignItems for the reading side */
  items: 'flex-start' | 'flex-end';
  writing: 'ltr' | 'rtl';
};

function makeDir(lang: Lang): Dir {
  const rtl = lang !== 'en';
  return {
    rtl,
    row: rtl ? 'row-reverse' : 'row',
    rowOpp: rtl ? 'row' : 'row-reverse',
    align: rtl ? 'right' : 'left',
    items: rtl ? 'flex-end' : 'flex-start',
    writing: rtl ? 'rtl' : 'ltr',
  };
}

export function dir(): Dir {
  return makeDir(current);
}

type I18n = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: typeof tr;
  d: Dir;
  ready: boolean;
};

const Ctx = createContext<I18n>({ lang: 'ps', setLang: () => {}, t: tr, d: makeDir('ps'), ready: false });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('ps');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'ps' || v === 'fa' || v === 'en') {
          current = v;
          setLangState(v);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((l: Lang) => {
    current = l;
    setLangState(l);
    AsyncStorage.setItem(KEY, l).catch(() => {});
  }, []);

  // `t` changes identity with the language so screens re-render with the new text.
  const value = useMemo<I18n>(() => ({ lang, setLang, t: (k, v) => tr(k, v), d: makeDir(lang), ready }), [lang, setLang, ready]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
