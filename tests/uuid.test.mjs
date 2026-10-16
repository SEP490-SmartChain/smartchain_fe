import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/uuid.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
});
const load = (crypto) => {
  const context = { crypto, exports: {} };
  runInNewContext(outputText, context);
  return context.exports.createUuid;
};

test('uses native randomUUID with its Crypto receiver when available', () => {
  const expected = '12345678-1234-4234-8234-123456789abc';
  const crypto = {
    randomUUID() {
      assert.equal(this, crypto);
      return expected;
    },
    getRandomValues() {
      assert.fail('native support should not need the fallback');
    },
  };
  assert.equal(load(crypto)(), expected);
});

test('HTTP-style Crypto without randomUUID generates valid distinct UUID v4 values', () => {
  const createUuid = load({
    getRandomValues: (bytes) => webcrypto.getRandomValues(bytes),
  });
  const values = Array.from({ length: 1000 }, () => createUuid());
  for (const value of values) {
    assert.match(value, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  }
  assert.equal(new Set(values).size, values.length);
});

test('fallback sets UUID version and variant for both low and high random bytes', () => {
  for (const [byte, expected] of [
    [0, '00000000-0000-4000-8000-000000000000'],
    [255, 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
  ]) {
    assert.equal(load({ getRandomValues: (bytes) => bytes.fill(byte) })(), expected);
  }
});
