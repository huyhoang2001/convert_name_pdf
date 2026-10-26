import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomCopiesDetails } from '../src/copiesRandom.ts';

const data = JSON.parse(readFileSync(new URL('../customer_name_description_data.json', import.meta.url), 'utf8'));

test('Copies random fill builds Vietnamese names and resets the count and total draft fields', () => {
  const values = [0.1, 0.8, 0, 0, 0, 0, 0];
  const result = randomCopiesDetails(data, () => values.shift() ?? 0);
  const [surname, firstMiddle, secondMiddle, first] = result.customer.split(' ');
  assert.ok(data.surnames.includes(surname));
  assert.ok(data.middleNames.male.includes(firstMiddle));
  assert.ok(data.middleNames.male.includes(secondMiddle));
  assert.notEqual(firstMiddle, secondMiddle);
  assert.ok(data.firstNames.male.includes(first));
  assert.ok(data.descriptionOptions.includes(result.description));
  assert.equal(result.customer, result.customer.toUpperCase());
  assert.equal(result.quantity, '0');
  assert.equal(result.unitPrice, '0');
  assert.equal(result.manualTotal, false);
  assert.equal(result.totalAmount, '');
});
