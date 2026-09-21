import "@testing-library/jest-dom";

// As suítes de integração devem receber o banco de homologação explicitamente.
// Referências antigas à produção falham antes de qualquer requisição HTTP.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (new URL(raw, "http://localhost").hostname === "grtxmbffgmgnkawlvqhm.supabase.co") {
    return Promise.reject(new Error("Teste bloqueado: chamadas ao Supabase de produção são proibidas."));
  }
  return originalFetch(input, init);
};

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
