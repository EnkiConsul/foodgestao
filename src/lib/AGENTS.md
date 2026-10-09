# Regras de src/lib

- pdfjs 6.x exige polyfills ES2025 em `src/lib/polyfills.ts`, importado primeiro no `main.tsx` — sem eles o PDF fica em branco.
- Backoffice Cliente 360 (`src/lib/admin/cliente360.ts`): cliente = conta de cobrança de produção, não teste, não interna (`is_internal`, marcada só por `admin_cliente360_marcar_interna`) e com empresa ativa; colaborador do portal nunca é cliente nem lead — métricas leem a mesma regra da tela.
