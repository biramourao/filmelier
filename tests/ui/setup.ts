import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Rede proibida nos testes de UI (AC-20): fetch não simulado lança. Quem precisa de fetch o espiona no próprio teste.
beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('[filmelier-teste] rede proibida: fetch não simulado');
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
