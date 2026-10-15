import crypto from 'node:crypto';

/** Generate RS256 keypair + AES-256 data key. Prints base64 for .env (run once, store in Secret Manager). */
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const dataKey = crypto.randomBytes(32);

console.log('JWT_PRIVATE_KEY_B64=' + Buffer.from(privateKey).toString('base64'));
console.log('JWT_PUBLIC_KEY_B64=' + Buffer.from(publicKey).toString('base64'));
console.log('DATA_ENCRYPTION_KEY_B64=' + dataKey.toString('base64'));
