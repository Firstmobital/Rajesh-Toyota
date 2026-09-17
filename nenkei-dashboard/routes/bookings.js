const express = require('express');
const { sheetsClientForUser, classifySheetsError } = require('../lib/sheetsClient');
const repo = require('../lib/crmRepository');
const { computeTotalOnRoadPrice, computeNetAmountPayable } = require('../lib/priceCalc');
const { buildBookingPdf } = require('../lib/bookingPdf');
const { BOOKINGS_COLUMNS } = require('../lib/crmRepository');

const router = express.Router();

function handleSheetsError(res, err) {
  if (err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
  const { httpStatus, body } = classifySheetsError(err);
  res.status(httpStatus).json(body);
}

function bookingFromBody(body) {
  const out = {};
  BOOKINGS_COLUMNS.forEach(col => {
    if (['id', 'createdAt', 'createdBy'].includes(col)) return;
    out[col] = body[col] !== undefined ? body[col] : '';
  });

  const totalOnRoadPriceBooking = computeTotalOnRoadPrice({
    vehicleCost: body.p1VehicleCost,
    toyotaProtect: body.p2ToyotaProtect,
    registrationRoadTax: body.p3RegistrationRoadTax,
    tga: body.p4Tga,
    smilesCoating: body.p5SmilesCoating,
    extendedWarranty: body.p6ExtendedWarranty,
    other1Amount: body.p7OtherAmount,
    other2Amount: body.p8OtherAmount,
    other3Amount: body.p9OtherAmount,
  });
  out.totalOnRoadPriceBooking = totalOnRoadPriceBooking;
  out.netAmountPayable = computeNetAmountPayable(totalOnRoadPriceBooking, {
    otherDeduction: body.p13OtherDeduction,
    usedCarProcurementPrice: body.p14UsedCarProcurementPrice,
    totalDiscountScheme: body.p15TotalDiscountScheme,
  });

  return out;
}

router.get('/', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const bookings = await repo.listBookings(sheets);
    bookings.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    res.render('bookings-list', { topSection: 'bookings', pageTitle: 'Bookings', bookings });
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.get('/new', (req, res) => {
  res.render('booking-form', { topSection: 'bookings', pageTitle: 'New Booking', booking: null });
});

router.post('/', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const booking = {
      id: repo.generateId('BK'),
      createdAt: new Date().toISOString(),
      createdBy: req.user?.displayName || req.user?.email || '',
      status: 'draft',
      linkedQuoteId: '',
      ...bookingFromBody(req.body),
    };
    await repo.appendBooking(sheets, booking);
    res.redirect(`/bookings/${booking.id}/edit`);
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.get('/:id/edit', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const booking = await repo.getBooking(sheets, req.params.id);
    if (!booking) return res.status(404).send('Booking not found');
    res.render('booking-form', { topSection: 'bookings', pageTitle: `Booking ${booking.id}`, booking });
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.post('/:id', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const patch = bookingFromBody(req.body);
    if (req.body.status) patch.status = req.body.status;
    await repo.updateBooking(sheets, req.params.id, patch);
    res.redirect(`/bookings/${req.params.id}/edit`);
  } catch (err) {
    handleSheetsError(res, err);
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const sheets = sheetsClientForUser(req.user);
    const booking = await repo.getBooking(sheets, req.params.id);
    if (!booking) return res.status(404).send('Booking not found');
    const pdfBytes = await buildBookingPdf(booking);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="booking-${booking.id}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    handleSheetsError(res, err);
  }
});

module.exports = router;
