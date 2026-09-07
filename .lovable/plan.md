# Ocorrências — Etapa 3 (última etapa pendente)

A Etapa 2 e o anexo da ficha de registro estão prontos. Falta apenas a Etapa 3: automação a partir do atestado, trava contra registro repetido, histórico de mudanças, ocorrências na ficha do colaborador e indicadores do mês.

## O que muda para quem usa

1. **Atestado gera as faltas automaticamente**
   Quando um atestado é aprovado, o sistema cria uma ausência por dia do período em que a pessoa tinha trabalho previsto (dias de folga e férias não geram nada). Se a falta daquele dia já existia (lançada antes do atestado chegar), ela é ligada ao atestado em vez de virar um registro novo.

2. **Atestado recusado não apaga a falta**
   A ausência continua registrada, deixa de constar como justificada e volta para decisão do gestor, com o motivo da recusa anotado.

3. **Sem registro repetido**
   O mesmo tipo de ocorrência para a mesma pessoa no mesmo dia não pode ser lançado duas vezes; ao tentar, o sistema abre a ocorrência que já existe.

4. **Ocorrências na ficha do colaborador**
   Novo bloco na ficha, agrupado por mês, mostrando tipo, dia, situação, cobertura e se houve atestado.

5. **Indicadores do mês na tela de Ocorrências**
   Faixa de números no topo: atrasos e total de minutos, faltas, ausências cobertas e descobertas, coberturas previstas x realizadas, saídas antecipadas e pendências em aberto.

6. **Histórico de auditoria**
   Cada criação, mudança de situação, análise, cobertura e cancelamento passa a ficar registrada com autor e data, visível na ocorrência.

## Detalhes técnicos

Estado atual confirmado: atestados são registros de `dp_solicitacoes` (tipo `atestado`, com `data_alvo`/`data_fim` e `status`), não de `dp_documentos`; `dp_ocorrencia_eventos` existe mas está vazia (nada grava histórico ainda); `idx_dp_ocorrencias_dedup` existe porém não é único, logo não bloqueia duplicidade; não há RPC de indicadores; `ColaboradorFichaDialog` não usa abas (é uma pilha de cards).

**Migração**
- Índice único parcial `(colaborador_id, data_operacional, tipo)` para estados diferentes de `cancelada`, substituindo o índice atual de dedup.
- Coluna de vínculo `solicitacao_id` em `dp_ocorrencias` (referência ao atestado) + índice.
- Função `dp_ocorrencia_atestado_aplicar(_solicitacao_id)`: percorre os dias de `data_alvo` a `data_fim`, consulta o horário previsto (mesma fonte usada em `dp_ocorrencia_previsto`), ignora dias sem previsão/férias, e para cada dia insere ausência justificada ou vincula a ocorrência existente (idempotente).
- Trigger `AFTER UPDATE OF status ON dp_solicitacoes` para `tipo = 'atestado'`: `aprovado` chama a função; `recusado` reclassifica as ocorrências vinculadas (justificada → pendente de decisão, motivo gravado) sem excluí-las.
- Trigger de histórico em `dp_ocorrencias` e `dp_ocorrencia_coberturas` gravando em `dp_ocorrencia_eventos` (campo, valor anterior, valor novo, autor).
- RPC `dp_ocorrencias_indicadores(_company_id, _inicio, _fim, _unidade_id)` retornando os números do mês, `SECURITY DEFINER` com `search_path = public`, `REVOKE EXECUTE ... FROM anon, PUBLIC` e `GRANT` só para `authenticated`.

**Frontend**
- `src/hooks/useDpOcorrenciasIndicadores.tsx` (nova RPC) e faixa de indicadores em `DpOcorrencias.tsx`.
- `src/hooks/useDpOcorrenciaEventos.tsx` + lista de histórico dentro do detalhe da ocorrência.
- Novo `src/components/dp/ocorrencias/ColaboradorOcorrenciasCard.tsx` agrupando por mês, incluído em `ColaboradorFichaDialog.tsx`.
- `useDpOcorrencias`: tratar o erro de índice único mostrando "já existe ocorrência deste tipo neste dia" e abrindo a existente.

**Verificação**
- Um arquivo de teste para as regras puras novas, `bunx tsgo --noEmit -p tsconfig.json` e linter de segurança após a migração (testes mantidos ao mínimo, como combinado).
