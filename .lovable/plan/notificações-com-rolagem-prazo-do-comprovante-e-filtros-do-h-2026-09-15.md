# Notificações com rolagem, prazo do comprovante e filtros do histórico no celular

Três ajustes independentes, sem mudar o produto nem o visual das telas.

## 1. Sininho de notificações com rolagem

Hoje a lista abre com altura limitada e só mostra as 15 primeiras, sem barra de rolagem funcional — o restante fica inacessível sem abrir a tela "Ver todas".

- A lista passa a rolar de verdade dentro do popover, com altura máxima confortável (menor no celular).
- Mostra todas as notificações carregadas, não apenas as 15 primeiras.
- Não lidas continuam destacadas e o aviso de atestados segue fixo no topo.

## 2. Atraso do comprovante de pagamento

O prazo do comprovante hoje conta a partir da competência do documento (01/09), então um adiantamento pago dia 15 aparece atrasado antes mesmo do pagamento acontecer.

Novo cálculo do prazo: **data prevista de pagamento + dias de tolerância configurados**.

- Adiantamento: dia de adiantamento cadastrado na unidade, no mês da competência.
- Contracheque, 13º e demais folhas mensais: dia de pagamento já configurado nas pendências (mês seguinte à competência).
- Férias, rescisão e outros pagamentos: a data de referência do próprio documento.
- Se a data prevista ainda não chegou, a pendência aparece como "aguardando", nunca atrasada.

No exemplo da Karen (adiantamento 09/2026, pagamento dia 15), o prazo passa a ser 20/09 e hoje não há atraso.

## 3. Histórico de documentos no celular

- O bloco de filtros começa **recolhido**, mostrando apenas um botão "Filtros" com a contagem de filtros ativos; ao expandir, aparecem os campos atuais. No computador nada muda.
- Novo seletor de ordem visível só no celular: Mais recentes, Mais antigos, Colaborador (A–Z), Tipo do documento, Competência. A escolha vale para a lista e para a paginação.
- A preferência de filtros abertos/fechados e de ordem fica lembrada no aparelho.

## Detalhes técnicos

- `src/components/dp/DpNotificacoesBell.tsx`: trocar `max-h-96` por altura efetiva no viewport do `ScrollArea` (`h-[min(70vh,26rem)]`) e remover o `slice(0, 15)`.
- `src/hooks/useDpPendencias.tsx` (bloco `comprovante_pagamento`): derivar `pagamentoPrevisto` por tipo usando `unidade.dia_adiantamento`, `cfg.alerta_contracheque_dia_mes` e `referencia_data`; `vencimento = pagamentoPrevisto + cfg.alerta_comprovante_dias`; manter `comprovante_vigencia_inicio` e o filtro `ciclo_status = 'ativo'`. Sem mudança de banco.
- `src/pages/dp/DpHistoricoCompleto.tsx`: envolver `DpFilterCard` em `Collapsible` só no breakpoint móvel; adicionar `Select` de ordem que alimenta `sortKey`/`sortDir` existentes; persistir em `localStorage`.
- Testes: caso de prazo do comprovante para adiantamento/contracheque em `src/test/unit`; typecheck e Vitest ao final.
