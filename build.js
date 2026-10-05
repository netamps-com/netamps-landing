const { execSync } = require('child_process');

try {
  // When next-on-pages internally calls `vercel build`, the Vercel CLI sets VERCEL="1"
  if (process.env.VERCEL === '1' || process.env.NEXT_ON_PAGES === '1') {
    console.log('-> Running internal Next.js build (vercel build detected)');
    execSync('npx next build', { stdio: 'inherit' });
  } else if (process.env.FIREBASE === '1') {
    console.log('-> Running Firebase static export build');
    execSync('npx next build', { stdio: 'inherit' });
  } else {
    console.log('-> Running Cloudflare next-on-pages compiler');
    // Set an extra env var just in case VERCEL is not set
    execSync('npx @cloudflare/next-on-pages', {
      stdio: 'inherit',
      env: { ...process.env, NEXT_ON_PAGES: '1' }
    });
  }
} catch (error) {
  process.exit(1);
}
