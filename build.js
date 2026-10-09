const { execSync } = require('child_process');

try {
  // OpenNext build for Cloudflare Pages
  if (process.env.NEXT_ON_PAGES === '1' || process.env.CLOUDFLARE === '1') {
    console.log('-> Running OpenNext build for Cloudflare Pages');
    execSync('npx @opennextjs/cloudflare build', { stdio: 'inherit' });
  } else if (process.env.FIREBASE === '1') {
    console.log('-> Running Firebase static export build');
    execSync('npx next build', { stdio: 'inherit' });
  } else {
    console.log('-> Running standard Next.js build');
    execSync('npx next build', { stdio: 'inherit' });
  }
} catch (error) {
  process.exit(1);
}