# Regras de src/lib

- pdfjs 6.x exige polyfills ES2025 em `src/lib/polyfills.ts`, importado primeiro no `main.tsx` — sem eles o PDF fica em branco.
