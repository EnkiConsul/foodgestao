# Corrigir visibilidade das categorias por empresa

Ao editar uma categoria e desmarcar uma empresa, a categoria desaparece também das empresas que continuaram marcadas.

## Causa confirmada

Ao salvar, o sistema apaga **todos** os vínculos da categoria com empresas e tenta recriar os marcados. A regra de segurança do banco só permite recriar o vínculo quando a categoria pertence ao próprio usuário que está salvando. Hoje existem 185 categorias cujo dono é outro usuário — nesses casos a recriação é recusada, o erro é ignorado pela tela e a categoria fica sem nenhuma empresa, ou seja, desaparece de todas.

## O que será corrigido

- Salvar apenas a diferença: remover somente as empresas desmarcadas e adicionar somente as recém-marcadas. Nada é apagado sem necessidade.
- Permitir que qualquer pessoa com permissão de editar categorias da empresa crie o vínculo, mesmo que a categoria tenha sido criada por outro usuário da mesma empresa.
- Mostrar aviso claro de erro e não fechar a janela quando a gravação falhar, em vez de dar "salvo" e perder a visibilidade.
- Mesma correção na alteração de visibilidade em lote (várias categorias selecionadas).
- Restaurar os vínculos perdidos pelas categorias que ficaram sem nenhuma empresa por causa desse comportamento, quando o histórico permitir identificar a empresa de origem.

## Detalhes técnicos

1. Migração de RLS em `public.category_companies`: substituir a condição `c.user_id = auth.uid()` do `category_companies_insert_policy` por checagem de contexto (`context is null or 'pj'`) + `private.can_edit_company_module(auth.uid(), company_id, 'categories')`, mantendo o bloqueio de categorias PF.
2. `src/components/categories/CategoryFormDialog.tsx`: trocar o `delete` total + `insert` por diff (`delete ... in (removidas)` e `insert (adicionadas)`), verificar `error` em cada chamada, `toast.error` e abortar o fechamento em caso de falha.
3. `src/pages/Categorias.tsx` (visibilidade em lote): mesmo diff por categoria e tratamento de erro; hoje também apaga tudo antes de inserir.
4. Recuperação de dados: consulta às categorias PJ sem nenhuma linha em `category_companies` e reinserção via `audit_logs`/empresa do dono quando houver correspondência segura; as sem correspondência ficam listadas para o usuário reassociar manualmente.
5. Testes: caso de unidade do diff de visibilidade e teste de RLS confirmando que um editor da empresa que não é dono da categoria consegue inserir o vínculo.
