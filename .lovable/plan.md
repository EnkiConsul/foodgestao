# Liberar mudanças de banco e aplicar as correções pendentes

## Onde ficam as permissões do agente

No computador:
1. Clique no nome do projeto (canto superior esquerdo) → **Settings** (Configurações).
2. Vá em **Customization** → **Connectors**.
3. Na lista, abra **Lovable Cloud**.
4. Dentro dele, role até a seção **"Manage my agent's permissions"** (Gerenciar as permissões do meu agente).
5. Nas linhas de banco de dados (consultas e migrações), troque de "Never allow" (Nunca permitir) para **"Ask each time"** ou **"Always allow"**.

No celular: modo Chat → botão `...` (canto inferior direito) → Settings → Customization → Connectors → Lovable Cloud.

Atalho no computador: Cmd+K (ou Ctrl+K) e digite "Connectors".

Observações:
- As permissões de banco ficam em **Lovable Cloud**, não na página do Supabase.
- Se as opções estiverem travadas, um administrador do workspace precisa liberar o conector.
- Alternativa: quando eu tentar a mudança, se a preferência estiver em "Ask each time", aparece um cartão de aprovação no chat com o mesmo seletor.

## O que aplico assim que a permissão estiver liberada

1. **Documentos disciplinares (segurança)** — restringir os arquivos do caminho antigo a administradores e donos da empresa; o colaborador deixa de conseguir baixar o próprio documento disciplinar por esse caminho.
2. **Integridade de exclusão de cadastros financeiros** — impedir exclusão de forma de pagamento, centro de custo, contato, categoria e conta contábil (inclusive em árvore) quando houver lançamentos vinculados, com a mesma mensagem já exibida na tela.

## Detalhes técnicos

- Item 1: recriar `dp_doc_bucket_legacy_read` em `storage.objects` acrescentando `d.tipo <> 'disciplinar'` ao ramo de autoacesso do colaborador, alinhando à política nova `dp_doc_bucket_read_autorizado`. SQL pronto em `docs/security/dp-documentos-legacy-disciplinar.sql`.
- Item 2: SQL pronto em `docs/db/integridade-exclusao-cadastros-financeiros.sql` — recria `fk_transactions_payment_method`, `fk_transactions_cost_center`, `fk_transactions_contact`, `fk_transactions_category` com `ON DELETE NO ACTION`; cria `idx_categories_chart_account_id`; cria `chart_accounts_block_delete_with_history()` (SECURITY DEFINER, `search_path = public`, CTE recursiva) e o trigger `trg_chart_accounts_block_delete`.
- Ambas com rollback comentado. Sem alteração de layout, sem publicar frontend, sem DELETE de dados reais.
