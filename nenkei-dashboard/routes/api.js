const express = require('express');
const { google } = require('googleapis');
const sheetsConfig = require('../config/sheets');

const router = express.Router();

// In-memory cache: key = `${userId}_${year}`, value = { data, fetchedAt }
const cache = {};
const CACHE_TTL_MS = 5 * 60 * 1000;

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Convert Excel serial date number to month name
function excelSerialToMonthName(serial) {
  const n = parseInt(serial, 10);
  if (isNaN(n) || n < 1) return null;
  const date = new Date((n - 25569) * 86400 * 1000);
  return date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

function textToMonthName(text) {
  if (text == null) return null;
  const raw = String(text).trim();
  if (!raw) return null;

  // Handles Jan/January and mixed-case month values.
  const parsed = new Date(`2000-${raw}-01T00:00:00Z`);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  }

  const short = raw.slice(0, 3).toLowerCase();
  const monthMap = {
    jan: 'Jan',
    feb: 'Feb',
    mar: 'Mar',
    apr: 'Apr',
    may: 'May',
    jun: 'Jun',
    jul: 'Jul',
    aug: 'Aug',
    sep: 'Sep',
    oct: 'Oct',
    nov: 'Nov',
    dec: 'Dec',
  };
  return monthMap[short] || null;
}

function monthNameFromValue(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  // Numeric values are assumed to be Excel serial date values.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    return excelSerialToMonthName(raw);
  }

  return textToMonthName(raw);
}

// Try multiple tab names for resilience
async function fetchTab(sheets, spreadsheetId, tabCandidates) {
  for (const tab of tabCandidates) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: tab,
      });
      return { tab, rows: res.data.values || [] };
    } catch (e) {
      if (e.code === 400 || e.code === 404) continue;
      throw e;
    }
  }
  throw new Error(`None of these tabs were found: ${tabCandidates.join(', ')}`);
}

function parseSalesRegister(rows) {
  if (!rows.length) return [];

  const normalizeHeader = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const headerIndex = rows.findIndex(row => {
    const normalized = (row || []).map(normalizeHeader);
    const hasCustomer = normalized.includes('customername');
    const hasMonth = normalized.includes('month');
    return hasCustomer && hasMonth;
  });

  if (headerIndex === -1 || headerIndex >= rows.length - 1) return [];

  const headers = rows[headerIndex].map(h => (h || '').trim());
  const data = rows.slice(headerIndex + 1);

  return data
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (row[i] || '').toString().trim(); });
      obj._contactColumnC = (row[2] || '').toString().trim();
      return obj;
    })
    .filter(row => {
      const name = (row['CUSTOMER NAME'] || '').trim();
      const colC = (row._contactColumnC || '').trim();
      const nameLower = name.toLowerCase();
      const colCLower = colC.toLowerCase();

      if (!name) return false;
      if (nameLower === 'cancelled' || nameLower === 'idt') return false;
      if (colCLower === 'cancelled' || colCLower === 'idt') return false;

      delete row._contactColumnC;
      return true;
    })
    .map(row => {
      // Normalize MONTH to short month names expected by charts.
      const monthRaw = row['MONTH'];
      if (monthRaw) {
        row._monthName = monthNameFromValue(monthRaw);
      }
      return row;
    });
}

function parseVcm(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => (h || '').trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').toString().trim(); });
    return obj;
  });
}

// Find the join key between VCM and Sales Register
function findJoinKey(vcmHeaders, salesHeaders) {
  const candidates = [
    ['CHASSIS NO.', 'CHASSIS NO.'],
    ['Chassis No.', 'Chassis No.'],
    ['CHASSIS NO', 'CHASSIS NO'],
    ['CHASSIS', 'CHASSIS NO.'],
    ['INVOICE NO.', 'RETAIL INV NO.'],
    ['Invoice No.', 'RETAIL INV NO.'],
  ];
  for (const [vcmKey, salesKey] of candidates) {
    if (vcmHeaders.includes(vcmKey) && salesHeaders.includes(salesKey)) {
      return { vcmKey, salesKey };
    }
  }
  // Fuzzy fallback
  const vcmChassis = vcmHeaders.find(h => h.toLowerCase().includes('chassis'));
  const salesChassis = salesHeaders.find(h => h.toLowerCase().includes('chassis'));
  if (vcmChassis && salesChassis) return { vcmKey: vcmChassis, salesKey: salesChassis };

  const vcmInv = vcmHeaders.find(h => h.toLowerCase().includes('invoice'));
  const salesInv = salesHeaders.find(h => h.toLowerCase().includes('inv'));
  if (vcmInv && salesInv) return { vcmKey: vcmInv, salesKey: salesInv };

  return null;
}

function findNetMarginKey(vcmHeaders) {
  return vcmHeaders.find(h => h.toLowerCase().includes('net margin') || h.toLowerCase() === 'net margin') || null;
}

router.get('/data/:year', requireAuth, async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const config = sheetsConfig[year];
  if (!config) {
    return res.status(400).json({ error: `No config for year ${year}` });
  }

  const cacheKey = `${req.user.id}_${year}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  // Build OAuth client from user's access token
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );
  oauth2Client.setCredentials({ access_token: req.user.accessToken });

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  try {
    const [salesResult, vcmResult] = await Promise.all([
      fetchTab(sheets, config.spreadsheetId, [
        config.salesRegisterTab,
        'Sales Register',
        'sales register',
        `Sales Register ${year}`,
      ]),
      fetchTab(sheets, config.spreadsheetId, [
        config.vcmTab,
        `VMC ${year}`,
        `VCM ${year}`,
        'VMC',
        'VCM',
        'vcm',
        'vmc',
        'VCM Data',
        'VMC Data',
      ]),
    ]);

    const salesRegister = parseSalesRegister(salesResult.rows);
    const vcmData = parseVcm(vcmResult.rows);

    // Determine join key
    const vcmHeaders = vcmResult.rows[0]?.map(h => (h || '').trim()) || [];
    const salesHeaders = salesResult.rows[1]?.map(h => (h || '').trim()) || [];
    const joinKeys = findJoinKey(vcmHeaders, salesHeaders);
    const netMarginKey = findNetMarginKey(vcmHeaders);

    // Build VCM lookup map
    const vcmMap = {};
    if (joinKeys) {
      vcmData.forEach(row => {
        const k = (row[joinKeys.vcmKey] || '').trim().toUpperCase();
        if (k) vcmMap[k] = row;
      });
    }

    // Join
    const joined = salesRegister.map(sRow => {
      if (!joinKeys || !netMarginKey) return { ...sRow, netMargin: null };
      const k = (sRow[joinKeys.salesKey] || '').trim().toUpperCase();
      const vcmRow = vcmMap[k];
      const netMargin = vcmRow ? parseFloat((vcmRow[netMarginKey] || '').replace(/,/g, '')) || null : null;
      return { ...sRow, netMargin, _vcmRow: vcmRow || null };
    });

    const responseData = {
      year,
      salesRegisterTab: salesResult.tab,
      vcmTab: vcmResult.tab,
      joinKey: joinKeys,
      netMarginKey,
      salesRegister,
      vcmData,
      joined,
    };

    cache[cacheKey] = { data: responseData, fetchedAt: Date.now() };
    res.json(responseData);
  } catch (err) {
    console.error('Sheets API error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
