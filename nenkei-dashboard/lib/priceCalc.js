// Shared total/net-amount math, used by both the Quote and Booking builders
// so the numbers never drift between the two documents.
function toNumber(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// The "on road price" line items shared by quotes and the booking form's
// particulars 1-9.
function computeTotalOnRoadPrice(fields) {
  return (
    toNumber(fields.vehicleCost) +
    toNumber(fields.toyotaProtect) +
    toNumber(fields.registrationRoadTax) +
    toNumber(fields.tga) +
    toNumber(fields.smilesCoating) +
    toNumber(fields.extendedWarranty) +
    toNumber(fields.other1Amount) +
    toNumber(fields.other2Amount) +
    toNumber(fields.other3Amount)
  );
}

function computeNetAmountPayable(totalOnRoadPrice, fields) {
  return (
    toNumber(totalOnRoadPrice) -
    toNumber(fields.otherDeduction) -
    toNumber(fields.usedCarProcurementPrice) -
    toNumber(fields.discountOffered ?? fields.totalDiscountScheme)
  );
}

module.exports = { toNumber, computeTotalOnRoadPrice, computeNetAmountPayable };
