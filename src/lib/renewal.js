export function calculateRenewalDate(purchaseDate, monthsToAdd) {
  const date = new Date(purchaseDate);
  const day = date.getDate();

  if (day === 31) {
    date.setDate(1);
    date.setMonth(date.getMonth() + 1);
  }

  date.setMonth(date.getMonth() + monthsToAdd);
  return date;
}

export function parsePrice(priceStr) {
  if (!priceStr) return 0;
  const match = String(priceStr).match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : 0;
}

export function parseDurationMonths(durationStr) {
  if (!durationStr) return 1;
  const match = String(durationStr).match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

export function computeExtendedRenewalDate(renewalDate, monthsToAdd = 1, now = new Date()) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  let baseDate = today;
  if (renewalDate) {
    const currentRenewal = new Date(renewalDate);
    currentRenewal.setHours(0, 0, 0, 0);
    if (currentRenewal > today) {
      baseDate = currentRenewal;
    }
  }

  return calculateRenewalDate(baseDate, Number(monthsToAdd) || 1).toISOString().substring(0, 10);
}
