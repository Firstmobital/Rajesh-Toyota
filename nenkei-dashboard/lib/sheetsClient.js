const { google } = require('googleapis');

// Builds an authenticated Sheets API client from the logged-in user's own
// OAuth tokens (stored on req.user by passport, see routes/auth.js).
// Extracted out of the logic that used to live inline in routes/api.js so
// routes/quotes.js and routes/bookings.js can reuse it too.
function sheetsClientForUser(user) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    const err = new Error('Google OAuth is not configured on the server.');
    err.code = 'OAUTH_NOT_CONFIGURED';
    throw err;
  }

  if (!user?.accessToken && !user?.refreshToken) {
    const err = new Error('Google session expired. Please sign in again.');
    err.code = 'REAUTH_REQUIRED';
    throw err;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );
  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}

// Same classification routes/api.js already uses for Sheets API errors, so
// the new CRM routes can surface the same REAUTH_REQUIRED / SHEET_ACCESS_DENIED
// codes instead of a raw 500.
function classifySheetsError(err) {
  const message = err?.message || 'Unexpected Sheets API error';
  const status = err?.code || err?.status || err?.response?.status;
  const apiMessage = err?.response?.data?.error?.message || message;
  const apiReason =
    err?.response?.data?.error?.errors?.[0]?.reason ||
    err?.errors?.[0]?.reason ||
    '';

  const authError =
    err?.code === 'REAUTH_REQUIRED' ||
    status === 401 ||
    /invalid_grant|invalid_credentials|unauthorized|auth/i.test(apiMessage);

  const insufficientScope =
    status === 403 &&
    (apiReason === 'insufficientPermissions' ||
      /insufficient permission|insufficient permissions|insufficient authentication scopes|scope/i.test(apiMessage));

  const noSheetAccess =
    status === 403 &&
    /caller does not have permission|permission denied|forbidden/i.test(apiMessage);

  if (authError || insufficientScope) {
    return {
      httpStatus: 401,
      body: { error: 'Google authorization expired or needs updated permissions. Please sign in again.', code: 'REAUTH_REQUIRED' },
    };
  }

  if (noSheetAccess) {
    return {
      httpStatus: 403,
      body: { error: 'Your Google account does not have access to the CRM spreadsheet. Ask an admin to share it with your email.', code: 'SHEET_ACCESS_DENIED' },
    };
  }

  return { httpStatus: 500, body: { error: apiMessage } };
}

module.exports = { sheetsClientForUser, classifySheetsError };
