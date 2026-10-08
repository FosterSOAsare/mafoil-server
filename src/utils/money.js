// Rounds a monetary amount to 2 decimal places
const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;

// True for a finite number greater than 0 (rejects NaN, Infinity, 0 and negatives)
const isPositiveAmount = (amount) => typeof amount === "number" && Number.isFinite(amount) && amount > 0;

module.exports = { roundMoney, isPositiveAmount };
