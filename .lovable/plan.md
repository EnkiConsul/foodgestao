
# Integração de consulta de CNPJ via BrasilAPI

A Receita Federal não expõe uma API pública oficial. Usaremos a **BrasilAPI** (`https://brasilapi.com.br/api/cnpj/v1/{cnpj}`), que é gratuita, sem cadastro nem chave, e devolve os dados oficiais da Receita (razão social, fantasia, endereço, telefone, e-mail, situação cadastral, CNAE, etc.).

## O que será entregue

1. **Botão "Buscar CNPJ"** no campo CNPJ dos formulários:
   - `CompanyFormDialog` (Perfil Empresarial)
   - `ContactFormDialog` (Contatos PJ)
2. Ao clicar (ou ao completar 14 dígitos + blur), o sistema consulta o CNPJ e **preenche automaticamente**: Razão Social, Nome Fantasia, E-mail, Telefone, Endereço (logradouro, número, complemento, bairro, município, UF, CEP).
3. Máscara `00.000.000/0000-00` já é aplicada, validação de dígito verificador via `isValidCnpj` já existente.
4. Feedback visual: spinner no botão, toast de sucesso/erro, mensagens claras ("CNPJ não encontrado", "CNPJ inválido", "Falha de conexão").

## Como funciona (técnico)

- **Edge Function `lookup-cnpj`** (Lovable Cloud) atua como proxy para a BrasilAPI. Motivo:
  - Evita problemas de CORS.
  - Permite cache futuro e rate-limit por usuário.
  - Exige JWT válido (`verify_jwt = true`) para impedir uso anônimo.
- Entrada: `{ cnpj: string }` (aceita com ou sem máscara). Saída normalizada:
  ```
  { razao_social, nome_fantasia, email, telefone, endereco_formatado,
    logradouro, numero, complemento, bairro, municipio, uf, cep, situacao }
  ```
- **Hook `useCnpjLookup`** encapsula a chamada com React Query (`useMutation`) e trata erros.
- **Componente `CnpjInput`** reutilizável: input com máscara + botão de busca (ícone `Search`) + estado de loading.

## Arquivos a criar/editar

| Arquivo | Ação |
|---|---|
| `supabase/functions/lookup-cnpj/index.ts` | Criar edge function (proxy + validação Zod) |
| `src/hooks/useCnpjLookup.tsx` | Criar hook |
| `src/components/shared/CnpjInput.tsx` | Criar input reutilizável |
| `src/components/companies/CompanyFormDialog.tsx` | Substituir input CNPJ por `CnpjInput` e aplicar preenchimento |
| `src/components/contacts/ContactFormDialog.tsx` | Idem para contatos PJ |

## Fora do escopo

- Consulta de QSA (sócios) — a BrasilAPI retorna, mas não temos campo hoje.
- Consulta em lote / atualização em massa de cadastros existentes.
- Uso no Onboarding (você não marcou; podemos adicionar depois).
- CPF (a Receita não permite consulta pública de CPF por API).
