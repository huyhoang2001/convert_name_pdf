export type CopiesRandomData = {
  surnames: string[];
  middleNames: { male: string[]; female: string[] };
  firstNames: { male: string[]; female: string[] };
  descriptionOptions: string[];
  generationRules: { probabilityHint: { '2_words': number; '3_words': number } };
};

export function randomCopiesDetails(data: CopiesRandomData, random = Math.random) {
  const gender = random() < 0.5 ? 'male' : 'female';
  const middle = data.middleNames[gender], first = data.firstNames[gender];
  const length = random(), { '2_words': twoWords, '3_words': threeWords } = data.generationRules.probabilityHint;
  const name = [data.surnames[Math.floor(random() * data.surnames.length)]];
  if (length >= twoWords) {
    const firstMiddle = middle[Math.floor(random() * middle.length)];
    name.push(firstMiddle);
    if (length >= twoWords + threeWords) {
      const otherMiddles = middle.filter(value => value !== firstMiddle);
      name.push(otherMiddles[Math.floor(random() * otherMiddles.length)]);
    }
  }
  name.push(first[Math.floor(random() * first.length)]);
  return {
    customer: name.join(' ').toUpperCase(),
    description: data.descriptionOptions[Math.floor(random() * data.descriptionOptions.length)],
    quantity: '0',
    unitPrice: '0',
    manualTotal: false,
    totalAmount: ''
  };
}
