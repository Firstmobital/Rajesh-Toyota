const { computeTotalOnRoadPrice, computeNetAmountPayable } = require('./priceCalc');

// Pure mapping function, unit-testable without touching Sheets: given a
// Quote row, returns the subset of a Booking row that can be pre-filled.
// Everything staff must capture in person on the booking form (CTDMS
// numbers, registration type, mode of purchase, PAN/occupation, DOB/family/
// income block, payment instrument, signatures, dealer order-received
// block) is intentionally left out so it stays blank on the digital form.
function mapQuoteToBookingDraft(quote) {
  const priceFields = {
    vehicleCost: quote.vehicleCost,
    toyotaProtect: quote.toyotaProtect,
    registrationRoadTax: quote.registrationRoadTax,
    tga: quote.tga,
    smilesCoating: quote.smilesCoating,
    extendedWarranty: quote.extendedWarranty,
    other1Amount: quote.other1Amount,
    other2Amount: quote.other2Amount,
    other3Amount: quote.other3Amount,
  };

  const totalOnRoadPrice = computeTotalOnRoadPrice(priceFields);
  const netAmountPayable = computeNetAmountPayable(totalOnRoadPrice, {
    discountOffered: quote.discountOffered,
  });

  return {
    linkedQuoteId: quote.id,
    status: 'draft',

    model: quote.model,
    color: quote.color,
    suffix: quote.suffix,
    fuelType: quote.fuelType,

    customerName: quote.customerName,
    commAddress: quote.customerAddress,
    phoneNo: quote.customerPhone,
    mobNo: quote.customerPhone,
    emailId: quote.customerEmail,

    p1VehicleCost: quote.vehicleCost,
    p2ToyotaProtect: quote.toyotaProtect,
    p3RegistrationRoadTax: quote.registrationRoadTax,
    p4Tga: quote.tga,
    p5SmilesCoating: quote.smilesCoating,
    p6ExtendedWarranty: quote.extendedWarranty,
    p7OtherLabel: quote.other1Label,
    p7OtherAmount: quote.other1Amount,
    p8OtherLabel: quote.other2Label,
    p8OtherAmount: quote.other2Amount,
    p9OtherLabel: quote.other3Label,
    p9OtherAmount: quote.other3Amount,

    totalOnRoadPriceBooking: totalOnRoadPrice,
    p15TotalDiscountScheme: quote.discountOffered,
    netAmountPayable,

    indivCustomerName: quote.customerName,
  };
}

module.exports = { mapQuoteToBookingDraft };
