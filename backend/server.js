require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const { requireCsrfHeader } = require('./middleware/auth');

const app = express();

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: CLIENT_ORIGIN, // Vite dev origin
  credentials: true
}));
app.use(express.json({ limit: '100kb' })); // cap body size to blunt payload abuse
app.use(cookieParser());

// Coarse global rate limit (per-route login limiter lives in routes/auth.js).
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
}));

// Routes
app.use('/auth', authRoutes);
// CSRF: every mutating /api request must carry the X-Requested-With header.
app.use('/api', requireCsrfHeader, apiRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running securely on port ${PORT}`);
});
