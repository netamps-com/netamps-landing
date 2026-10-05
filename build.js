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
    console.log('-> Running standard Next.js build with static export');
    // Use standard Next.js build which works reliably on all platforms
    execSync('npx next build', { stdio: 'inherit' });
  }
} catch (error) {
  process.exit(1);
}
