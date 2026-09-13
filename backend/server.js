const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Load .env before any module that reads JWT_SECRET at import time.
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || process.env[m[1]] !== undefined) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env[m[1]] = v;
    }
  }
} catch {
  /* ignore */
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const essRoutes = require('./routes/ess');
const { requireCsrfHeader } = require('./middleware/auth');
const prisma = require('./prisma/client');
const { purgeExpiredSessions } = require('./lib/sessions');

const app = express();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const PORT = Number(process.env.PORT) || 4000;
const isProd = process.env.NODE_ENV === 'production';
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

app.use(helmet({
  contentSecurityPolicy: isProd ? undefined : false,
  crossOriginResourcePolicy: { policy: 'same-site' }
}));
app.use(cors({
  origin: CLIENT_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  req.requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), ts: new Date().toISOString() });
});

app.get('/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch (e) {
    res.status(503).json({ status: 'not_ready', error: 'database unavailable' });
  }
});

app.use('/auth', authRoutes);
app.use('/api', requireCsrfHeader, apiRoutes);
app.use('/api', requireCsrfHeader, essRoutes);

// The production image includes the built SPA. Keep API routes above this
// fallback so unknown API requests never receive index.html.
const publicDir = path.join(__dirname, 'public');
if (isProd && fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method === 'GET' && req.accepts('html')) {
      return res.sendFile(path.join(publicDir, 'index.html'));
    }
    next();
  });
}

app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', requestId: req.requestId });
});

app.use((err, req, res, _next) => {
  console.error(`[${req.requestId || '-'}]`, err.stack || err);
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (5MB max).' });
  }
  res.status(500).json({ error: 'Internal Server Error', requestId: req.requestId });
});

const server = app.listen(PORT, () => {
  console.log(`JJFO HRMS API listening on port ${PORT} (origin ${CLIENT_ORIGIN})`);
  setInterval(() => { purgeExpiredSessions(); }, 60 * 60 * 1000).unref?.();
});

async function shutdown(signal) {
  console.log(`${signal} received; shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref?.();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
