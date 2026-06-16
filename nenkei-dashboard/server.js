const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cookieSession = require('cookie-session');
const passport = require('passport');

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
  res.redirect('/dashboard/overview');
});

const reportPages = {
  overview: {
    pageTitle: 'Overview',
    scriptPath: '/reports/overview.js',
    section: 'overview',
    showYearTabs: true,
    introTitle: 'Performance Overview',
    introText: 'A quick snapshot of retail, purchase, and margin behavior for the selected year.',
  },
  volumes: {
    pageTitle: 'Volumes',
    scriptPath: '/reports/volumes.js',
    section: 'volumes',
    showYearTabs: true,
    introTitle: 'Volume Story',
    introText: 'Track model momentum, monthly throughput, and fuel mix distribution.',
  },
  margins: {
    pageTitle: 'Margins / Unit',
    scriptPath: '/reports/margins.js',
    section: 'margins',
    showYearTabs: true,
    introTitle: 'Margin Deep Dive',
    introText: 'Compare profitability by model and location to identify margin leaders and drag points.',
  },
  finance: {
    pageTitle: 'Finance & Insurance',
    scriptPath: '/reports/finance.js',
    section: 'finance',
    showYearTabs: true,
    introTitle: 'Finance Coverage',
    introText: 'See how financing channels, COD split, and insurance providers contribute to conversion.',
  },
  'sales-team': {
    pageTitle: 'Sales Team',
    scriptPath: '/reports/sales-team.js',
    section: 'salesteam',
    showYearTabs: true,
    introTitle: 'Sales Team Leaderboard',
    introText: 'Rank SM, TL, and SO performance by unit throughput and average net margin.',
  },
  yoy: {
    pageTitle: 'Year-over-Year',
    scriptPath: '/reports/yoy.js',
    section: 'yoy',
    showYearTabs: false,
    introTitle: 'Year-over-Year Comparison',
    introText: 'Compare volume and margin outcomes side by side between 2025 and 2026.',
  },
};

Object.entries(reportPages).forEach(([slug, page]) => {
  app.get(`/dashboard/${slug}`, requireAuth, (req, res) => {
    res.render('report', page);
  });
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
