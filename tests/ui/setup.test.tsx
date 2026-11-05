import { expect, test } from 'vitest';

test('AC-20: fetch não simulado lança "[filmelier-teste] rede proibida"', () => {
  expect(() => fetch('https://exemplo.test/')).toThrow('[filmelier-teste] rede proibida');
});

test('AC-20: o ambiente de teste é jsdom', () => {
  expect(document.createElement('div').ownerDocument).toBe(document);
});
