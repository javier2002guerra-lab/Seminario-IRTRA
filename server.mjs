import https from 'node:https';
import fs from 'node:fs';
import next from 'next';
import { validateProductionSecurity } from './lib/security.js';
import { startScannerWatcher } from './lib/scanner-watch.js';
validateProductionSecurity();

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();
await app.prepare();
startScannerWatcher();
const key = fs.readFileSync(process.env.HTTPS_KEY_PATH || 'certs/localhost-key.pem');
const cert = fs.readFileSync(process.env.HTTPS_CERT_PATH || 'certs/localhost.pem');
const host = process.env.BIND_HOST || '127.0.0.1';
https.createServer({ key, cert, minVersion: 'TLSv1.2' }, (req, res) => handle(req, res)).listen(Number(process.env.PORT || 3443), host, () => {
  console.log(`IRTRA Calidad IA disponible en https://${host}:${process.env.PORT || 3443}`);
});
