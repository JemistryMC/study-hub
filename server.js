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

    app.listen(PORT, HOST, () => {
      console.log(`Exo server listening on http://${HOST}:${PORT}`);
    });
  } catch {
    // Fallback to built-in http server if express is not yet installed
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      let pathname = decodeURIComponent(reqUrl.pathname);
      if (pathname === '/') pathname = '/index.html';

      const safePath = path.normalize(pathname).replace(/^(\.\.[/\\])+/, '');
      const filePath = path.join(ROOT_DIR, safePath);

      if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (err, stats) => {
        if (!err && stats.isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const contentType = MIME_TYPES[ext] || 'application/octet-stream';
          const headers = { 'Content-Type': contentType };
          if (filePath.endsWith('sw.js')) {
            headers['Cache-Control'] = 'no-cache';
          }
          res.writeHead(200, headers);
          fs.createReadStream(filePath).pipe(res);
        } else if (req.method === 'GET' && (req.headers.accept || '').includes('text/html')) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(path.join(ROOT_DIR, 'index.html')).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Not Found');
        }
      });
    });

    server.listen(PORT, HOST, () => {
      console.log(`Exo static server listening on http://${HOST}:${PORT}`);
    });
  }
}

startServer();
