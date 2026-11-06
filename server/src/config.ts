import path from 'node:path';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing environment variable ${name}`);
  return v;
}

export type Config = {
  port: number;
  databaseUrl: string;
  /** Public base URL of this server, e.g. https://api.fainet.org — used for media links. */
  publicUrl: string;
  mediaDir: string;
  /** 'resend' sends real emails; 'memory' keeps them in memory (tests); 'log' prints codes (local dev). */
  emailTransport: 'resend' | 'memory' | 'log';
  resendApiKey: string;
  emailFrom: string;
  /** true when running behind Caddy/nginx so request.ip is the real client IP. */
  trustProxy: boolean;
  production: boolean;
};

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const production = process.env.NODE_ENV === 'production';
  const emailTransport = (process.env.EMAIL_TRANSPORT ?? (process.env.RESEND_API_KEY ? 'resend' : 'log')) as Config['emailTransport'];
  if (production && emailTransport !== 'resend') throw new Error('Production requires RESEND_API_KEY');
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: env('DATABASE_URL', overrides.databaseUrl),
    publicUrl: env('PUBLIC_URL', 'http://localhost:3000').replace(/\/$/, ''),
    mediaDir: path.resolve(process.env.MEDIA_DIR ?? './media'),
    emailTransport,
    resendApiKey: process.env.RESEND_API_KEY ?? '',
    emailFrom: process.env.EMAIL_FROM ?? 'Faisal Show <no-reply@fainet.org>',
    trustProxy: process.env.TRUST_PROXY === 'true',
    production,
    ...overrides,
  };
}
