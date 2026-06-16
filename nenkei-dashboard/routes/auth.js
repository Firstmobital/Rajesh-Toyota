const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

// Use CALLBACK_URL env var if set, otherwise derive it dynamically from the request.
// The dynamic option uses passport's `callbackURL` as a relative path so it
// automatically inherits the host (works on localhost AND any Vercel URL).
const callbackURL = process.env.CALLBACK_URL || '/auth/google/callback';
const hasGoogleOAuthConfig = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);

if (hasGoogleOAuthConfig) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      // When callbackURL is relative, passport builds the full URL from the
      // incoming request — so it always matches whatever host you're on.
      proxy: true,
    },
    (accessToken, refreshToken, profile, done) => {
      const user = {
        id: profile.id,
        displayName: profile.displayName,
        email: profile.emails?.[0]?.value || '',
        accessToken,
      };
      done(null, user);
    }
  ));
}

const router = express.Router();

router.get('/google', (req, res, next) => {
  if (!hasGoogleOAuthConfig) {
    return res.status(503).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  return passport.authenticate('google', {
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
    accessType: 'offline',
    prompt: 'consent',
  })(req, res, next);
});

router.get('/google/callback',
  (req, res, next) => {
    if (!hasGoogleOAuthConfig) {
      return res.redirect('/login');
    }
    return passport.authenticate('google', { failureRedirect: '/login' })(req, res, next);
  },
  (req, res) => res.redirect('/dashboard')
);

router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

module.exports = router;
