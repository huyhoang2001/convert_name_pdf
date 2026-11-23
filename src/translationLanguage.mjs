const conciseLanguages = new Map([
  ['viet', 'Việt'], ['vietnamese', 'Việt'],
  ['anh', 'Anh'], ['english', 'Anh'],
  ['hoa', 'Hoa'], ['trung', 'Hoa'], ['chinese', 'Hoa'],
  ['nhat', 'Nhật'], ['japanese', 'Nhật'],
  ['han', 'Hàn'], ['korean', 'Hàn'],
  ['phap', 'Pháp'], ['french', 'Pháp'],
]);

const languageKey = value => value.trim().replace(/^(?:(?:ti\u1ebfng|tieng)\s+)+/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();

export function conciseTranslationLanguage(value) {
  return conciseLanguages.get(languageKey(value)) ?? value.trim();
}

export function conciseTranslationLanguagePair(value) {
  const parts = value.split(/\s*(?:->|\u2013|\u2014|-)\s*/);
  if (parts.length !== 2) return value;
  const source = conciseLanguages.get(languageKey(parts[0]));
  const target = conciseLanguages.get(languageKey(parts[1]));
  return source && target ? `${source} - ${target}` : value;
}
