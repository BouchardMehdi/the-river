const LOCAL_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

export function getSocketCorsOrigins(): string[] | boolean {
  const raw = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!raw || raw.trim() === '') return isProduction ? false : LOCAL_DEV_ORIGINS;
  if (raw.trim() === '*') return !isProduction;

  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
