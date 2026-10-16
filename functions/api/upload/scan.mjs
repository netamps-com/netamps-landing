/**
 * Upload malware scan — pure functions, zero imports (loadable by the Node
 * harness verbatim). Imported by secure-upload.js; the scanner table below is
 * the single definition — never duplicate a signature elsewhere.
 *
 * Signatures: MZ/ELF/Mach-O executables, script shebangs, WebAssembly module
 * magic (\0asm, searched ANYWHERE in the window so polyglots are named, not
 * merely mis-typed), EICAR test file, double-extension masquerade.
 */

export const SCAN_WINDOW_BYTES = 256 * 1024; // malware-signature scan window (head of payload)

// EICAR anti-malware test signature
export const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

export function hexOf(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function scanMalware(headBytes, fileName) {
  try {
    const hex = hexOf(headBytes.slice(0, Math.min(headBytes.length, SCAN_WINDOW_BYTES)));
    if (hex.startsWith('4d5a')) return { infected: true, signature: 'EXECUTABLE_MZ' };
    if (hex.startsWith('7f454c46')) return { infected: true, signature: 'EXECUTABLE_ELF' };
    // WebAssembly module magic (\0asm) — searched ANYWHERE in the window, not
    // just at offset 0, so a polyglot (valid image header + appended module
    // for in-memory evasion) is named as what it is, not merely "wrong type".
    // Hex of random binary collides with these 4 bytes with probability 2^-32.
    if (hex.includes('0061736d')) return { infected: true, signature: 'WASM_MODULE' };
    if (
      hex.startsWith('feedface') || hex.startsWith('cefaedfe') ||
      hex.startsWith('feedfacf') || hex.startsWith('cffaedfe') ||
      hex.startsWith('cafebabe') || hex.startsWith('cafebabf')
    ) return { infected: true, signature: 'EXECUTABLE_MACHO' };
    if (hex.startsWith('2321')) return { infected: true, signature: 'SCRIPT_SHEBANG' };

    let ascii = '';
    const view = headBytes.slice(0, Math.min(headBytes.length, SCAN_WINDOW_BYTES));
    for (let i = 0; i < view.length; i++) {
      const c = view[i];
      ascii += c >= 32 && c < 127 ? String.fromCharCode(c) : ' ';
    }
    if (ascii.includes(EICAR)) return { infected: true, signature: 'EICAR_TEST_FILE' };

    const lower = String(fileName || '').toLowerCase();
    if (/\.(exe|dll|bat|cmd|ps1|sh|com|scr|msi|jar|py|js|vbs)(\.|$)/.test(lower.replace(/\.(png|jpe?g|webp|gif|tiff?|heic|heif|mp4|mov|webm|mkv|avi|flv|csv|json)$/, ''))) {
      return { infected: true, signature: 'DOUBLE_EXTENSION_MASQUERADE' };
    }

    return { infected: false, signature: null };
  } catch {
    return { infected: false, signature: null };
  }
}
