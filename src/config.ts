function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const config = {
  env: optional('NODE_ENV', 'development'),
  port: parseInt(optional('PORT', '8080'), 10),
  trustProxy: optional('TRUST_PROXY', '0') === '1',
  corsOrigins: optional('CORS_ORIGINS', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  databaseUrl: optional('DATABASE_URL', ''),
  jwtPrivateKeyB64: optional('JWT_PRIVATE_KEY_B64', ''),
  jwtPublicKeyB64: optional('JWT_PUBLIC_KEY_B64', ''),
  jwtAccessTtlSec: parseInt(optional('JWT_ACCESS_TTL_SEC', '900'), 10),
  dataEncryptionKeyB64: optional('DATA_ENCRYPTION_KEY_B64', ''),
  resendApiKey: optional('RESEND_API_KEY', ''),
  mailFromName: optional('MAIL_FROM_NAME', 'Netamps Portal'),
  mailFromEmail: optional('MAIL_FROM_EMAIL', 'no-reply@netamps.in'),
  redisUrl: optional('REDIS_URL', ''),
  tlsKeyB64: optional('TLS_KEY_PEM_B64', ''),
  tlsCertB64: optional('TLS_CERT_PEM_B64', ''),
  enforceTls13Direct: optional('ENFORCE_TLS13_DIRECT', '1') === '1',
};

export function requireConfig(): void {
  for (const k of ['DATABASE_URL', 'JWT_PRIVATE_KEY_B64', 'JWT_PUBLIC_KEY_B64', 'DATA_ENCRYPTION_KEY_B64'] as const) {
    required(k);
  }
}
