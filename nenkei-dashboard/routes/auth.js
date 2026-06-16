const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');

// Use CALLBACK_URL env var if set, otherwise derive it dynamically from the request.
// The dynamic option uses passport's `callbackURL` as a relative path so it
// automatically inherits the host (works on localhost AND any Vercel URL).
const callbackURL = process.env.CALLBACK_URL || '/auth/google/callback';

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

const router = express.Router();

router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email', 'https://www.googleapis.com/auth/spreadsheets.readonly'],
  accessType: 'offline',
  prompt: 'consent',
}));

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login' }),
  (req, res) => res.redirect('/dashboard')
);

router.get('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

module.exports = router;
