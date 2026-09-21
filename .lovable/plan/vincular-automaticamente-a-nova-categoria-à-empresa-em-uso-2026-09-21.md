# Vincular automaticamente a nova categoria à empresa em uso

Hoje, ao criar uma categoria, a tela decide a empresa a partir da lista de empresas das quais a pessoa é dona — não da empresa selecionada no topo do sistema. Quando essa lista chega depois da abertura da janela, ou quando a pessoa apenas participa da empresa sem ser dona, a categoria é salva sem nenhuma ligação com a empresa e ainda aparece o aviso "Categoria criada!". A categoria existe no banco, mas não aparece na lista.

## O que muda

- A empresa em uso (a do seletor no topo) passa a ser sempre vinculada à nova categoria, automaticamente, sem depender de marcação manual.
- A lista de empresas da janela passa a ser a das empresas que a pessoa realmente acessa, não só as que ela possui.
- Se a ligação com a empresa falhar, a janela não fecha e aparece um aviso de erro claro — nunca mais "sucesso" com categoria invisível.
- A mesma regra vale para edição, para a alteração de visibilidade em lote e para os demais cadastros que usam o mesmo padrão de vínculo por empresa (formas de pagamento, centros de custo, contatos), para o problema não reaparecer em outra tela.
- A empresa em uso fica marcada e não pode ser desmarcada por acidente na criação; continuar sendo possível acrescentar outras empresas.

## Detalhes técnicos

1. `src/components/categories/CategoryFormDialog.tsx`
   - trocar a consulta `["companies-for-category", user.id]` (`.eq("user_id", user.id)`) por `useCompanyContext().companies`;
   - incluir `companies` e `selectedCompanyId` nas dependências do efeito de inicialização, semeando `selectedCompanies` com `selectedCompanyId` quando o contexto é PJ, sem sobrescrever escolha manual já feita;
   - na criação, chamar `syncCategoryCompanies` sempre que o contexto for PJ (remover a guarda `selectedCompanies.size > 0`), garantindo `selectedCompanyId` no conjunto;
   - verificar o retorno de `syncCategoryCompanies`: em erro, `toast.error` e não fechar nem emitir sucesso.
2. `src/lib/categories/visibility.ts` — manter o diff, mas expor helper `garantirEmpresaAtiva(desejado, selectedCompanyId)` reaproveitável pelas outras telas.
3. `src/pages/Categorias.tsx` — visibilidade em lote: tratar erro por categoria e não permitir remover a empresa ativa deixando a categoria órfã.
4. Aplicar o mesmo saneamento de vínculo e tratamento de erro em `PaymentMethodFormDialog.tsx`, `CostCenterFormDialog.tsx` e no cadastro de contatos (tabelas `payment_method_companies`, `cost_center_companies`, `contact_companies`).
5. Testes: atualizar `src/test/unit/categoriaVinculoEmpresa.test.tsx` para exigir o vínculo com a empresa ativa nos três cenários (membro não dono, corrida de carregamento, falha de gravação sem sucesso falso).

## Fora deste escopo

Nenhuma migração de banco e nenhuma associação automática das 56 categorias raiz já existentes sem vínculo — isso exige autorização separada, com a lista revisada por empresa.
