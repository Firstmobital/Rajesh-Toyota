const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const sizeOf = require('image-size');
const coords = require('../config/bookingFormCoordinates');
const { toNumber } = require('./priceCalc');

const BACKGROUND_PATH = path.join(__dirname, '..', coords.SOURCE_IMAGE.path);

function formatAmount(value) {
  const n = toNumber(value);
  if (!n) return '';
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function checkboxValueFor(bookingRow, groupName) {
  return bookingRow[groupName] || '';
}

// Renders the exact filled replica of the Order Booking Form: the real
// scanned form page as a full-page background, with each field's value
// drawn at its calibrated coordinate (config/bookingFormCoordinates.js).
async function buildBookingPdf(booking) {
  const bgBytes = fs.readFileSync(BACKGROUND_PATH);
  const { width: actualW, height: actualH } = sizeOf(bgBytes);
  if (actualW !== coords.SOURCE_IMAGE.pixelWidth || actualH !== coords.SOURCE_IMAGE.pixelHeight) {
    throw new Error(
      `order-booking-form background image is ${actualW}x${actualH}px but bookingFormCoordinates.js ` +
      `(${coords.FORM_VERSION}) expects ${coords.SOURCE_IMAGE.pixelWidth}x${coords.SOURCE_IMAGE.pixelHeight}px — ` +
      `re-calibrate the coordinate map before using a replacement image.`
    );
  }

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([coords.PAGE_WIDTH, coords.PAGE_HEIGHT]);
  const bgImage = await pdfDoc.embedPng(bgBytes);
  page.drawImage(bgImage, { x: 0, y: 0, width: coords.PAGE_WIDTH, height: coords.PAGE_HEIGHT });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.06, 0.09, 0.15);

  function drawField(fieldName, text) {
    if (!text) return;
    const spec = coords.FIELDS[fieldName];
    if (!spec) return;
    const size = spec.size || coords.DEFAULT_FONT_SIZE;
    const useFont = spec.bold ? boldFont : font;
    let x = spec.x;
    if (spec.align === 'right' || spec.align === 'center') {
      const textWidth = useFont.widthOfTextAtSize(String(text), size);
      x = spec.align === 'center' ? spec.x - textWidth / 2 : spec.x - textWidth;
    }
    page.drawText(String(text), { x, y: spec.y, size, font: useFont, color: black });
  }

  function drawCheckbox(groupName, selectedValue) {
    const group = coords.CHECKBOX_GROUPS[groupName];
    if (!group || !selectedValue) return;
    const fieldName = group[selectedValue];
    if (fieldName) drawField(fieldName, 'X');
  }

  // Header
  drawField('ctdmsEnquiryNo', booking.ctdmsEnquiryNo);
  drawField('ctdmsOrderBookingNo', booking.ctdmsOrderBookingNo);
  drawField('slNo', booking.slNo);
  drawField('orderBookingFormNo', booking.orderBookingFormNo);

  drawField('model', booking.model);
  drawField('color', booking.color);
  drawField('suffix', booking.suffix);
  drawField('fuelType', booking.fuelType);

  drawField('customerName', booking.customerName);
  drawCheckbox('addressType', checkboxValueFor(booking, 'addressType'));
  const pinDigits = String(booking.pin || '').replace(/\D/g, '').slice(0, 6).split('');
  pinDigits.forEach((digit, i) => drawField(`pin${i + 1}`, digit));
  drawField('addressLine2', booking.commAddress);

  drawField('phoneNo', booking.phoneNo);
  drawField('mobNo', booking.mobNo);
  drawField('emailId', booking.emailId);
  drawField('panNumber', booking.panNumber);
  drawField('occupation', booking.occupation);

  drawCheckbox('regBoardType', checkboxValueFor(booking, 'regBoardType'));
  drawField('permitText', booking.regPermitType);

  drawCheckbox('vehicleBookedType', checkboxValueFor(booking, 'vehicleBookedType'));
  drawField('vehicleAlreadyOwned', booking.vehicleAlreadyOwned);
  drawField('currentVehicleReplaced', booking.currentVehicleReplaced);

  drawCheckbox('modeOfPurchase', checkboxValueFor(booking, 'modeOfPurchase'));
  drawField('reasonText', booking.reasonText);
  drawField('preferredText', booking.preferredText);

  // Price breakdown table
  drawField('p1VehicleCost', formatAmount(booking.p1VehicleCost));
  drawField('p2ToyotaProtect', formatAmount(booking.p2ToyotaProtect));
  drawField('p3RegistrationRoadTax', formatAmount(booking.p3RegistrationRoadTax));
  drawField('p4Tga', formatAmount(booking.p4Tga));
  drawField('p5SmilesCoating', formatAmount(booking.p5SmilesCoating));
  drawField('p6ExtendedWarranty', formatAmount(booking.p6ExtendedWarranty));
  drawField('p7OtherLabel', booking.p7OtherLabel);
  drawField('p7OtherAmount', formatAmount(booking.p7OtherAmount));
  drawField('p8OtherLabel', booking.p8OtherLabel);
  drawField('p8OtherAmount', formatAmount(booking.p8OtherAmount));
  drawField('p9OtherLabel', booking.p9OtherLabel);
  drawField('p9OtherAmount', formatAmount(booking.p9OtherAmount));

  drawField('totalOnRoadPriceBooking', formatAmount(booking.totalOnRoadPriceBooking));
  drawField('totalOnRoadPriceBalance', formatAmount(booking.totalOnRoadPriceBalance));

  drawField('p10TotalLoanAmount', formatAmount(booking.p10TotalLoanAmount));
  drawField('p11AdvanceEmiProcessingFee', formatAmount(booking.p11AdvanceEmiProcessingFee));
  drawField('p12DownPayment', formatAmount(booking.p12DownPayment));

  drawField('p13OtherDeduction', formatAmount(booking.p13OtherDeduction));
  drawField('p14UsedCarProcurementPrice', formatAmount(booking.p14UsedCarProcurementPrice));
  drawField('p15TotalDiscountScheme', formatAmount(booking.p15TotalDiscountScheme));
  drawField('netAmountPayable', formatAmount(booking.netAmountPayable));

  // Individual / Company purchase boxes
  drawField('indivCustomerName', booking.indivCustomerName);
  const nomineeLines = String(booking.indivNominee || '').split('\n');
  drawField('indivNominee1', nomineeLines[0]);
  drawField('indivNominee2', nomineeLines[1]);
  drawField('indivMothersMaidenName', booking.indivMothersMaidenName);

  drawField('compCompanyName', booking.compCompanyName);
  drawField('compMainUser', booking.compMainUser);
  drawField('compContactPerson', booking.compContactPerson);
  drawField('compDesignation', booking.compDesignation);
  drawField('compDrivingLicenceNo', booking.compDrivingLicenceNo);

  // Demographics
  drawField('dob', booking.dob);
  drawCheckbox('maritalStatus', checkboxValueFor(booking, 'maritalStatus'));
  drawField('weddingAnniversary', booking.weddingAnniversary);
  drawField('familySize', booking.familySize);
  drawCheckbox('familyStatus', checkboxValueFor(booking, 'familyStatus'));
  drawField('qualification', booking.qualification);
  drawCheckbox('incomeGroup', checkboxValueFor(booking, 'incomeGroup'));

  // Payment details
  drawField('payeeName', booking.payeeName);
  drawField('paymentInstrumentNo', booking.paymentInstrumentNo);
  drawField('paymentDate', booking.paymentDate);
  drawField('paymentAmount', formatAmount(booking.paymentAmount));
  drawField('drawnOnBank', booking.drawnOnBank);

  drawField('declarationDate', booking.declarationDate);
  drawField('likelyDeliveryDate', booking.likelyDeliveryDate);
  drawField('specialOccasion', booking.specialOccasion);

  // Dealer / order-received section
  drawField('orderReceivedMode', booking.orderReceivedMode);
  drawField('orderReceivedDtd', booking.orderReceivedDtd);
  drawField('orderReceivedForRs', formatAmount(booking.orderReceivedForRs));
  drawField('dateOfBooking', booking.dateOfBooking);
  drawField('dealerSeal', booking.dealerSeal);
  drawField('authorisedSignatoryName', booking.authorisedSignatoryName);

  return pdfDoc.save();
}

module.exports = { buildBookingPdf };
