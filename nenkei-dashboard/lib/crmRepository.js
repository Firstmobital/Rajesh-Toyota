const crmSheet = require('../config/crmSheet');

const QUOTES_COLUMNS = [
  'id', 'createdAt', 'createdBy', 'status',
  'customerName', 'customerPhone', 'customerEmail', 'customerAddress',
  'model', 'color', 'suffix', 'fuelType',
  'vehicleCost', 'toyotaProtect', 'registrationRoadTax', 'tga', 'smilesCoating', 'extendedWarranty',
  'other1Label', 'other1Amount', 'other2Label', 'other2Amount', 'other3Label', 'other3Amount',
  'totalOnRoadPrice', 'discountOffered', 'netAmountPayable',
  'validUntil', 'notes', 'linkedBookingId',
];

const BOOKINGS_COLUMNS = [
  'id', 'createdAt', 'createdBy', 'status', 'linkedQuoteId',
  'ctdmsEnquiryNo', 'ctdmsOrderBookingNo', 'slNo', 'orderBookingFormNo',
  'model', 'color', 'suffix', 'fuelType',
  'customerName', 'commAddress', 'addressType', 'pin',
  'phoneNo', 'mobNo', 'emailId', 'panNumber', 'occupation',
  'regBoardType', 'regPermitType',
  'vehicleBookedType', 'vehicleAlreadyOwned', 'currentVehicleReplaced',
  'modeOfPurchase', 'reasonText', 'preferredText',
  'p1VehicleCost', 'p2ToyotaProtect', 'p3RegistrationRoadTax', 'p4Tga', 'p5SmilesCoating', 'p6ExtendedWarranty',
  'p7OtherLabel', 'p7OtherAmount', 'p8OtherLabel', 'p8OtherAmount', 'p9OtherLabel', 'p9OtherAmount',
  'totalOnRoadPriceBooking', 'totalOnRoadPriceBalance',
  'p10TotalLoanAmount', 'p11AdvanceEmiProcessingFee', 'p12DownPayment',
  'p13OtherDeduction', 'p14UsedCarProcurementPrice', 'p15TotalDiscountScheme',
  'netAmountPayable',
  'indivCustomerName', 'indivNominee', 'indivMothersMaidenName',
  'compCompanyName', 'compMainUser', 'compContactPerson', 'compDesignation', 'compDrivingLicenceNo',
  'dob', 'maritalStatus', 'weddingAnniversary', 'familySize', 'familyStatus', 'qualification', 'incomeGroup',
  'paymentMode', 'payeeName', 'paymentInstrumentNo', 'paymentDate', 'paymentAmount', 'drawnOnBank',
  'declarationDate', 'likelyDeliveryDate', 'specialOccasion', 'customerSignatureCaptured',
  'orderReceivedMode', 'orderReceivedNo', 'orderReceivedDtd', 'orderReceivedForRs',
  'dateOfBooking', 'dealerSeal', 'authorisedSignatoryName',
];

function generateId(prefix) {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${year}-${Date.now().toString(36).toUpperCase()}${rand}`;
}

function rowToObject(columns, row) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i] !== undefined ? row[i] : ''; });
  return obj;
}

function objectToRow(columns, obj) {
  return columns.map(col => (obj[col] !== undefined && obj[col] !== null ? String(obj[col]) : ''));
}

// Ensures the tab exists with a header row; returns nothing, throws on
// unrecoverable Sheets errors. Safe to call before every read/write since
// it's cheap relative to the round trip already being made.
async function ensureTab(sheets, spreadsheetId, tabName, columns) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = (meta.data.sheets || []).some(s => s.properties.title === tabName);
  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${tabName}!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [columns] },
    });
  }
}

async function listRows(sheets, tabName, columns) {
  await ensureTab(sheets, crmSheet.spreadsheetId, tabName, columns);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: crmSheet.spreadsheetId,
    range: `${tabName}!A2:${String.fromCharCode(64 + columns.length)}`,
  });
  const rows = res.data.values || [];
  return rows
    .map((row, idx) => ({ ...rowToObject(columns, row), _rowNumber: idx + 2 }))
    .filter(r => r.id);
}

async function getRow(sheets, tabName, columns, id) {
  const rows = await listRows(sheets, tabName, columns);
  return rows.find(r => r.id === id) || null;
}

async function appendRow(sheets, tabName, columns, obj) {
  await ensureTab(sheets, crmSheet.spreadsheetId, tabName, columns);
  await sheets.spreadsheets.values.append({
    spreadsheetId: crmSheet.spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [objectToRow(columns, obj)] },
  });
  return obj;
}

async function updateRow(sheets, tabName, columns, id, patch) {
  const existing = await getRow(sheets, tabName, columns, id);
  if (!existing) {
    const err = new Error(`No row with id ${id} in ${tabName}`);
    err.code = 'NOT_FOUND';
    throw err;
  }
  const merged = { ...existing, ...patch };
  delete merged._rowNumber;
  const lastCol = String.fromCharCode(64 + columns.length);
  await sheets.spreadsheets.values.update({
    spreadsheetId: crmSheet.spreadsheetId,
    range: `${tabName}!A${existing._rowNumber}:${lastCol}${existing._rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [objectToRow(columns, merged)] },
  });
  return merged;
}

module.exports = {
  QUOTES_COLUMNS,
  BOOKINGS_COLUMNS,
  generateId,

  listQuotes: sheets => listRows(sheets, crmSheet.quotesTab, QUOTES_COLUMNS),
  getQuote: (sheets, id) => getRow(sheets, crmSheet.quotesTab, QUOTES_COLUMNS, id),
  appendQuote: (sheets, obj) => appendRow(sheets, crmSheet.quotesTab, QUOTES_COLUMNS, obj),
  updateQuote: (sheets, id, patch) => updateRow(sheets, crmSheet.quotesTab, QUOTES_COLUMNS, id, patch),

  listBookings: sheets => listRows(sheets, crmSheet.bookingsTab, BOOKINGS_COLUMNS),
  getBooking: (sheets, id) => getRow(sheets, crmSheet.bookingsTab, BOOKINGS_COLUMNS, id),
  appendBooking: (sheets, obj) => appendRow(sheets, crmSheet.bookingsTab, BOOKINGS_COLUMNS, obj),
  updateBooking: (sheets, id, patch) => updateRow(sheets, crmSheet.bookingsTab, BOOKINGS_COLUMNS, id, patch),
};
