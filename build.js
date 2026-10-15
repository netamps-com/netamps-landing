const { execSync } = require('child_process');

/**
 * One build. It produces the static export in `out/`, which is the only
 * artifact this project deploys — see wrangler.toml `pages_build_output_dir`
 * and .github/workflows/cloudflare-pages.yml.
 *
 * The OpenNext branch that used to live here (`NEXT_ON_PAGES=1` / `CLOUDFLARE=1`
 * -> `.open-next/`) was removed on 2026-10-14 and could never work: this is a
 * static export (`output: 'export'` in next.config.mjs) with no
 * open-next.config.ts, so that build aborted on every run and failed CI red.
 * It is deliberately NOT reinstated — see the note in .github/workflows/deploy.yml.
 *
 * `FIREBASE=1` is still honoured (firebase-hosting-merge.yml and
 * firebase-hosting-pull-request.yml set it) and logs its intent. Both branches
 * run the same command, so setting it changes the log line, not the output.
 *
 * Setting NEXT_ON_PAGES/CLOUDFLARE now falls through to the static export
 * rather than producing an artifact nothing deploys.
 */

try {
  if (process.env.FIREBASE === '1') {
    console.log('-> Running static export build (Firebase hosting)');
  } else {
    console.log('-> Running static export build');
  }
  execSync('npx next build', { stdio: 'inherit' });
} catch (error) {
  process.exit(1);
}