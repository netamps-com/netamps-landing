const fs = require('fs');
const path = require('path');

const binPath = path.join(__dirname, 'node_modules', '.bin', 'wrangler');
const fakeWrangler = path.join(__dirname, 'fake-wrangler.js');

try {
  // If it's a symlink, unlink it first
  if (fs.existsSync(binPath)) {
    fs.unlinkSync(binPath);
  }
  
  // Copy the fake wrangler to .bin
  fs.copyFileSync(fakeWrangler, binPath);
  
  // Make it executable on Linux/Mac
  fs.chmodSync(binPath, 0o755);
  console.log('✅ Successfully hijacked wrangler binary');
} catch (error) {
  console.error('Failed to hijack wrangler:', error.message);
}
