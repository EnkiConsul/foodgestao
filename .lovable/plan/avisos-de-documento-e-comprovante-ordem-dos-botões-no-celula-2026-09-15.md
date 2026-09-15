# Avisos de documento e comprovante + ordem dos botões no celular

## 1. Aviso detalhado para o colaborador

Hoje o colaborador não recebe nenhum aviso quando a empresa importa um documento; ele precisa entrar na tela de documentos para descobrir. Passa a receber:

**Documento novo** (um aviso por documento, com detalhe):
- Título: "Novo documento disponível"
- Detalhe: tipo, competência e o que fazer, por exemplo
  "Contracheque · Competência 09/2026. Toque para visualizar."
- Quando o documento pede ciência: "... Precisa da sua confirmação de recebimento."
- Abrir o aviso leva direto aos Meus Documentos.

**Comprovante de pagamento** (aviso próprio, sempre):
- Título: "Comprovante de pagamento disponível"
- Detalhe: "Adiantamento Salarial · Competência 09/2026" mais a data do pagamento quando informada.
- Vale tanto para o comprovante anexado junto com o documento como dias depois; substituir o comprovante gera um novo aviso ("Comprovante de pagamento atualizado").

Regras:
- Só avisa o próprio titular do documento, e só quando ele já tem acesso ao portal.
- Documento enviado pelo próprio colaborador não gera aviso para ele.
- Documento disciplinar continua fora do portal e não gera aviso.
- Documento arquivado ou excluído não gera aviso; substituição de documento avisa como documento novo.
- Cada documento/comprovante avisa uma única vez, mesmo que a importação seja repetida.

## 2. Botões no celular na ordem pedida

```text
[ Visualizar ]   [ Comprovante ]   [ Baixar ]
[ Excluir ]      [ Substituir ................ ]
```

- Primeira linha: Visualizar, Comprovante, Baixar. Segunda linha: Excluir e Substituir (Substituir ocupando as duas colunas restantes).
- Documento que não é de pagamento fica sem o botão do meio, e as duas linhas se mantêm.
- Desktop segue igual.

## Detalhes técnicos

- Migration nova: valores `documento_novo` e `comprovante_pagamento` no enum `dp_notificacao_tipo`; função `dp_documento_notificar()` (SECURITY DEFINER, `search_path='public'`, sem EXECUTE para anon/authenticated) e trigger `AFTER INSERT OR UPDATE` em `dp_documentos`.
  - Insere em `dp_notificacoes` com `user_id` do colaborador, `ref_table='dp_documentos'`, `ref_id` do documento e `chave` (`doc:<id>` / `comprovante:<id>:<path>`), usando `ON CONFLICT (chave) DO NOTHING` para idempotência.
  - Dispara na inserção quando `ciclo_status='ativo'`, `tipo <> 'disciplinar'`, `submetido_por_colaborador = false`, `aprovacao_status` não recusado e o colaborador tem `user_id`; e no update quando `comprovante_file_path IS DISTINCT FROM` o anterior e não é nulo.
  - Rótulo do tipo resolvido por `CASE` no SQL, alinhado a `DP_DOC_TIPOS` (frontend segue a fonte única para exibição).
- `src/lib/dp/notificacoes.ts`: sem mudança de rota (`dp_documentos` já aponta para `/dp/meu/documentos`).
- `src/pages/dp/DpHistoricoCompleto.tsx`: reordenar o bloco mobile (Visualizar, Comprovante, Baixar, Excluir, Substituir com `col-span-2`).
- Testes: unitário do rótulo/ordem dos botões e teste SQL isolado do gatilho (documento novo, comprovante depois, disciplinar e envio do colaborador sem aviso, reimportação sem duplicar), validado no clone descartável antes de aplicar.
