const PDFDocument = require('pdfkit');
const { toNumber } = require('./priceCalc');

function formatINR(value) {
  const n = toNumber(value);
  return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

const PRICE_ROWS = [
  ['Vehicle Cost (Ex-showroom Price)', 'vehicleCost'],
  ['Toyota Protect (Standard/Add-on)', 'toyotaProtect'],
  ['Registration + Road Tax', 'registrationRoadTax'],
  ['TGA (Selected)', 'tga'],
  ['Smiles Package / Long Life Body Coating', 'smilesCoating'],
  ['Extended Warranty', 'extendedWarranty'],
];

// Builds the quote PDF into the given writable stream (e.g. an HTTP
// response) and resolves when the document is fully written.
function buildQuotePdf(quote, outputStream) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.on('error', reject);
    outputStream.on('finish', resolve);
    doc.pipe(outputStream);

    doc.fontSize(20).fillColor('#1A2332').text('Rajesh Toyota', { continued: true });
    doc.fillColor('#378ADD').text(' — Quotation');
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#64748B').text(`Quote ${quote.id}  ·  ${quote.createdAt || ''}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#1A2332').text('Customer', { underline: true });
    doc.fontSize(10).fillColor('#1E293B');
    doc.text(`Name: ${quote.customerName || '-'}`);
    if (quote.customerPhone) doc.text(`Phone: ${quote.customerPhone}`);
    if (quote.customerEmail) doc.text(`Email: ${quote.customerEmail}`);
    if (quote.customerAddress) doc.text(`Address: ${quote.customerAddress}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#1A2332').text('Vehicle', { underline: true });
    doc.fontSize(10).fillColor('#1E293B');
    doc.text(`Model: ${quote.model || '-'}    Color: ${quote.color || '-'}    Suffix: ${quote.suffix || '-'}    Fuel: ${quote.fuelType || '-'}`);
    doc.moveDown(1);

    doc.fontSize(12).fillColor('#1A2332').text('Price Breakdown', { underline: true });
    doc.moveDown(0.3);

    const tableTop = doc.y;
    const colParticularsX = 50;
    const colAmountX = 420;
    const rowHeight = 20;
    let y = tableTop;

    doc.fontSize(9).fillColor('#64748B');
    doc.text('PARTICULARS', colParticularsX, y);
    doc.text('AMOUNT', colAmountX, y, { width: 100, align: 'right' });
    y += rowHeight;
    doc.moveTo(50, y - 4).lineTo(520, y - 4).strokeColor('#E2E8F0').stroke();

    doc.fontSize(10).fillColor('#1E293B');
    const otherLines = [
      [quote.other1Label, quote.other1Amount],
      [quote.other2Label, quote.other2Amount],
      [quote.other3Label, quote.other3Amount],
    ].filter(([label, amount]) => label || toNumber(amount));

    const allRows = [
      ...PRICE_ROWS.map(([label, key]) => [label, quote[key]]),
      ...otherLines,
    ];

    allRows.forEach(([label, amount]) => {
      doc.text(label || 'Other', colParticularsX, y, { width: 350 });
      doc.text(formatINR(amount), colAmountX, y, { width: 100, align: 'right' });
      y += rowHeight;
    });

    doc.moveTo(50, y).lineTo(520, y).strokeColor('#E2E8F0').stroke();
    y += 8;

    doc.fontSize(11).fillColor('#1A2332');
    doc.text('Total On Road Price', colParticularsX, y, { width: 350 });
    doc.text(formatINR(quote.totalOnRoadPrice), colAmountX, y, { width: 100, align: 'right' });
    y += rowHeight;

    if (toNumber(quote.discountOffered)) {
      doc.fontSize(10).fillColor('#D85A30');
      doc.text('Discount / Scheme Offered', colParticularsX, y, { width: 350 });
      doc.text(`- ${formatINR(quote.discountOffered)}`, colAmountX, y, { width: 100, align: 'right' });
      y += rowHeight;
    }

    doc.moveTo(50, y).lineTo(520, y).strokeColor('#1A2332').stroke();
    y += 8;

    doc.fontSize(13).fillColor('#1A2332');
    doc.text('Net Amount Payable', colParticularsX, y, { width: 350 });
    doc.text(formatINR(quote.netAmountPayable), colAmountX, y, { width: 100, align: 'right' });

    doc.moveDown(3);
    doc.fontSize(9).fillColor('#94A3B8');
    doc.text('This quotation is indicative and subject to confirmation at the time of booking. Prices, taxes and levies are as applicable on the date of delivery.', { width: 470 });
    if (quote.validUntil) doc.text(`Valid until: ${quote.validUntil}`);

    doc.end();
  });
}

module.exports = { buildQuotePdf };
