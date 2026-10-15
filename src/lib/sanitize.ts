/** Scrub credentials/tokens/payment blobs before any log sink (spec §2). */
const SCRUB_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /("?(password|passwd|pwd|secret|client_secret)"?\s*[:=]\s*")[^"]*(")/gi, replacement: '$1[REDACTED]$3' },
  { re: /("?(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|id_token)"?\s*[:=]\s*")[^"]*(")/gi, replacement: '$1[REDACTED]$3' },
  { re: /(Bearer\s+)[A-Za-z0-9\-._~+/=]+/g, replacement: '$1[REDACTED]' },
  { re: /("?(card_number|pan|cvv|cvc|expiry)"?\s*[:=]\s*")[^"]*(")/gi, replacement: '$1[REDACTED]$3' },
  { re: /\b(?:\d[ -]*?){13,19}\b/g, replacement: '[REDACTED_PAN]' },
];

export function scrubForLogs(input: unknown): string {
  let text: string;
  try {
    text = typeof input === 'string' ? input : JSON.stringify(input);
  } catch {
    return '[unserializable]';
  }
  for (const { re, replacement } of SCRUB_PATTERNS) {
    re.lastIndex = 0;
    text = text.replace(re, replacement);
  }
  return text;
}
