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
  if (rows.length < 2) return [];
  // Row 0 = merged header (skip), Row 1 = real column headers
  const headers = rows[1].map(h => (h || '').trim());
  const data = rows.slice(2);

  return data
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (row[i] || '').toString().trim(); });
      return obj;
    })
    .filter(row => {
      const name = row['CUSTOMER NAME'] || '';
      if (!name || name === 'Cancelled' || name === 'IDT') return false;
      return true;
    })
    .map(row => {
      // Convert MONTH from Excel serial to month name
      const monthSerial = row['MONTH'];
      if (monthSerial) {
        row._monthName = excelSerialToMonthName(monthSerial);
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
        'VCM',
        'vcm',
        'VCM Data',
        `VCM ${year}`,
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
