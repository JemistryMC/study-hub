// Exo Academic Platform — Phase 4.1 Local Development & Static Asset Server
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function startServer() {
  try {
    const express = require('express');
    const app = express();

    app.use(express.static(ROOT_DIR, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      }
    }));

    app.use((req, res) => {
      if (req.method === 'GET' && req.accepts('html')) {
        res.sendFile(path.join(ROOT_DIR, 'index.html'));
      } else {
        res.status(404).end('Not Found');
      }
    });

    const server = app.listen(PORT, HOST, () => {
      console.log(`Exo server listening on http://${HOST}:${PORT}`);
    });
    server.on('error', (err) => {
      console.error('Exo server error:', err && err.message ? err.message : err);
    });
  } catch {
    // Fallback to built-in http server if express is not yet installed
    const server = http.createServer((req, res) => {
      let pathname = '/index.html';
      try {
        const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        pathname = decodeURIComponent(reqUrl.pathname);
        if (pathname === '/') pathname = '/index.html';
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(ROOT_DIR, safePath);

      if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const streamFile = (targetPath, headers) => {
        const stream = fs.createReadStream(targetPath);
        stream.on('error', () => {
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          }
          res.end('Internal Server Error');
        });
        res.writeHead(200, headers);
        stream.pipe(res);
      };

      fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          const headers = { 'Content-Type': contentType };
          if (filePath.endsWith('sw.js')) {
            headers['Cache-Control'] = 'no-cache';
          }
          streamFile(filePath, headers);
        } else if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
          streamFile(path.join(ROOT_DIR, 'index.html'), { 'Content-Type': 'text/html; charset=utf-8' });
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        }
      });
    });

    server.on('error', (err) => {
      console.error('Exo static server error:', err && err.message ? err.message : err);
    });

    server.listen(PORT, HOST, () => {
      console.log(`Exo static server listening on http://${HOST}:${PORT}`);
    });
  }
}

startServer();
