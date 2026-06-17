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
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Avoid favicon 404s by redirecting legacy .ico requests to our SVG asset.
app.get('/favicon.ico', (req, res) => {
  res.redirect(302, '/favicon.svg');
});

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

app.use((req, res, next) => {
  res.locals.userDisplayName = req.user?.displayName || '';
  next();
});

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
    scriptPath: '/public/reports/overview.js',
    section: 'overview',
    showYearTabs: true,
    introTitle: 'Performance Overview',
    introText: 'A quick snapshot of retail, purchase, and margin behavior for the selected year.',
  },
  volumes: {
    pageTitle: 'Volumes',
    scriptPath: '/public/reports/volumes.js',
    section: 'volumes',
    showYearTabs: true,
    introTitle: 'Volume Story',
    introText: 'Track model momentum, monthly throughput, and fuel mix distribution.',
  },
  margins: {
    pageTitle: 'Margins / Unit',
    scriptPath: '/public/reports/margins.js',
    section: 'margins',
    showYearTabs: true,
    introTitle: 'Margin Deep Dive',
    introText: 'Compare profitability by model and location to identify margin leaders and drag points.',
  },
  vas: {
    pageTitle: 'VAS / Unit',
    scriptPath: '/public/reports/vas.js',
    section: 'vas',
    showYearTabs: true,
    introTitle: 'Value-Added Services',
    introText: 'Per-unit analysis of Insurance, Extended Warranty (EW), Trade-in Guarantee (TGA), and Protective Coating services.',
  },
  finance: {
    pageTitle: 'Finance',
    scriptPath: '/public/reports/finance.js',
    section: 'finance',
    showYearTabs: true,
    introTitle: 'Finance Performance',
    introText: 'Analyze financier mix, finance source contribution, disbursed finance amount, and payout finance outcomes.',
  },
  insurance: {
    pageTitle: 'Insurance',
    scriptPath: '/public/reports/insurance.js',
    section: 'insurance',
    showYearTabs: true,
    introTitle: 'Insurance Performance',
    introText: 'Track insurer mix, insurance source/type contribution, payout insurance, and insurance margin trends.',
  },
  'sales-team': {
    pageTitle: 'Sales Team',
    scriptPath: '/public/reports/sales-team.js',
    section: 'salesteam',
    showYearTabs: true,
    introTitle: 'Sales Team Leaderboard',
    introText: 'Rank SM, TL, and SO performance by unit throughput and average net margin.',
  },
  'model-deep-dive': {
    pageTitle: 'Model Deep Dive',
    scriptPath: '/public/reports/model-deep-dive.js',
    section: 'modeldeepdive',
    showYearTabs: true,
    introTitle: 'Model Deep Dive',
    introText: 'Select a model to inspect its volume, margin, VAS, and team/location performance.',
  },
  'booking-funnel': {
    pageTitle: 'Booking to Delivery Funnel',
    scriptPath: '/public/reports/booking-funnel.js',
    section: 'bookingfunnel',
    showYearTabs: true,
    introTitle: 'Booking to Delivery Funnel',
    introText: 'Track booking, gate pass, delivery, and RTO completion with cycle times and pending aging.',
  },
  'cancellation-refund': {
    pageTitle: 'Cancellation Control Tower',
    scriptPath: '/public/reports/cancellation-refund.js',
    section: 'cancellationrefund',
    showYearTabs: true,
    introTitle: 'Cancellation Control Tower',
    introText: 'Monitor cancellation rates, cancellation aging, and hotspots by model/location.',
  },
  'discount-leakage': {
    pageTitle: 'Discount Leakage vs Margin Protection',
    scriptPath: '/public/reports/discount-leakage.js',
    section: 'discountleakage',
    showYearTabs: true,
    introTitle: 'Discount Leakage vs Margin Protection',
    introText: 'Detect high-discount low-margin leakage and protect deal profitability by model, location, and sales team.',
  },
  'delivery-sla': {
    pageTitle: 'Product-Mix Profitability Matrix',
    scriptPath: '/public/reports/delivery-sla.js',
    section: 'deliverysla',
    showYearTabs: true,
    introTitle: 'Product-Mix Profitability Matrix',
    introText: 'Analyze profitability by model, fuel, transmission, and buyer type with margin and VAS performance.',
  },
  'exchange-impact': {
    pageTitle: 'Exchange and Old Vehicle Impact',
    scriptPath: '/public/reports/exchange-impact.js',
    section: 'exchangeimpact',
    showYearTabs: true,
    introTitle: 'Exchange and Old Vehicle Impact',
    introText: 'Measure exchange penetration and compare margin, discount, and VAS outcomes versus non-exchange deals.',
  },
  'geographic-yield': {
    pageTitle: 'Geographic Demand and Yield',
    scriptPath: '/public/reports/geographic-yield.js',
    section: 'geographicyield',
    showYearTabs: true,
    introTitle: 'Geographic Demand and Yield',
    introText: 'Track demand and profitability by city and branch to identify high-yield geographies.',
  },
  'advisor-efficiency': {
    pageTitle: 'Advisor Efficiency Scorecard',
    scriptPath: '/public/reports/advisor-efficiency.js',
    section: 'advisorefficiency',
    showYearTabs: true,
    introTitle: 'Advisor Efficiency Scorecard (Ops + Profit)',
    introText: 'Rank advisors using a composite score across volume, margin, VAS, finance penetration, and discount discipline.',
  },
  'daily-retail-pulse': {
    pageTitle: 'Daily Retail Pulse',
    scriptPath: '/public/reports/daily-retail-pulse.js',
    section: 'dailyretailpulse',
    showYearTabs: true,
    introTitle: 'Daily Retail Pulse (Management One-Pager)',
    introText: 'Monitor day-level units, retail, margin, discount, finance split, and anomaly alerts.',
  },
  yoy: {
    pageTitle: 'Year-over-Year',
    scriptPath: '/public/reports/yoy.js',
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
