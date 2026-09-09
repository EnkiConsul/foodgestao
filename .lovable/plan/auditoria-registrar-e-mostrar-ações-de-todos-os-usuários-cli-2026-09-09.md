# Auditoria: registrar e mostrar ações de todos os usuários, clientes e empresas

## O que verifiquei agora

- A auditoria tem 771 registros, de apenas 13 usuários (o sistema tem 32 cadastros). O registro mais antigo é de fevereiro/2026.
- Os registros automáticos por tabela (colaboradores, cargos, unidades, documentos, férias, folgas, escalas, convites, membros, módulos, cartões, orçamentos, etc.) só passaram a existir hoje às 19:01. As movimentações de hoje mais cedo (documentos às 15:49, colaboradores às 17:09) aconteceram antes disso e por isso não têm registro.
- O registro automático ignora qualquer alteração feita pelo servidor (importações, rotinas, funções internas): quando não há usuário logado na conexão, ele simplesmente não grava nada. Boa parte das gravações de Pessoas 360° passa por essas rotinas, então essas ações ficam invisíveis.
- A empresa envolvida não é uma informação própria do registro: ela vai escondida dentro dos detalhes. Por isso a tela não consegue mostrar nem filtrar por empresa/cliente.
- Entradas no sistema só são gravadas quando o usuário faz login de fato; quando a sessão é retomada (voltar ao sistema já logado) nada é gravado.
- Várias áreas ainda não têm registro automático: lançamentos, contas, categorias, contatos, assinaturas e faturas, ponto, folha, convocações de ficha, pendências, ocorrências, benefícios, dependentes.

## O que vou fazer

1. **Gravar quem fez, mesmo quando a ação vem do servidor**
   - As rotinas do servidor passam a identificar o responsável (quando existir) e, quando for rotina automática, gravam como "Sistema / Importação" em vez de não gravar nada.

2. **Passar a registrar a empresa (cliente) em cada ação**
   - Nova informação de empresa no próprio registro, preenchida automaticamente pela tabela alterada ou pelo colaborador/unidade envolvidos.
   - Preencher a empresa nos registros antigos onde ela já está guardada nos detalhes.

3. **Ampliar a cobertura para todas as áreas relevantes**
   - Registro automático também em: lançamentos, contas bancárias, cartões, categorias, contatos, formas de pagamento, assinaturas e faturas, ponto e ajustes, folha, benefícios, dependentes, ocorrências, convocações, pendências e configurações de Pessoas 360°.
   - Evitar ruído: alterações apenas de campos técnicos continuam fora do registro.

4. **Registrar acessos de forma confiável**
   - Registrar também a retomada de sessão, além de login, logout e troca de senha, sem duplicar o mesmo acesso na mesma sessão.

5. **Tela de Auditoria**
   - Novas colunas e filtros de **Empresa/Cliente** e de **Origem** (usuário ou sistema).
   - Filtro de usuário passa a listar todos os cadastros do sistema, não só quem já tem registro.
   - Resumo no topo: total de ações, usuários distintos e empresas no período filtrado.
   - Exportação em planilha do resultado filtrado.
   - Aviso claro de que o histórico começa na data em que cada área passou a ser registrada.

## Detalhes técnicos

- `public.audit_logs`: adicionar `company_id uuid` (indexado, junto com `created_at` e `user_id`) e `actor_kind text` (`user` | `system`); backfill de `company_id` a partir de `details->>'company_id'`.
- `public.audit_row_change()`: remover o `RETURN` antecipado quando `auth.uid()` é nulo; nesse caso gravar `actor_kind='system'`; resolver `company_id` por `company_id`/`empresa_id` da linha, senão via `dp_colaboradores`/`dp_unidades`; manter `SECURITY DEFINER` e `search_path` fixo.
- Novas triggers `trg_audit_<tabela>` reutilizando a mesma função; lista de campos ignorados ampliada (`updated_at`, `created_at`, campos de sincronização/saldo).
- `insert_audit_log`: aceitar `_company_id` opcional; `src/lib/audit.ts` passa a empresa do contexto ativo.
- `src/hooks/useAuth.tsx`: registrar `INITIAL_SESSION` como acesso, com marca em `sessionStorage` para não repetir.
- `src/components/admin/AdminAuditLogs.tsx`: colunas/filtros de empresa e origem, contadores via `count: 'exact'`, lista de usuários vinda de `profiles`, exportação CSV (UTF-8 com BOM, ponto e vírgula).
- Sem alteração de RLS: leitura segue restrita a super admin.
