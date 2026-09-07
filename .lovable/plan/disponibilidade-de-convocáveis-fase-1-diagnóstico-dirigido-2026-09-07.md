# Disponibilidade de convocáveis — Fase 1: diagnóstico dirigido

Auditoria confirmada por leitura de banco e de código. Nenhum arquivo de aplicação, migration ou regra foi alterado nesta fase.

## 1. O que já existe e funciona

| Ativo | Situação verificada |
|---|---|
| `dp_indisponibilidades` | Existe com 11 colunas: `id, company_id, colaborador_id, data, motivo, origem ('colaborador' default), criado_por, cancelada_em, cancelada_por, created_at, updated_at`. Cancelamento é lógico (não apaga). |
| `dp_indisponibilidade_marcar(p_data, p_motivo)` | `SECURITY DEFINER`, deriva colaborador/empresa/unidade de `auth.uid()`, valida regime convocável, usa timezone da unidade, bloqueia data passada, `pg_advisory_xact_lock` por colaborador+data, idempotente, encerra ofertas pendentes com motivo `INDISPONIBILIDADE_DECLARADA` (e motivo temporal correto quando prazo/início já venceram), grava auditoria. `anon` sem execute. |
| `dp_indisponibilidade_remover(p_data)` | Mesmo padrão; cancelamento lógico e auditoria. |
| Elegibilidade | `dp_convocacao_avaliar_candidato` já devolve `INDISPONIVEL_NA_DATA` para indisponibilidade ativa — o bloqueio de convocação já é autoritativo no banco. |
| Portal | `MinhaDisponibilidadeCard` (mês, marcar/remover) já embutido em `DpMeuCalendario` só quando `convocavel`; hook `useDpIndisponibilidades` com estados disponível/indisponível/convocação pendente/confirmada. |
| RLS | `dp_indisponibilidades`: SELECT do próprio (`dp_colaborador_ativo_of`) + SELECT de admin/dono por empresa. Escrita apenas via RPC. Isolamento multiempresa preservado. |
| Regras de convocação | `dp_convocacao_config` (empresa + unidade, herança via `dp_convocacao_config_resolvida`) e tela `ConvocacoesRegrasPanel` com salvamento otimista por `updated_at`. |
| Quota de folgas | `dp_folga_limite_dia(p_company, p_unidade, p_cargo, p_data, p_ignorar_colaborador, p_setor)` já resolve exceção da data, regras por quantidade/cargo/setor, grupos de setores, setor efetivo via `dp_setor_previsto_id`, regra mais restritiva e `setor_nao_definido`. |
| Ocorrências | `dp_ocorrencias` com tipo `previsao_falta` e `dp_ocorrencia_registrar` disponíveis para o risco de ausência. |

## 2. Lacunas confirmadas

1. **Sem janela mensal.** `dp_convocacao_config` não tem dia de abertura/fechamento da indisponibilidade nem flag de impacto em folgas nem lembrete. Não há nenhuma regra temporal para o portal consultar — hoje o trabalhador marca qualquer data futura, sempre.
2. **Sem metadados de janela na indisponibilidade.** Faltam `informada_em`, `dentro_da_janela`, `alteracao_tardia` (e a decisão sobre um vínculo de conflito). `origem`, `criado_por`, `cancelada_em/por` já existem — não recriar.
3. **Convocação aceita bloqueia por completo.** `dp_indisponibilidade_marcar` levanta `ACCEPTED_CALL_REQUIRES_REPLACEMENT`; o fluxo pedido (avisar, registrar, criar conflito e previsão de ausência) não é possível hoje.
4. **Sem conflito nem previsão de ausência.** Nada gera `previsao_falta` a partir de indisponibilidade posterior ao aceite, e a Rotina não mostra "risco de ausência".
5. **Sem notificação ao gestor** de abertura de janela, alteração tardia ou conflito.
6. **Quota de folgas ignora indisponibilidade.** A ocupação em `dp_folga_limite_dia` conta apenas folgas válidas e solicitações aprovadas.
7. **Convocações sem as abas Planejamento e Disponibilidade.** Hoje: Próximas, Aguardando, Aprovações, Confirmadas, Realizadas, Histórico, Regras. Não há visão consolidada por competência nem por trabalhador.
8. **Portal sem competência explícita** ("Minha disponibilidade — Outubro/2026") nem mensagens de antes da abertura / após o fechamento / alteração tardia.

## 3. Arquivos realmente envolvidos nas próximas fases

- Banco: `dp_convocacao_config` (novos campos de janela/impacto/lembrete), `dp_indisponibilidades` (metadados de janela), RPCs `dp_indisponibilidade_marcar`/`_remover`, `dp_convocacao_config_resolvida`, `dp_folga_limite_dia`, `dp_ocorrencia_registrar`, notificações.
- Regras (Fase 2): `src/components/dp/convocacoes/ConvocacoesRegrasPanel.tsx`, `src/hooks/useDpConvocacaoGrupos.tsx`.
- Portal (Fase 2/5): `src/components/dp/MinhaDisponibilidadeCard.tsx`, `src/pages/dp/portal/DpMeuCalendario.tsx`, `src/hooks/useDpIndisponibilidades.tsx`, `src/lib/dp/convocacoes-planejamento.ts` (cálculo puro da janela).
- Gestor (Fase 3/6): `src/pages/dp/DpConvocacoes.tsx` + novos componentes em `src/components/dp/convocacoes/`.
- Folgas (Fase 4): `src/lib/dp/folga-limites.ts`, `src/hooks/useDpFolgasQueries.tsx`, telas de folgas.
- Rotina/ocorrências (Fase 5): `src/lib/dp/operacao-panorama.ts`, `src/pages/dp/DpOperacaoPanorama.tsx`, `src/hooks/useDpOcorrencias.tsx`.

## 4. Riscos mapeados

- Alterar `dp_indisponibilidade_marcar` para aceitar conflito muda um contrato hoje bloqueante: precisa de parâmetro explícito de confirmação, senão o portal passa a criar conflitos sem ciência do trabalhador.
- Somar indisponibilidade à ocupação de folgas pode reprovar folga que hoje é aceita — só com a configuração ativa e com aviso claro.
- `dp_folga_limite_dia` tem duas assinaturas (com e sem `p_setor`); a evolução precisa tratar as duas para não quebrar chamadas antigas.
- Alteração tardia acima da quota não pode remover registros existentes: apenas alerta.

## 5. Fase 2 proposta (só executar após aprovação)

1. Campos de janela em `dp_convocacao_config`: dia de abertura, dia de fechamento (1–28, abertura ≤ fechamento), impacto em folgas, lembrete e antecedência — sem data hardcoded, com herança unidade > empresa.
2. Metadados de janela em `dp_indisponibilidades`: `informada_em`, `dentro_da_janela`, `alteracao_tardia`.
3. Cálculo puro da competência e da janela em `src/lib/dp/convocacoes-planejamento.ts`, usado por portal e gestor.
4. Seção "Disponibilidade dos convocáveis" em Convocações > Regras.
5. Portal com competência no título, mensagens de antes/depois da janela, ação "Informar alteração de disponibilidade" e registro de alteração tardia.
6. Verificação: build e typecheck; nenhuma suíte de teste criada ou executada.

Rollback: os campos novos são aditivos e anuláveis — reverter é remover as colunas adicionadas e restaurar as versões anteriores das RPCs; nenhum dado existente é apagado.

PARADO ao final da Fase 1.
