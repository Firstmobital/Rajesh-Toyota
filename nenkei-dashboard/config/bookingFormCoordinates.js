// Coordinate map for overlaying booking data onto a rendered image of the
// real dealer "Order Booking Form" (Welcome Docket page 7), used by
// lib/bookingPdf.js to produce an exact filled replica PDF.
//
// Coordinates are in PDF points (72pt/inch), origin bottom-left, matching
// the A4 page pdf-lib creates for the replica. They were calibrated against
// assets/forms/order-booking-form-v1.png (1786x2526px) by overlaying a
// pixel grid on the background image, reading off each field's blank-line/
// box position against the grid, then converting (the background was
// rendered at exactly 3x the PDF's 72dpi point space, so px/3 = pt) and
// visually verifying against a rendered sample PDF. The source image's
// pixel size is asserted below so a re-exported/rescaled background image
// fails loudly instead of silently drifting.

const FORM_VERSION = 'v1';

const SOURCE_IMAGE = {
  path: 'assets/forms/order-booking-form-v1.png',
  pixelWidth: 1786,
  pixelHeight: 2526,
};

// A4 in points.
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

const DEFAULT_FONT_SIZE = 8;
const CHECKBOX_MARK_SIZE = 9;

// { x, y, size?, bold?, align? } — size/bold/align fall back to the
// defaults above when omitted. Checkbox fields are drawn as an "X" only
// when that option is the selected value.
const FIELDS = {
  ctdmsEnquiryNo: { x: 160.0, y: 778.6 },
  ctdmsOrderBookingNo: { x: 160.0, y: 765.2 },
  slNo: { x: 416.7, y: 766.9 },
  orderBookingFormNo: { x: 473.3, y: 747.9 },

  model: { x: 123.3, y: 726.9 },
  color: { x: 256.7, y: 726.9 },
  suffix: { x: 360.0, y: 726.9 },
  fuelType: { x: 470.0, y: 726.9 },

  customerName: { x: 103.3, y: 707.9 },
  resCheckbox: { x: 177.0, y: 691.2, size: CHECKBOX_MARK_SIZE },
  offCheckbox: { x: 212.0, y: 691.2, size: CHECKBOX_MARK_SIZE },

  pin1: { x: 490.7, y: 672.9, align: 'center' },
  pin2: { x: 505.0, y: 672.9, align: 'center' },
  pin3: { x: 519.3, y: 672.9, align: 'center' },
  pin4: { x: 533.7, y: 672.9, align: 'center' },
  pin5: { x: 548.0, y: 672.9, align: 'center' },
  pin6: { x: 562.3, y: 672.9, align: 'center' },

  addressLine2: { x: 48.3, y: 671.2 },

  phoneNo: { x: 81.7, y: 650.2 },
  mobNo: { x: 305.0, y: 650.2 },
  emailId: { x: 416.7, y: 650.2 },

  panNumber: { x: 73.3, y: 634.6 },
  occupation: { x: 380.0, y: 634.6 },

  whiteBoardCheckbox: { x: 93.7, y: 610.2, size: CHECKBOX_MARK_SIZE },
  yellowBoardCheckbox: { x: 186.3, y: 610.2, size: CHECKBOX_MARK_SIZE },

  firstPurchaseCheckbox: { x: 154.3, y: 595.9, size: CHECKBOX_MARK_SIZE },
  additionalCheckbox: { x: 273.7, y: 595.9, size: CHECKBOX_MARK_SIZE },
  replacementCheckbox: { x: 403.7, y: 595.9, size: CHECKBOX_MARK_SIZE },
  vehicleAlreadyOwned: { x: 315.0, y: 588.6 },
  currentVehicleReplaced: { x: 533.3, y: 588.6 },

  cashCheckbox: { x: 154.3, y: 573.6, size: CHECKBOX_MARK_SIZE },
  ownFinanceCheckbox: { x: 273.7, y: 573.6, size: CHECKBOX_MARK_SIZE },
  inHouseFinanceCheckbox: { x: 403.7, y: 573.6, size: CHECKBOX_MARK_SIZE },
  reasonText: { x: 320.0, y: 562.6 },
  preferredText: { x: 420.0, y: 562.6 },

  // Price breakdown table — amounts right-aligned in the AMOUNT column
  // (column right edge is ~x=340).
  p1VehicleCost: { x: 333.3, y: 532.9, align: 'right' },
  p2ToyotaProtect: { x: 333.3, y: 517.2, align: 'right' },
  p3RegistrationRoadTax: { x: 333.3, y: 501.6, align: 'right' },
  p4Tga: { x: 333.3, y: 485.9, align: 'right' },
  p5SmilesCoating: { x: 333.3, y: 470.2, align: 'right' },
  p6ExtendedWarranty: { x: 333.3, y: 454.6, align: 'right' },
  p7OtherLabel: { x: 105.0, y: 438.9 },
  p7OtherAmount: { x: 333.3, y: 438.9, align: 'right' },
  p8OtherLabel: { x: 105.0, y: 423.2 },
  p8OtherAmount: { x: 333.3, y: 423.2, align: 'right' },
  p9OtherLabel: { x: 105.0, y: 407.6 },
  p9OtherAmount: { x: 333.3, y: 407.6, align: 'right' },

  totalOnRoadPriceBooking: { x: 253.3, y: 392.9, bold: true, align: 'right' },
  totalOnRoadPriceBalance: { x: 333.3, y: 392.9, bold: true, align: 'right' },

  p10TotalLoanAmount: { x: 333.3, y: 376.2, align: 'right' },
  p11AdvanceEmiProcessingFee: { x: 333.3, y: 360.2, align: 'right' },
  p12DownPayment: { x: 333.3, y: 344.9, align: 'right' },

  p13OtherDeduction: { x: 333.3, y: 310.6, align: 'right' },
  p14UsedCarProcurementPrice: { x: 333.3, y: 294.9, align: 'right' },
  p15TotalDiscountScheme: { x: 333.3, y: 279.2, align: 'right' },
  netAmountPayable: { x: 333.3, y: 264.2, bold: true, align: 'right' },

  indivCustomerName: { x: 450.0, y: 514.2 },
  indivNominee1: { x: 463.3, y: 497.9 },
  indivNominee2: { x: 463.3, y: 480.2 },
  indivMothersMaidenName: { x: 463.3, y: 444.2 },

  compCompanyName: { x: 415.0, y: 361.9 },
  compMainUser: { x: 440.0, y: 344.6 },
  compContactPerson: { x: 431.7, y: 327.2 },
  compDesignation: { x: 403.3, y: 310.2 },
  compDrivingLicenceNo: { x: 456.7, y: 292.9 },

  dob: { x: 96.7, y: 248.6 },
  marriedCheckbox: { x: 233.3, y: 248.6, size: CHECKBOX_MARK_SIZE },
  unmarriedCheckbox: { x: 284.0, y: 248.6, size: CHECKBOX_MARK_SIZE },
  weddingAnniversary: { x: 435.0, y: 248.6 },

  familySize: { x: 113.3, y: 236.9 },
  nuclearCheckbox: { x: 233.3, y: 236.9, size: CHECKBOX_MARK_SIZE },
  jointCheckbox: { x: 284.0, y: 236.9, size: CHECKBOX_MARK_SIZE },
  qualification: { x: 435.0, y: 236.9 },

  income24Checkbox: { x: 118.7, y: 224.9, size: CHECKBOX_MARK_SIZE },
  income46Checkbox: { x: 172.7, y: 224.9, size: CHECKBOX_MARK_SIZE },
  income68Checkbox: { x: 224.7, y: 224.9, size: CHECKBOX_MARK_SIZE },
  income810Checkbox: { x: 275.3, y: 224.9, size: CHECKBOX_MARK_SIZE },
  income1015Checkbox: { x: 328.3, y: 224.9, size: CHECKBOX_MARK_SIZE },
  income1520Checkbox: { x: 391.3, y: 224.9, size: CHECKBOX_MARK_SIZE },
  incomeAbove20Checkbox: { x: 455.3, y: 224.9, size: CHECKBOX_MARK_SIZE },

  payeeName: { x: 48.3, y: 180.2 },
  paymentInstrumentNo: { x: 121.7, y: 162.6 },
  paymentDate: { x: 221.7, y: 162.6 },
  paymentAmount: { x: 290.0, y: 162.6 },
  drawnOnBank: { x: 461.7, y: 162.6 },

  declarationDate: { x: 46.7, y: 120.2 },
  likelyDeliveryDate: { x: 100.0, y: 120.2 },
  specialOccasion: { x: 200.0, y: 120.2 },
  customerSignature: { x: 410.0, y: 120.2 },

  orderReceivedMode: { x: 258.3, y: 76.9 },
  orderReceivedDtd: { x: 333.3, y: 76.9 },
  orderReceivedForRs: { x: 416.7, y: 76.9 },

  dateOfBooking: { x: 96.7, y: 36.9 },
  dealerSeal: { x: 236.7, y: 36.9 },
  authorisedSignatoryName: { x: 353.3, y: 41.9 },
};

// Fields whose value is a checkbox option ("married"/"unmarried" etc, or a
// boolean flag on the booking row) rather than free text — bookingPdf.js
// only draws these when the matching option was selected.
const CHECKBOX_GROUPS = {
  addressType: { Res: 'resCheckbox', Off: 'offCheckbox' },
  regBoardType: { White: 'whiteBoardCheckbox', Yellow: 'yellowBoardCheckbox' },
  vehicleBookedType: {
    First: 'firstPurchaseCheckbox',
    Additional: 'additionalCheckbox',
    Replacement: 'replacementCheckbox',
  },
  modeOfPurchase: {
    Cash: 'cashCheckbox',
    OwnFinance: 'ownFinanceCheckbox',
    InHouseFinance: 'inHouseFinanceCheckbox',
  },
  maritalStatus: { Married: 'marriedCheckbox', Unmarried: 'unmarriedCheckbox' },
  familyStatus: { Nuclear: 'nuclearCheckbox', Joint: 'jointCheckbox' },
  incomeGroup: {
    '2-4': 'income24Checkbox',
    '4-6': 'income46Checkbox',
    '6-8': 'income68Checkbox',
    '8-10': 'income810Checkbox',
    '10-15': 'income1015Checkbox',
    '15-20': 'income1520Checkbox',
    'Above 20': 'incomeAbove20Checkbox',
  },
};

module.exports = {
  FORM_VERSION,
  SOURCE_IMAGE,
  PAGE_WIDTH,
  PAGE_HEIGHT,
  DEFAULT_FONT_SIZE,
  FIELDS,
  CHECKBOX_GROUPS,
};
