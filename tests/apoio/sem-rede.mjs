// Preload da prova "sem rede" (design D-14): node --import ./tests/apoio/sem-rede.mjs --test tests/*.test.mjs
// Qualquer fetch que não seja injetado pelo teste lança.
globalThis.fetch = () => {
  throw new Error('[filmelier-teste] rede proibida');
};
