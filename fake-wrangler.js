#!/usr/bin/env node
const { spawnSync } = require('child_process');
const args = process.argv.slice(2);

if (args[0] === 'deploy' && args.length === 1) {
  console.log('================================================================');
  console.log('🤖 HIJACKING INCORRECT "wrangler deploy" COMMAND');
  console.log('-> Redirecting to "wrangler pages deploy .vercel/output/static"');
  console.log('================================================================');
  
  const result = spawnSync('node', ['./node_modules/wrangler/bin/wrangler.js', 'pages', 'deploy', '.vercel/output/static'], { 
    stdio: 'inherit' 
  });
  process.exit(result.status || 0);
} else {
  const result = spawnSync('node', ['./node_modules/wrangler/bin/wrangler.js', ...args], { 
    stdio: 'inherit' 
  });
  process.exit(result.status || 0);
}
