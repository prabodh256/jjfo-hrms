const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const prisma = require('../prisma/client');
const { authenticate, JWT_SECRET, cookieOpts } = require('../middleware/auth');
const {
  createSession,
  revokeSession,
  revokeAllUserSessions,
  DAY_MS
} = require('../lib/sessions');
const { audit } = require('../lib/audit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again after 15 minutes' }
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await prisma.employee.findUnique({ where: { email } });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status === 'inactive') {
      return res.status(403).json({ error: 'This account has been deactivated. Contact HR.' });
    }

    const { jti } = await createSession(user.id, DAY_MS);
    const token = jwt.sign(
      { id: user.id, role: user.role, jti },
      JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.cookie('token', token, cookieOpts(DAY_MS));

    res.json({
      message: 'Logged in',
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        email: user.email,
        avatar: user.avatar
      }
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input format' });
    }
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await revokeSession(decoded.jti);
      } catch {
        /* ignore invalid token on logout */
      }
    }
  } finally {
    res.clearCookie('token', cookieOpts(0));
    res.json({ message: 'Logged out successfully' });
  }
});

// Request a password reset (creates an audit + notify admin — no external email gateway yet).
router.post('/forgot-password', loginLimiter, async (req, res) => {
  try {
    const email = z.string().email().parse(req.body?.email);
    const user = await prisma.employee.findUnique({ where: { email }, select: { id: true, name: true } });
    // Always return the same message to avoid account enumeration.
    if (user) {
      const admins = await prisma.employee.findMany({
        where: { role: 'admin', status: 'active' },
        select: { id: true }
      });
      for (const a of admins) {
        await prisma.notification.create({
          data: {
            userId: a.id,
            title: 'Password reset requested',
            body: `${user.name} (${email}) requested a password reset. Reset from Directory.`,
            kind: 'permission'
          }
        });
      }
      await audit({ id: user.id, name: user.name }, 'password-reset-request', 'employee', user.id, email);
    }
    res.json({
      message: 'If that email is registered, an administrator has been notified to reset the password.'
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.employee.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, role: true, email: true, department: true,
        designation: true, avatar: true, contact: true, age: true, bloodGroup: true,
        doj: true, experience: true, education: true, documents: true,
        preferences: true, permissions: true, onboardingState: true, onboardingNote: true
      }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Exported for password-change routes to kill sessions.
module.exports = router;
module.exports.revokeAllUserSessions = revokeAllUserSessions;
