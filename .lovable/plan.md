# Liberar mudanças de banco e aplicar as correções pendentes

## Como liberar a permissão

1. Abra as configurações de conectores (botão abaixo do plano).
2. Entre em **Lovable Cloud** e vá em "Gerenciar as permissões do meu agente".
3. Nas linhas de banco de dados (consultas e migrações), troque de "Nunca permitir" para **"Perguntar sempre"** ou **"Sempre permitir"**.

Observação: as permissões de banco ficam em Lovable Cloud, não na página do Supabase. Se a opção estiver travada, um administrador do workspace precisa liberar.

## O que aplico assim que a permissão estiver liberada

1. **Documentos disciplinares (segurança)** — restringir os arquivos do caminho antigo a administradores e donos da empresa; o colaborador deixa de conseguir baixar o próprio documento disciplinar por esse caminho.
2. **Integridade de exclusão de cadastros financeiros** — script já pronto: impedir exclusão de forma de pagamento, centro de custo, contato, categoria e conta contábil (inclusive em árvore) quando houver lançamentos vinculados, com a mesma mensagem já exibida na tela.

## Detalhes técnicos

- Item 1: recriar as políticas de leitura em `storage.objects` para os caminhos de documentos disciplinares, exigindo papel admin/owner da empresa dona do arquivo.
- Item 2: SQL em `docs/db/integridade-exclusao-cadastros-financeiros.sql` — recria `fk_transactions_payment_method`, `fk_transactions_cost_center`, `fk_transactions_contact`, `fk_transactions_category` com `ON DELETE NO ACTION`; cria `idx_categories_chart_account_id`; cria `chart_accounts_block_delete_with_history()` (SECURITY DEFINER, `search_path = public`, CTE recursiva) e o trigger `trg_chart_accounts_block_delete`.
- Ambas as migrações com rollback comentado. Sem alteração de layout, sem publicar frontend, sem DELETE de dados reais.

<presentation-actions>
<presentation-open-connectors>Abrir configurações de conectores</presentation-open-connectors>
</presentation-actions>
