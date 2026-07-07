const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const { authenticate, JWT_SECRET } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  // Only throttle FAILED attempts — successful logins shouldn't lock out
  // legitimate users, and this keeps brute-force protection focused.
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
    if (user.status === 'inactive') return res.status(403).json({ error: 'This account has been deactivated. Contact HR.' });

    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.json({ message: 'Logged in', user: { id: user.id, name: user.name, role: user.role, email: user.email } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input format' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Lockdown register route - removed completely to enforce manual HR provisioning via admin panel
// If needed, could be added with authorize(['admin']) middleware

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.employee.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, role: true, email: true, department: true, designation: true, avatar: true, contact: true, age: true, bloodGroup: true, doj: true, experience: true, education: true, documents: true, preferences: true, permissions: true, onboardingState: true, onboardingNote: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
