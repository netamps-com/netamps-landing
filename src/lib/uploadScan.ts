const EICAR =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export type ScanVerdict =
  | { clean: true }
  | { clean: false; signature: string };

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Executable masquerading as a document/data file (offset-0 magics + shebang). */
export function scanExecutableMagic(head: Uint8Array): ScanVerdict {
  const hex = hexOf(head.slice(0, 64));
  if (hex.startsWith('4d5a')) return { clean: false, signature: 'EXECUTABLE_MZ' };
  if (hex.startsWith('7f454c46')) return { clean: false, signature: 'EXECUTABLE_ELF' };
  if (
    hex.startsWith('feedface') || hex.startsWith('cefaedfe') ||
    hex.startsWith('feedfacf') || hex.startsWith('cffaedfe')
  ) {
    return { clean: false, signature: 'EXECUTABLE_MACHO' };
  }
  if (hex.startsWith('2321')) return { clean: false, signature: 'SCRIPT_SHEBANG' };
  return { clean: true };
}

/** EICAR test signature anywhere in the buffer (ASCII-safe scan). */
export function scanEicar(bytes: Uint8Array, windowBytes = 262144): ScanVerdict {
  const view = bytes.slice(0, Math.min(bytes.length, windowBytes));
  let ascii = '';
  for (let i = 0; i < view.length; i++) {
    const c = view[i];
    ascii += c >= 32 && c < 127 ? String.fromCharCode(c) : ' ';
  }
  return ascii.includes(EICAR)
    ? { clean: false, signature: 'EICAR_TEST_FILE' }
    : { clean: true };
}

/** Strict UTF-8 decode; throws on invalid sequences or NUL bytes. */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (text.includes('\u0000')) throw new Error('NUL byte rejected');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
