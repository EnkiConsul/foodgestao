# Testes de Tenancy (Bloco I)

Testes end-to-end que validam o isolamento multiempresa contra um **ambiente
Supabase de teste dedicado**. Rodam apenas quando as variáveis abaixo estão
definidas; caso contrário são pulados com `describe.skip`.

## Variáveis necessárias

| Variável | Descrição |
|----------|-----------|
| `TEST_SUPABASE_URL` | URL do projeto de testes |
| `TEST_SUPABASE_ANON_KEY` | Anon key do projeto de testes |
| `TEST_USER_A_EMAIL` / `TEST_USER_A_PASSWORD` | Owner da Empresa 1 |
| `TEST_USER_B_EMAIL` / `TEST_USER_B_PASSWORD` | Member da Empresa 1 (edit) |
| `TEST_USER_C_EMAIL` / `TEST_USER_C_PASSWORD` | Viewer da Empresa 1 (view-only) |
| `TEST_USER_D_EMAIL` / `TEST_USER_D_PASSWORD` | Owner da Empresa 2 (deve estar isolado) |
| `TEST_COMPANY_1_ID` | UUID da Empresa 1 (A/B/C são membros) |
| `TEST_COMPANY_2_ID` | UUID da Empresa 2 (somente D) |

## Cobertura (Etapa 13)

- Isolamento entre Empresa 1 e Empresa 2 em `transactions`, `budgets`,
  `categories` e `contacts`.
- Colaboração PJ: B enxerga o que A criou (mesma empresa).
- Viewer C não consegue INSERT/UPDATE/DELETE em módulos financeiros.
- Cross-tenant transfer: UPDATE que troque `company_id` para a Empresa 2
  falha por trigger `prevent_company_id_transfer` mesmo para o owner A.

## Como rodar

```bash
TEST_SUPABASE_URL=... TEST_SUPABASE_ANON_KEY=... \
TEST_USER_A_EMAIL=... TEST_USER_A_PASSWORD=... \
... \
bunx vitest run src/test/tenancy
```
