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
  if (!rows.length) return { rows: [], headers: [] };

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

  if (headerIndex === -1 || headerIndex >= rows.length - 1) return { rows: [], headers: [] };

  const headers = rows[headerIndex].map(h => (h || '').trim());
  const data = rows.slice(headerIndex + 1);

  const parsedRows = data
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = (row[i] || '').toString().trim(); });
      return obj;
    })
    .filter(row => {
      const name = (row['CUSTOMER NAME'] || '').trim();
      const nameLower = name.toLowerCase();

      if (!name) return false;
      if (nameLower === 'customer name') return false;
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

  return {
    rows: parsedRows,
    headers,
  };
}

function parseVcm(rows) {
  if (rows.length < 2) return { rows: [], headers: [] };

  const normalizeHeader = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const headerIndex = rows.findIndex(row => {
    const normalized = (row || []).map(normalizeHeader);
    const hasCustomer = normalized.includes('customername');
    const hasMonth = normalized.includes('month');
    const hasChassis = normalized.includes('chassisno') || normalized.includes('chassis');
    return hasCustomer && hasMonth && hasChassis;
  });

  const useHeaderIndex = headerIndex === -1 ? 0 : headerIndex;
  const headers = rows[useHeaderIndex].map(h => (h || '').trim());
  const data = rows.slice(useHeaderIndex + 1);

  const parsedRows = data.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (row[i] || '').toString().trim(); });
    return obj;
  }).filter(row => {
    const values = Object.values(row).map(v => String(v || '').trim());
    if (!values.some(Boolean)) return false;

    const customerKey = Object.keys(row).find(h => normalizeHeader(h) === 'customername');
    const chassisKey = Object.keys(row).find(h => normalizeHeader(h).includes('chassis'));
    const customer = customerKey ? String(row[customerKey] || '').trim().toLowerCase() : '';
    const chassis = chassisKey ? String(row[chassisKey] || '').trim().toLowerCase() : '';

    if (customer === 'customer name') return false;
    if (chassis === 'chassis no.' || chassis === 'chassis no') return false;
    return true;
  });

  return {
    rows: parsedRows,
    headers,
  };
}

function parseSheetNumber(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/,/g, '').replace(/₹/g, '').trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function normalizeHeaderKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getTextByAliasesFromRow(row, aliases) {
  if (!row) return '';

  const aliasSet = new Set(aliases.map(normalizeHeaderKey));
  const entries = Object.entries(row);

  for (const [key, value] of entries) {
    if (!aliasSet.has(normalizeHeaderKey(key))) continue;
    const text = String(value || '').trim();
    if (text) return text;
  }

  for (const [key, value] of entries) {
    const normalizedKey = normalizeHeaderKey(key);
    if (!aliases.some(alias => normalizedKey.includes(normalizeHeaderKey(alias)))) continue;
    const text = String(value || '').trim();
    if (text) return text;
  }

  return '';
}

const EXCLUDED_FINANCE_SOURCE_VALUES = new Set(['cancelled', 'idt', 'demo', 'water dn']);

function normalizeFinanceSourceValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isExcludedFinanceSource(value) {
  return EXCLUDED_FINANCE_SOURCE_VALUES.has(normalizeFinanceSourceValue(value));
}

function getFinanceSourceValue(joinedRow, vcmRow) {
  return getTextByAliasesFromRow(joinedRow, ['FINANCE SOURCE', 'Fin-Source'])
    || getTextByAliasesFromRow(vcmRow, ['FINANCE SOURCE', 'Fin-Source']);
}

function findHeaderByAliases(headers, aliases) {
  const byNormalized = {};
  headers.forEach(header => {
    byNormalized[normalizeHeaderKey(header)] = header;
  });

  for (const alias of aliases) {
    const normalized = normalizeHeaderKey(alias);
    if (byNormalized[normalized]) return byNormalized[normalized];
  }

  const normalizedHeaders = headers.map(header => ({
    raw: header,
    normalized: normalizeHeaderKey(header),
  }));

  for (const alias of aliases) {
    const normalizedAlias = normalizeHeaderKey(alias);
    const found = normalizedHeaders.find(h => h.normalized.includes(normalizedAlias));
    if (found) return found.raw;
  }

  return null;
}

// Find the join key between VCM and Sales Register
function countJoinMatches(vcmRows, salesRows, vcmKey, salesKey) {
  const vcmSet = new Set(
    vcmRows
      .map(row => (row[vcmKey] || '').trim().toUpperCase())
      .filter(Boolean)
  );

  if (!vcmSet.size) return 0;

  return salesRows.reduce((count, row) => {
    const value = (row[salesKey] || '').trim().toUpperCase();
    if (!value) return count;
    return vcmSet.has(value) ? count + 1 : count;
  }, 0);
}

// Find the join key between VCM and Sales Register
function findJoinKey(vcmHeaders, salesHeaders, vcmRows, salesRows) {
  const candidates = [
    ['CHASSIS NO.', 'CHASSIS NO.'],
    ['Chassis No.', 'Chassis No.'],
    ['CHASSIS NO', 'CHASSIS NO'],
    ['CHASSIS', 'CHASSIS NO.'],
    ['RETAIL INV NO.', 'RETAIL INV NO.'],
    ['RETAIL INV NO', 'RETAIL INV NO.'],
    ['Retail Inv No.', 'RETAIL INV NO.'],
    ['INVOICE NO.', 'RETAIL INV NO.'],
    ['Invoice No.', 'RETAIL INV NO.'],
  ];

  const availableCandidates = candidates.filter(([vcmKey, salesKey]) => (
    vcmHeaders.includes(vcmKey) && salesHeaders.includes(salesKey)
  ));

  if (availableCandidates.length && vcmRows?.length && salesRows?.length) {
    let best = null;
    let bestScore = -1;

    availableCandidates.forEach(([vcmKey, salesKey]) => {
      const score = countJoinMatches(vcmRows, salesRows, vcmKey, salesKey);
      if (score > bestScore) {
        best = { vcmKey, salesKey };
        bestScore = score;
      }
    });

    if (best && bestScore > 0) return best;
  }

  if (availableCandidates.length) {
    const [vcmKey, salesKey] = availableCandidates[0];
    return { vcmKey, salesKey };
  }

  // Fuzzy fallback
  const vcmChassis = vcmHeaders.find(h => h.toLowerCase().includes('chassis'));
  const salesChassis = salesHeaders.find(h => h.toLowerCase().includes('chassis'));
  if (vcmChassis && salesChassis) return { vcmKey: vcmChassis, salesKey: salesChassis };

  const isInvoiceNoHeader = header => {
    const normalized = normalizeHeaderKey(header);
    if (normalized.includes('discountoninvoice')) return false;
    if (normalized.includes('invoiceamount')) return false;
    return normalized.includes('invno')
      || normalized.includes('invoiceno')
      || normalized === 'retailinvno';
  };

  const vcmInv = vcmHeaders.find(isInvoiceNoHeader);
  const salesInv = salesHeaders.find(isInvoiceNoHeader);
  if (vcmInv && salesInv) return { vcmKey: vcmInv, salesKey: salesInv };

  return null;
}

function findNetMarginKey(vcmHeaders) {
  return findHeaderByAliases(vcmHeaders, [
    'Net Margin',
    'NET MARGIN',
    'NetMargin',
  ]);
}

function findDiscountOnInvoiceKey(vcmHeaders) {
  return findHeaderByAliases(vcmHeaders, [
    'Discount On Invoice',
    'DISCOUNT ON INVOICE',
    'DiscountOnInvoice',
  ]);
}

function findFinanceAmountKey(vcmHeaders) {
  return findHeaderByAliases(vcmHeaders, [
    'FINANCE AMOUNT',
    'Finance Amount',
    'FinanceAmount',
  ]);
}

function findPayoutFinanceKey(vcmHeaders) {
  return findHeaderByAliases(vcmHeaders, [
    'PAYOUT FINANCE',
    'Payout Finance',
    'PayoutFinance',
  ]);
}

// Helper to find VAS-related columns in sales register headers
function findVASKeys(salesHeaders) {
  return {
    insurance: findHeaderByAliases(salesHeaders, ['Insurance']),
    ew: findHeaderByAliases(salesHeaders, ['EW']),
    tga: findHeaderByAliases(salesHeaders, ['TGA']),
    coating: findHeaderByAliases(salesHeaders, ['Coating', 'T-Gloss', 'Coating (T-Gloss)']),
  };
}

// Helper to safely parse numeric values from row
function parseNum(val) {
  if (!val || String(val).trim() === '') return 0;
  const cleaned = String(val).replace(/,/g, '').replace(/₹/g, '').trim();
  if (!cleaned) return 0;
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

router.get('/data/:year', requireAuth, async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const config = sheetsConfig[year];
  if (!config) {
    return res.status(400).json({ error: `No config for year ${year}` });
  }

  const userId = req.user?.id || req.user?.email || 'unknown';
  const cacheKey = `${userId}_${year}`;
  const cached = cache[cacheKey];
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return res.json(cached.data);
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(503).json({
      error: 'Google OAuth is not configured on the server.',
    });
  }

  if (!req.user?.accessToken && !req.user?.refreshToken) {
    return res.status(401).json({
      error: 'Google session expired. Please sign in again.',
      code: 'REAUTH_REQUIRED',
    });
  }

  // Build OAuth client from user's access token
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.CALLBACK_URL
  );
  oauth2Client.setCredentials({
    access_token: req.user.accessToken,
    refresh_token: req.user.refreshToken,
  });

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

    const salesParsed = parseSalesRegister(salesResult.rows);
    const vcmParsed = parseVcm(vcmResult.rows);

    const salesRegister = salesParsed.rows;
    const vcmData = vcmParsed.rows;

    // Determine join key
    const vcmHeaders = vcmParsed.headers;
    const salesHeaders = salesParsed.headers;
    const joinKeys = findJoinKey(vcmHeaders, salesHeaders, vcmData, salesRegister);
    const netMarginKey = findNetMarginKey(vcmHeaders);
    const discountOnInvoiceKey = findDiscountOnInvoiceKey(vcmHeaders);
    const financeAmountKey = findFinanceAmountKey(vcmHeaders);
    const payoutFinanceKey = findPayoutFinanceKey(vcmHeaders);
    const vasKeys = findVASKeys(salesHeaders);

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
      // Extract VAS columns from sales row
      const insurance = vasKeys.insurance ? parseNum(sRow[vasKeys.insurance]) : 0;
      const tga = vasKeys.tga ? parseNum(sRow[vasKeys.tga]) : 0;
      const ew = vasKeys.ew ? parseNum(sRow[vasKeys.ew]) : 0;
      const coating = vasKeys.coating ? parseNum(sRow[vasKeys.coating]) : 0;
      const totalVAS = insurance + tga + ew + coating;

      if (!joinKeys) {
        return {
          ...sRow,
          insurance,
          tga,
          ew,
          coating,
          totalVAS,
          netMargin: null,
          discountOnInvoice: null,
        };
      }

      const k = (sRow[joinKeys.salesKey] || '').trim().toUpperCase();
      const vcmRow = vcmMap[k];
      const netMargin = vcmRow && netMarginKey ? parseSheetNumber(vcmRow[netMarginKey]) : null;
      const discountOnInvoice = vcmRow && discountOnInvoiceKey ? parseSheetNumber(vcmRow[discountOnInvoiceKey]) : null;
      const financeAmount = vcmRow && financeAmountKey ? parseSheetNumber(vcmRow[financeAmountKey]) : null;
      const payoutFinance = vcmRow && payoutFinanceKey ? parseSheetNumber(vcmRow[payoutFinanceKey]) : null;
      return {
        ...sRow,
        insurance,
        tga,
        ew,
        coating,
        totalVAS,
        netMargin,
        discountOnInvoice,
        financeAmount,
        payoutFinance,
        _vcmRow: vcmRow || null,
      };
    }).filter(row => !isExcludedFinanceSource(getFinanceSourceValue(row, row._vcmRow)));

    const responseData = {
      year,
      salesRegisterTab: salesResult.tab,
      vcmTab: vcmResult.tab,
      joinKey: joinKeys,
      netMarginKey,
      discountOnInvoiceKey,
      financeAmountKey,
      payoutFinanceKey,
      salesRegister,
      vcmData,
      joined,
    };

    cache[cacheKey] = { data: responseData, fetchedAt: Date.now() };
    res.json(responseData);
  } catch (err) {
    const message = err?.message || 'Unexpected Sheets API error';
    const status = err?.code || err?.status || err?.response?.status;
    const apiMessage = err?.response?.data?.error?.message || message;
    const apiReason =
      err?.response?.data?.error?.errors?.[0]?.reason ||
      err?.errors?.[0]?.reason ||
      '';
    const authError =
      status === 401 ||
      /invalid_grant|invalid_credentials|unauthorized|auth/i.test(apiMessage);

    const insufficientScope =
      status === 403 &&
      (apiReason === 'insufficientPermissions' ||
        /insufficient permission|insufficient permissions|insufficient authentication scopes|scope/i.test(apiMessage));

    const noSheetAccess =
      status === 403 &&
      /caller does not have permission|permission denied|forbidden/i.test(apiMessage);

    if (authError) {
      return res.status(401).json({
        error: 'Google authorization expired. Please sign in again.',
        code: 'REAUTH_REQUIRED',
      });
    }

    if (insufficientScope) {
      return res.status(401).json({
        error: 'Google authorization needs updated permissions. Please sign in again.',
        code: 'REAUTH_REQUIRED',
      });
    }

    if (noSheetAccess) {
      return res.status(403).json({
        error: 'Your Google account does not have access to the source spreadsheet. Ask an admin to share the sheet with your email.',
        code: 'SHEET_ACCESS_DENIED',
      });
    }

    console.error('Sheets API error:', apiMessage);
    res.status(500).json({ error: apiMessage });
  }
});

module.exports = router;
