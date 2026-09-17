// Dedicated spreadsheet for CRM write-back (Quotes + Bookings).
// Kept separate from config/sheets.js (Sales Register / VCM) since those
// sheets are an externally-owned read-only pipeline.
module.exports = {
  spreadsheetId: process.env.CRM_SPREADSHEET_ID || '',
  quotesTab: 'Quotes',
  bookingsTab: 'Bookings',
};
