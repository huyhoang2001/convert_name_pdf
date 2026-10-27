const englishOnes = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const englishTens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const englishUnits = ['', 'thousand', 'million', 'billion', 'trillion', 'quadrillion', 'quintillion'];
const vietnameseOnes = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const vietnameseUnits = ['', 'ngàn', 'triệu', 'tỷ', 'ngàn tỷ', 'triệu tỷ', 'tỷ tỷ'];

function englishTriplet(value) {
  const words = [];
  if (value >= 100) { words.push(englishOnes[Math.floor(value / 100)], 'hundred'); value %= 100; }
  if (value >= 20) { words.push(englishTens[Math.floor(value / 10)]); value %= 10; }
  if (value) words.push(englishOnes[value]);
  return words.join(' ');
}

function vietnameseTriplet(value, hasHigherGroup) {
  const hundreds = Math.floor(value / 100), tens = Math.floor(value % 100 / 10), ones = value % 10;
  const words = [];
  if (hundreds || (hasHigherGroup && value < 100)) words.push(vietnameseOnes[hundreds], 'trăm');
  if (tens > 1) words.push(vietnameseOnes[tens], 'mươi');
  else if (tens === 1) words.push('mười');
  else if (ones && (hundreds || hasHigherGroup)) words.push('lẻ');
  if (ones) words.push(tens > 1 && ones === 1 ? 'mốt' : tens >= 1 && ones === 5 ? 'lăm' : tens > 1 && ones === 4 ? 'tư' : vietnameseOnes[ones]);
  return words.join(' ');
}

export function amountInWords(value, language = 'VI') {
  const amount = BigInt(value);
  if (amount < 0n) throw RangeError('Amount must be non-negative.');
  if (amount === 0n) return language === 'EN' ? 'Zero VND' : 'Không đồng';
  const groups = [];
  for (let remaining = amount; remaining > 0n; remaining /= 1000n) groups.push(Number(remaining % 1000n));
  const units = language === 'EN' ? englishUnits : vietnameseUnits;
  if (groups.length > units.length) throw RangeError('Amount is too large.');
  const words = [];
  for (let index = groups.length - 1; index >= 0; index--) {
    if (!groups[index]) continue;
    const group = language === 'EN' ? englishTriplet(groups[index]) : vietnameseTriplet(groups[index], groups.slice(index + 1).some(Boolean));
    words.push([group, units[index]].filter(Boolean).join(' '));
  }
  const result = words.join(' ');
  return `${result[0].toLocaleUpperCase(language === 'EN' ? 'en' : 'vi')}${result.slice(1)} ${language === 'EN' ? 'VND' : 'đồng'}`;
}
