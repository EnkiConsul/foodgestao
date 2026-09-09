# Rolagem automática para o banner de salvamento ao aprovar documentos

## O que muda

Ao clicar em **Aprovar e Salvar documentos** na revisão de importação, a tela rola para a área que mostra o progresso do salvamento. Assim o usuário sabe que a ação entrou em processamento, especialmente no celular, onde o botão fica na parte inferior e o banner aparece mais acima.

## Escopo

Aplica-se a **ambos os modos de revisão**:
- Revisão inline (dentro da lista de lotes, `BulkReviewInline`).
- Revisão em tela cheia (`BulkReviewDialog`).

## Detalhes técnicos

- Adicionar uma referência (`savingBannerRef`) ao container do `BulkProgressBanner` de salvamento (`phase="saving"`) em `src/components/dp/documentos/BulkReviewInline.tsx` e em `src/components/dp/documentos/BulkReviewDialog.tsx`.
- Criar/reaproveitar um helper de rolagem suave (`scrollIntoView({ behavior: "smooth", block: "start" })`) quando o salvamento começa.
- Disparar a rolagem **uma única vez** no início do `runApprove`, logo após `setIsSaving(true)`.
- Se o usuário rolar manualmente durante o salvamento, o sistema não insiste em levar a tela de volta (mesmo comportamento do envio de PDF).
- Manter o layout atual: o banner continua aparecendo no lugar dele, acima do conteúdo de revisão no inline e centralizado no diálogo.
- Não envolve banco, RLS, permissões, edge functions ou regras de negócio.

## Verificação

- Typecheck e suíte de testes de DP.
- Conferência visual em 360 px e 1280 px:
  - Abrir a revisão inline de um lote pronto;
  - Clicar em "Aprovar e Salvar";
  - Confirmar que a tela sobe e o banner "Salvando documentos" fica visível.
- Repetir na revisão em tela cheia.
