const express = require('express');
const { sheetsClientForUser, classifySheetsError } = require('../lib/sheetsClient');
const repo = require('../lib/crmRepository');
const { computeTotalOnRoadPrice, computeNetAmountPayable } = require('../lib/priceCalc');
const { mapQuoteToBookingDraft } = require('../lib/quoteToBooking');
const { buildQuotePdf } = require('../lib/quotePdf');

const router = express.Router();

function handleSheetsError(res, err) {
  if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
  const { httpStatus, body } = classifySheetsError(err);
  res.status(httpStatus).json(body);
}

function quoteFromBody(body) {
  const priceFields = {
    vehicleCost: body.vehicleCost,
    toyotaProtect: body.toyotaProtect,
    registrationRoadTax: body.registrationRoadTax,
    tga: body.tga,
    smilesCoating: body.smilesCoating,
    extendedWarranty: body.extendedWarranty,
    other1Amount: body.other1Amount,
    other2Amount: body.other2Amount,
    other3Amount: body.other3Amount,
  };
  const totalOnRoadPrice = computeTotalOnRoadPrice(priceFields);
  const netAmountPayable = computeNetAmountPayable(totalOnRoadPrice, { discountOffered: body.discountOffered });

  return {
    customerName: body.customerName || '',
    customerPhone: body.customerPhone || '',
    customerEmail: body.customerEmail || '',
    customerAddress: body.customerAddress || '',
    model: body.model || '',
    color: body.color || '',
    suffix: body.suffix || '',
    fuelType: body.fuelType || '',
    vehicleCost: body.vehicleCost || '',
    toyotaProtect: body.toyotaProtect || '',
    registrationRoadTax: body.registrationRoadTax || '',
    tga: body.tga || '',
    smilesCoating: body.smilesCoating || '',
    extendedWarranty: body.extendedWarranty || '',
    other1Label: body.other1Label || '',
    other1Amount: body.other1Amount || '',
    other2Label: body.other2Label || '',
    other2Amount: body.other2Amount || '',
    other3Label: body.other3Label || '',
    other3Amount: body.other3Amount || '',
    totalOnRoadPrice,
    discountOffered: body.discountOffered || '',
    netAmountPayable,
    validUntil: body.validUntil || '',
    notes: body.notes || '',
  };
}

router.get('/', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const quotes = await repo.listQuotes(sheets);
    quotes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.render('quotes-list', { topSection: 'quotes', pageTitle: 'Quotes', quotes });
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.get('/new', (req, res) => {
  res.render('quote-form', { topSection: 'quotes', pageTitle: 'New Quote', quote: null });
});

router.post('/', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const quote = {
      id: repo.generateId('QT'),
      createdAt: new Date().toISOString(),
      createdBy: req.user?.displayName || req.user?.email || '',
      status: 'draft',
      linkedBookingId: '',
      ...quoteFromBody(req.body),
    };
    await repo.appendQuote(sheets, quote);
    res.redirect(`/quotes/${quote.id}`);
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.get('/:id/edit', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const quote = await repo.getQuote(sheets, req.params.id);
    if (!quote) return res.status(404).send('Quote not found');
    res.render('quote-form', { topSection: 'quotes', pageTitle: `Edit Quote ${quote.id}`, quote });
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const quote = await repo.getQuote(sheets, req.params.id);
    if (!quote) return res.status(404).send('Quote not found');
    res.render('quote-detail', { topSection: 'quotes', pageTitle: `Quote ${quote.id}`, quote });
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.post('/:id', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const patch = { ...quoteFromBody(req.body) };
    if (req.body.status) patch.status = req.body.status;
    await repo.updateQuote(sheets, req.params.id, patch);
    res.redirect(`/quotes/${req.params.id}`);
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const quote = await repo.getQuote(sheets, req.params.id);
    if (!quote) return res.status(404).send('Quote not found');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="quote-${quote.id}.pdf"`);
    await buildQuotePdf(quote, res);
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.post('/:id/convert', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const quote = await repo.getQuote(sheets, req.params.id);
    if (!quote) return res.status(404).send('Quote not found');

    const booking = {
      id: repo.generateId('BK'),
      createdAt: new Date().toISOString(),
      createdBy: req.user?.displayName || req.user?.email || '',
      ...mapQuoteToBookingDraft(quote),
    };
    await repo.appendBooking(sheets, booking);
    await repo.updateQuote(sheets, quote.id, { status: 'converted', linkedBookingId: booking.id });

    res.redirect(`/bookings/${booking.id}/edit`);
  } catch (err) {
    handleSheetsError(res, err);
  }
});

module.exports = router;
