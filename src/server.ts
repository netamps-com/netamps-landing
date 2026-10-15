import http from 'node:http';
import https from 'node:https';
import { createApp } from './app';
import { config, requireConfig } from './config';

requireConfig();
const app = createApp();

function listen(): void {
  if (config.tlsKeyB64 && config.tlsCertB64) {
    const server = https.createServer(
      {
        key: Buffer.from(config.tlsKeyB64, 'base64'),
        cert: Buffer.from(config.tlsCertB64, 'base64'),
        minVersion: 'TLSv1.3', // direct exposure terminates at TLS 1.3+
      },
      app
    );
    server.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`[crm] https listening on :${config.port} (TLS 1.3+)`);
    });
    return;
  }
  const server = http.createServer(app);
  server.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[crm] http listening on :${config.port} (TLS expected at LB)`);
  });
}

listen();
