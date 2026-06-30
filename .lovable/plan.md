## Problema

Os logos não aparecem porque as contas exibidas (BMG, NEON, Nubank, Mercado Pago, Santander, SuitPay…) foram criadas **antes** do campo `bank_slug` existir, então estão com `bank_slug = null`. O `BankLogo` cai no fallback (ícone "Wallet" cinza) sempre que o slug é nulo.

## Solução (2 camadas)

### 1. Detecção automática pelo nome da conta (frontend, imediato)

Estender `src/lib/banks.ts` com um helper `inferBankSlug(name, banks)` que faz matching case-insensitive do nome da conta contra `bank.name` e `bank.slug` (ex.: "Nubank - Michelle" → slug `nubank`, "Santander Raptor" → `santander`, "Mercado Pago - Michelle" → `mercado-pago`). Usa a maior correspondência (longest match) para evitar conflitos.

Atualizar `BankLogo` para aceitar um prop opcional `fallbackName?: string`. Quando `slug` não resolve, tenta `inferBankSlug(fallbackName, banks)` antes de cair no ícone Wallet.

Em `ContasBancarias.tsx` passar `fallbackName={a.name}` para o `<BankLogo>`. Mesmo tratamento no `BankSelect` quando aplicável (sem mudar comportamento de seleção).

### 2. Backfill persistente (migração SQL)

Migração que faz `UPDATE public.accounts SET bank_slug = b.slug FROM public.banks b WHERE accounts.bank_slug IS NULL AND accounts.name ILIKE '%' || b.name || '%'` — usando subselect com `ORDER BY length(b.name) DESC LIMIT 1` para pegar o match mais específico por conta. Não toca em contas que já têm slug.

Assim, contas antigas passam a ter `bank_slug` correto e novas edições/exports ficam consistentes; a camada 1 cobre qualquer conta que o backfill não consiga inferir (nomes muito customizados).

## Detalhes técnicos

- `inferBankSlug` normaliza (lowercase, remove acentos, colapsa espaços/hífens) antes de comparar.
- Backfill roda dentro de um único `DO $$` para iterar por conta com segurança e fazer match longest-first.
- Nenhuma mudança de RLS / schema; apenas `UPDATE` data + helper TS.
- Sem mudança em `AccountFormDialog` (já salva `bank_slug`).

## Arquivos afetados

- `src/lib/banks.ts` — novo `inferBankSlug`.
- `src/components/accounts/BankLogo.tsx` — prop `fallbackName`, lógica de inferência.
- `src/pages/ContasBancarias.tsx` — passar `fallbackName={a.name}`.
- `supabase/migrations/<novo>.sql` — backfill de `accounts.bank_slug`.
