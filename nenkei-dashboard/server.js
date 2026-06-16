require('dotenv').config();
const express = require('express');
const cookieSession = require('cookie-session');
const passport = require('passport');
const path = require('path');

require('./routes/auth'); // sets up passport strategy

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const isProduction = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1); // required behind Vercel's proxy

// cookie-session stores the entire session in a signed cookie — no server-side
// storage needed, so it works across Vercel's stateless serverless instances.
app.use(cookieSession({
  name: 'nenkei_session',
  keys: [process.env.SESSION_SECRET || 'nenkei_secret_2025'],
  maxAge: 24 * 60 * 60 * 1000,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  httpOnly: true,
}));

// Passport compatibility shim — cookie-session doesn't have regenerate/save
app.use((req, res, next) => {
  if (req.session && !req.session.regenerate) {
    req.session.regenerate = (cb) => cb();
  }
  if (req.session && !req.session.save) {
    req.session.save = (cb) => cb();
  }
  next();
});

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/login', (req, res) => {
  if (req.isAuthenticated()) return res.redirect('/dashboard');
  res.render('login');
});

app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ displayName: req.user.displayName, email: req.user.email });
});

// Local dev server (not used on Vercel)
if (process.env.NODE_ENV !== 'production' || process.env.LOCAL_DEV) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Nenkei Toyota Reports running at http://localhost:${PORT}`));
}

module.exports = app;
