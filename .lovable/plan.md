# Conferência de Documentos Completa + Ajustes no Histórico

## Respostas rápidas

- **A conferência valida todas as unidades?** Não. Ela parte dos colaboradores e só de duas flags. Pakerê T-63 tem 1 ativo (Nordman) sem folha de ponto e sem adiantamento marcados, e contracheque não é conferido — por isso a unidade nunca aparece.
- **A importação em massa identifica a unidade pelo CNPJ?** Sim: a função carrega `dp_unidades.cnpj`, extrai os CNPJs do OCR da página e usa a unidade detectada para restringir o colaborador. Mas a unidade detectada não é gravada no documento (só o CNPJ), então histórico e conferência usam a unidade do colaborador.

## 1. Conferência mínima obrigatória

Regras de expectativa por competência:

| Documento | Quando é exigido |
| --- | --- |
| Contracheque mensal | Todo colaborador ativo na competência |
| Contracheque 13º — 1ª parcela | Competência 11/AAAA, prazo legal 30/11 |
| Contracheque 13º — 2ª parcela | Competência 12/AAAA, prazo legal 20/12 |
| Folha de ponto | Unidade com relógio de ponto **e** colaborador com folha de ponto marcada |
| Adiantamento salarial | Colaborador optante por adiantamento |
| Férias (aviso/recibo) | Alerta separado: colaborador com período aquisitivo vencido/prestes a vencer e sem férias agendadas |

Detalhes:
- 13º só é cobrado após a data limite legal da parcela; antes disso aparece como aviso "a vencer", não como pendência.
- O alerta de férias não é "documento faltando" — é um bloco próprio "Férias vencidas sem agendamento", com atalho para a tela de Férias.
- Grupos por unidade continuam como hoje (lote completo por unidade / falta parcial com nomes).
- Unidade ativa com colaboradores mas sem nenhuma flag marcada ganha um aviso informativo com atalho para o cadastro.

## 2. Excluir e substituir documento importado

- Na lista do Histórico, cada linha ganha as ações **Substituir** (envia outro arquivo mantendo colaborador/tipo/competência) e **Excluir** (com confirmação e motivo).
- Excluir remove o arquivo do armazenamento e o registro; substituir troca o arquivo e zera o aceite eletrônico, quando houver, para o colaborador aceitar a versão correta.
- Como a pendência é calculada a partir dos documentos existentes, ao excluir o documento a pendência reaparece automaticamente na Conferência — a tela é recarregada na hora para o alerta voltar imediatamente.

## 3. Ajustes visuais do Histórico

- Colunas legíveis: larguras recalculadas (Colaborador maior, Competência/Data/Aceite menores), rótulos curtos ("Compet.") e cabeçalho sem truncar; ícones de ordenar/filtrar aparecem sem comer o texto.
- Remover o botão **Restaurar Colunas**; a ordem padrão volta pelo menu do próprio cabeçalho.
- **Filtros**: busca e o botão "Limpar" sobem para a mesma linha do título "Filtros", economizando uma faixa vertical.

## Detalhes técnicos

- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: expandir o conjunto de tipos esperados (`contracheque`, `contracheque_13`, `ponto`, `adiantamento`), ler `dp_unidades.possui_relogio_ponto` para condicionar a folha de ponto, aplicar prazos legais do 13º (30/11 e 20/12) e adicionar bloco de férias a partir de `dp_ferias_periodos` (saldo > 0, `limite_concessivo` vencido/próximo) cruzado com `dp_ferias_gozos` sem agendamento.
- 13º: como não há competência distinta para 1ª/2ª parcela no enum, diferenciar pela `referencia_data` (11 e 12 do ano) do documento tipo `contracheque_13`.
- `src/pages/dp/DpHistoricoCompleto.tsx`: novas ações de linha (substituir/excluir) usando `dp_documentos` + bucket `dp-documentos`; invalidar `["dp_documentos"]` e `["dp_doc_consistencia_janela"]`; ajustar larguras/rótulos, remover `RotateCcw`/"Restaurar Colunas" e mover busca + Limpar para o cabeçalho do card.
- Exclusão: apagar objeto do storage e a linha de `dp_documentos`; registrar motivo em `audit_logs` (padrão já usado no módulo).
- `supabase/functions/dp-doc-bulk-ingest`: persistir a unidade resolvida pelo CNPJ no item do lote e propagar ao documento aprovado (migração para a coluna, se necessário, com GRANTs); sinalizar na revisão quando o CNPJ do PDF não existir em Unidades.
- Sem alteração de RLS: todas as leituras e escritas seguem por `company_id`.
