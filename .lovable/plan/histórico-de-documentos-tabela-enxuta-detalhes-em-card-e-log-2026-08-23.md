# Histórico de Documentos: Tabela Enxuta, Detalhes em Card e Log de Alterações

## Objetivo
Deixar a lista de documentos legível em uma única tela (sem rolagem lateral), mover as informações secundárias para um painel de detalhes e registrar em log toda exclusão ou substituição de documento.

## Mudanças na lista

- Colunas finais: **Colaborador | Tipo | Competência | Unidade | Aceite | Ações**, todas com largura percentual/flexível e sem `overflow-x-auto` — a tabela cabe na largura disponível.
- **Tipo** e **Unidade** passam a permitir quebra de linha (duas linhas, sem truncar), o que libera espaço horizontal.
- Coluna **Status** removida (todo item do histórico já é um documento disponível). O filtro de status também sai da barra de filtros e do filtro por coluna.
- Coluna **Data** removida da tabela; a data passa a aparecer no painel de detalhes.
- **Ações** em duas colunas de ícones (Ver/Baixar na primeira, Substituir/Excluir na segunda), mantendo a coluna estreita.
- Cada linha fica clicável: clique em qualquer parte (fora dos botões de ação) abre os detalhes. No mobile, os cards já existentes continuam e também abrem o mesmo painel.

## Painel de detalhes do documento

Novo diálogo (`DocDetalhesDialog`) aberto pela linha/card, mostrando:
- Título, tipo, natureza, competência, colaborador e unidade.
- Data do documento e **data de importação**.
- **Usuário que importou** (nome/e-mail do perfil).
- Situação da validação digital: exigida/dispensada, indício de assinatura no arquivo e **data de aceite do colaborador** (quem aceitou e quando).
- Histórico de alterações daquele documento (substituições anteriores).
- Ações de Ver/Baixar, Substituir e Excluir no rodapé do diálogo.

## Log de exclusões e substituições

- Nova tabela `dp_documento_eventos` (empresa, documento_id, origem, ação `excluido`/`substituido`, título, tipo, competência, colaborador, unidade, arquivo antigo/novo, motivo opcional, autor, data), com RLS por empresa e GRANTs.
- `historicoDocAcoes.ts` grava o evento em toda exclusão e substituição, antes de apagar o registro/arquivo, preservando o rastro mesmo quando o documento deixa de existir.
- O painel de detalhes lê os eventos daquele documento; e o Histórico ganha um acesso "Registro de alterações" (lista dos eventos da empresa com autor, data e ação) para auditoria.

## Detalhes técnicos

- `src/pages/dp/DpHistoricoCompleto.tsx`: remover `status`/`data` de `ColKey`, `DEFAULT_COL_ORDER`, `COLS`, `colFilters` e do skeleton; trocar larguras fixas em `px` por classes flexíveis; retirar o wrapper de rolagem horizontal; `whitespace-normal break-words` em Tipo/Unidade; `onClick` na `TableRow` com `stopPropagation` nos botões.
- Novos componentes em `src/components/dp/documentos/`: `DocDetalhesDialog.tsx` e `DocEventosDialog.tsx`.
- Consulta de detalhes: `dp_documentos` + `dp_documento_aceites` + `profiles` (autor da importação) + `dp_documento_eventos`.
- Migração SQL cria a tabela de eventos com índice por `documento_id` e `company_id`.
- Invalidação de `dp_historico_unified`, `dp_doc_consistencia_janela` e da nova query de eventos após cada ação.
