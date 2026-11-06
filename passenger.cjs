// Optional Passenger startup file. Use next start on other Node.js managers.
// Keep the full Next build and dependencies; do not combine with standalone.
/* eslint-disable @typescript-eslint/no-require-imports -- Passenger startup is CommonJS. */
process.env.NODE_ENV = 'production';
const { createServer } = require('node:http');
const next = require('next');

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch(() => {
      console.error('Next request failed; inspect restricted application logs.');
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  server.on('error', () => {
    console.error('Production HTTP server failed to listen.');
    process.exit(1);
  });
  // Passenger intercepts the first listen call and owns the socket/port.
  // Its upstream request limits must still be checked with the provider.
  server.listen(port);
}).catch(() => {
  console.error('Next production preparation failed; check build and configuration.');
  process.exit(1);
});
