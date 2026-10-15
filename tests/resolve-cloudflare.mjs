/**
 * Node ESM resolves `./intake/auth` as a package specifier and fails, while
 * Cloudflare's bundler (esbuild) resolves it to `auth.js`. Cloudflare Pages
 * Functions are written in that bundler dialect throughout — `returns.js` and
 * friends all use extensionless relative imports — so bare `node` cannot load
 * them unassisted.
 *
 * This hook teaches Node the same rule the bundler applies: a RELATIVE import
 * with no extension is a `.js` file. Absolute and bare specifiers are left
 * alone, so real dependencies and node builtins still resolve normally.
 *
 * Test-only. Nothing in `functions/` imports this.
 */
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AUTH_STUB = pathToFileURL(
  new URL('./stubs/auth.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    // Swap the real session check for a test double. Authentication is not what
    // these tests are about, and a real one needs KV plus a signed cookie.
    if (/(^|\/)intake\/auth(\.js)?$/.test(specifier) || specifier.endsWith('/intake/auth')) {
      return { url: AUTH_STUB, shortCircuit: true };
    }

    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      if (!/\.[cm]?js$|\.json$|\.mjs$/.test(specifier)) {
        const base = new URL(specifier, context.parentURL ?? 'file:///');
        const asJs = new URL(specifier + '.js', context.parentURL ?? 'file:///');
        if (!existsSync(fileURLToPath(base)) && existsSync(fileURLToPath(asJs))) {
          return nextResolve(asJs.href, context);
        }
      }
    }
    return nextResolve(specifier, context);
  }
});