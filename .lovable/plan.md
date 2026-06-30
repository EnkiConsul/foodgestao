# Logomarcas de bancos nas Contas Bancárias

## Objetivo
Mostrar o logo do banco junto a cada conta bancária — tanto no formulário de cadastro/edição quanto na listagem em `ContasBancarias.tsx` — usando o conector **Logo.dev** (já disponível como connector frontend, sem custo de backend).

## Como funciona
Logo.dev serve logos por domínio: `https://img.logo.dev/{dominio}?token={key}`. Vamos manter um mapa interno dos principais bancos brasileiros (Nubank, Itaú, Bradesco, Santander, Caixa, Banco do Brasil, Inter, C6, BTG, Sicoob, Sicredi, Original, Next, PicPay, Mercado Pago, Will, Neon, Pan, Safra, XP, Rico, etc.) → domínio oficial.

## Mudanças

### 1. Conectar Logo.dev
Habilitar o connector Logo.dev para obter `VITE_LOVABLE_CONNECTOR_LOGO_DEV_API_KEY`.

### 2. Persistir o banco escolhido
Adicionar coluna opcional `bank_slug TEXT` em `accounts` via migration (não obrigatório — contas existentes seguem sem logo até serem editadas).

### 3. Novo helper `src/lib/banks.ts`
- Lista `BRAZILIAN_BANKS` com `{ slug, name, domain }`.
- Função `getBankLogoUrl(slug, size?)` que monta a URL Logo.dev com fallback `monogram`.

### 4. Novo componente `src/components/accounts/BankSelect.tsx`
- `Select` (com busca via `Command`/`searchable-select`) que lista os bancos com o logo ao lado do nome.
- Opção final "Outro / Não listado" → mantém comportamento atual (sem logo).

### 5. `AccountFormDialog.tsx`
- Adicionar campo "Banco" (usando `BankSelect`) acima de "Nome da Conta".
- Ao escolher um banco, preenche `name` automaticamente se vazio e salva `bank_slug`.
- Preview do logo selecionado dentro do dialog.

### 6. `ContasBancarias.tsx`
- No card de cada conta, substituir o ícone genérico `Wallet` pelo `<img>` do logo do banco quando `bank_slug` existir; manter `Wallet` como fallback.
- Mostrar logo também no card de resumo nenhum (não aplicável — soma total).

### 7. Onboarding (`StepAccount.tsx`)
- Mesmo `BankSelect` no passo "Primeira conta" para já capturar o banco no onboarding.

## Considerações
- Logos vêm do CDN do Logo.dev (sem armazenamento no nosso bucket).
- Componente `<img>` com `loading="lazy"` e `onError` que cai no ícone `Wallet`.
- Sem alterações em lógica financeira — apenas apresentação + 1 coluna textual nova.

## Confirmar antes de implementar
1. Posso conectar o **Logo.dev** agora (sem custo, chave pública embarcada no frontend)?
2. Ok adicionar coluna `bank_slug` na tabela `accounts` (nullable, retrocompatível)?
