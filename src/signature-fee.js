export const canEnterSignatureFee = (value, development) => /^\d*$/.test(value) && (development || value === '' || Number(value) <= 9999);
