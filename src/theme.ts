import { reloadAppAsync } from 'expo';
import { File, Paths } from 'expo-file-system';

/**
 * Themes. The chosen theme is read from a small file *synchronously* when the app starts,
 * before any screen builds its styles, so every StyleSheet gets the right colors.
 * Changing the theme saves the file and reloads the app (about one second).
 */
export type ThemeName = 'classic' | 'pink' | 'dark' | 'night';

type Palette = {
  primary: string;
  primaryDark: string;
  accent: string;
  bg: string;
  card: string;
  text: string;
  muted: string;
  border: string;
  error: string;
  errorBg: string;
  success: string;
  successBg: string;
  /** light tint of primary (secondary buttons, selected chips) */
  soft: string;
  /** grey surface (other person's chat bubble, round header buttons) */
  surface: string;
  /** text field background */
  input: string;
  /** gradient used by the logo / hero areas */
  gradient: [string, string, string];
  dark: boolean;
};

export const THEMES: Record<ThemeName, Palette> = {
  classic: {
    primary: '#1877F2', primaryDark: '#0f5fc7', accent: '#00C6FF',
    bg: '#F0F2F5', card: '#FFFFFF', text: '#1c1e21', muted: '#65676B', border: '#DADDE1',
    error: '#E41E3F', errorBg: '#FDECEE', success: '#31A24C', successBg: '#E6F4EA',
    soft: '#E7F0FD', surface: '#EEF1F5', input: '#FAFBFC',
    gradient: ['#00C6FF', '#1877F2', '#5B3CFF'], dark: false,
  },
  pink: {
    primary: '#E0218A', primaryDark: '#B5136C', accent: '#D63AF9',
    bg: '#FFF4F9', card: '#FFFFFF', text: '#2A1020', muted: '#8A6577', border: '#F3D4E4',
    error: '#E41E3F', errorBg: '#FDECEE', success: '#2EA36A', successBg: '#E3F6EC',
    soft: '#FDE3F1', surface: '#F8E9F1', input: '#FFF9FC',
    gradient: ['#FF4FA3', '#D63AF9', '#5B3CFF'], dark: false,
  },
  dark: {
    primary: '#2D88FF', primaryDark: '#1877F2', accent: '#00C6FF',
    bg: '#18191A', card: '#242526', text: '#E4E6EB', muted: '#B0B3B8', border: '#3E4042',
    error: '#FF4D67', errorBg: '#3A1E24', success: '#45BD62', successBg: '#1E3324',
    soft: '#263951', surface: '#3A3B3C', input: '#3A3B3C',
    gradient: ['#00C6FF', '#2D88FF', '#5B3CFF'], dark: true,
  },
  night: {
    primary: '#FF4FA3', primaryDark: '#E0218A', accent: '#D63AF9',
    bg: '#120A16', card: '#1E1424', text: '#F5E9F2', muted: '#B79DB0', border: '#3A2A40',
    error: '#FF4D67', errorBg: '#3A1E24', success: '#45BD62', successBg: '#1E3324',
    soft: '#3A1D33', surface: '#2E2234', input: '#2A1F30',
    gradient: ['#FF4FA3', '#D63AF9', '#5B3CFF'], dark: true,
  },
};

const NAMES = Object.keys(THEMES) as ThemeName[];

function themeFile(): File | null {
  try {
    return new File(Paths.document, 'fshow-theme.txt');
  } catch {
    return null;
  }
}

function readSaved(): ThemeName {
  try {
    const f: any = themeFile();
    if (f && f.exists) {
      const v = String(f.textSync()).trim() as ThemeName;
      if (NAMES.includes(v)) return v;
    }
  } catch {
    // first start or file API not available → default theme
  }
  return 'classic';
}

export const themeName: ThemeName = readSaved();
export const colors: Palette = { ...THEMES[themeName] };
export const radius = { sm: 8, md: 12, lg: 20, full: 999 };

/** Saves the theme and reloads the app so every screen uses it. */
export async function setTheme(name: ThemeName): Promise<void> {
  const f: any = themeFile();
  if (!f) throw new Error('no-file');
  if (!f.exists) f.create();
  f.write(name);
  await reloadAppAsync('theme');
}
