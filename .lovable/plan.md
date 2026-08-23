# Plano: Botão "Salvar Larguras" como padrão global

## Objetivo
Substituir o botão temporário "Copiar Larguras" (apenas super admin, exporta JSON para área de transferência) por um botão definitivo **"Salvar Larguras"** que persiste a ordem e as larguras atuais das colunas como **padrão global do sistema**, aplicando a todas as empresas e usuários.

## Escopo confirmado
- Padrão **global do sistema** (super admin apenas).
- Salva **ordem + larguras** das colunas.
- Aplica inicialmente às telas: **Colaboradores** e **Histórico de Documentos**.

## Alterações técnicas

### 1. Banco de dados
Criar a tabela `app_table_layouts` para armazenar o layout padrão por tela:
- `screen_key` (texto, PK ou unique): identificador da tela, ex.: `dp_colaboradores`, `dp_historico_documentos`.
- `column_order` (jsonb): array com a ordem das colunas.
- `column_widths` (jsonb): objeto com as larguras por coluna.
- `updated_at`, `created_at`.
- RLS: leitura pública para `authenticated` (todo usuário precisa aplicar o padrão), escrita restrita a `super_admin` via função `private.is_super_admin`.
- GRANTs padrão para `authenticated` e `service_role`.

### 2. Hook `useDpTableColumns`
Alterar a inicialização do estado para:
1. Consultar o layout salvo no banco para a `screen_key`.
2. Se existir, usar `column_order` e `column_widths` do banco.
3. Se não existir, fallback para o `localStorage` (permitindo personalização por usuário).
4. Se nada existir, usar os defaults do código.

Adicionar uma função `applySystemDefault(layout)` para forçar a aplicação do padrão salvo, e manter o `localStorage` como camada de override pessoal.

### 3. Componente `DpSalvarLargurasButton`
Substituir `DpCopyColWidthsButton.tsx` por `DpSalvarLargurasButton.tsx`:
- Visível apenas para super admin.
- Ícone `Save` + rótulo "Salvar Larguras".
- Ao clicar, faz `upsert` na tabela `app_table_layouts` com a ordem e larguras atuais.
- Feedback via toast: "Layout padrão salvo".

### 4. Telas afetadas
- `src/pages/dp/DpColaboradores.tsx`: trocar `DpCopyColWidthsButton` por `DpSalvarLargurasButton`, passando `screen_key="dp_colaboradores"`.
- `src/pages/dp/DpHistoricoCompleto.tsx`: trocar `DpCopyColWidthsButton` por `DpSalvarLargurasButton`, passando `screen_key="dp_historico_documentos"`.

### 5. Defaults no código
Após o usuário salvar o layout desejado no preview e validarmos, atualizar as constantes `DEFAULT_COLAB_COL_WIDTHS` / `DEFAULT_COL_ORDER` e `DEFAULT_COL_WIDTHS` / `DEFAULT_COL_ORDER` no código-fonte para refletir o novo padrão, garantindo que novas empresas/usuários recebam o mesmo layout mesmo sem registro no banco.

### 6. Remoção de código temporário
Remover completamente o componente `DpCopyColWidthsButton.tsx` e todas as suas importações.

## Critérios de aceitação
- Super admin vê o botão "Salvar Larguras" no cabeçalho das duas telas.
- Ao clicar, o layout atual (ordem + larguras) vira padrão global.
- Usuários comuns não veem o botão.
- Novos usuários/empresas passam a receber o novo layout padrão.
- O `localStorage` ainda permite ajustes pessoais, mas o default inicial vem do banco/código.

## Riscos e cuidados
- O hook `useDpTableColumns` é usado em outras telas; a alteração deve ser genérica e não quebrar telas sem layout salvo.
- É necessário garantir que a leitura do layout global seja rápida (cache via React Query) para não atrasar a renderização da tabela.
- A política RLS deve permitir leitura a todos os `authenticated`, mas escrita apenas a super admins.
