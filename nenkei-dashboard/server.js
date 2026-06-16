require('dotenv').config();
const express = require('express');
const session = require('express-session');
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
app.use(session({
  secret: process.env.SESSION_SECRET || 'nenkei_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    secure: isProduction,   // HTTPS only on Vercel
    sameSite: isProduction ? 'none' : 'lax',
  },
}));

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
