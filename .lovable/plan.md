## 1. Arquitetura atual (verificada no código e no banco)

**Tabelas existentes hoje**
- `dp_jornadas` (19 col.) — concentra tudo: `tipo_escala`, `turno`, `horario_entrada/saida`, `dias_trabalho`, `dias_folga`, `carga_horaria_diaria/semanal`.
- `dp_jornada_horarios` (12 col.) — horário por dia da semana, com `carga_horas` e `termina_no_dia_seguinte`.
- `dp_colaborador_jornadas` (14 col.) — vínculo com vigência + overrides (`folga_fixa_semana_override`, entrada/saída).
- `dp_unidades` (14 col.) — **não possui horário de funcionamento**.
- `dp_cobertura_minima` — já existe, mas usa `turno` como enum (`dp_turno`: matutino/vespertino/noturno/misto) e `minimo`, sem `turno_id` nem vigência.
- `dp_folgas`, `dp_dia_config`, `dp_colaboradores` (`folga_fixa_semana`, `regime`, `aprendiz`, `unidade_id`, `cargo_id`).
- **Não existe** `dp_escalas` nem `dp_escala_itens`. Não existe tabela de convocações.

**Volume real de dados (contado agora):** 2 jornadas, 14 horários, **0 vínculos colaborador–jornada**, 3 unidades, 18 folgas, 0 registros de cobertura mínima. A migração de dados é praticamente trivial e de risco baixíssimo.

**Código**
- Hooks/domínio: `useDpJornadas.tsx`, `jornada-utils.ts`, `dsr-rules.ts`, `escala-generator.ts`, `contrato-policy.ts`, `bloqueio-rules.ts`.
- UI: `DpCadastroJornadas.tsx`, `HorariosSemanaEditor.tsx`, `JornadaCard/CargaResumo/Templates.tsx`, `ColaboradorJornadaDialog.tsx`, `ColaboradorFormDialog.tsx`, `CoberturaMinimaCard.tsx`.
- `DpEscalas.tsx` **não é uma escala de turnos**: é um gerador de folgas mensal que grava em `dp_folgas`. O nome atual no menu é "Gerador de Escala".
- Navegação: "Jornadas e escalas" fica dentro de Cadastros; não existe "Operação do Dia" nem "Turnos".

## 2. Problemas encontrados

1. Jornada acumula 6 responsabilidades (horário, regime, dias, folga, carga, escala).
2. Não há fonte confiável de "horário previsto" por colaborador/data — pré-requisito do ponto.
3. Nenhum snapshot de horário: alterar uma jornada reescreve o passado.
4. Escala = folgas, não turnos; sem unidade/cargo/horário por dia.
5. Cobertura mínima presa a um enum de turno genérico, sem ligação com horários reais.
6. Unidade sem horário de funcionamento — impossível validar cobertura ou turno fora do expediente.
7. Validação de 44h aparece em telas de cadastro, onde não faz sentido.
8. Regras de domínio espalhadas entre componentes e páginas.

## 3. Arquitetura proposta

```text
Horário de funcionamento (unidade)
        ↓
Turnos (horários reutilizáveis)
        ↓
Configuração de trabalho do colaborador
        ↓
Escala (snapshot do horário previsto)
        ↓
Ponto eletrônico (fase futura)
```

Serviço central `obterHorarioPrevistoColaborador({companyId, colaboradorId, data})` com precedência: item de escala publicado → convocação aceita → exceção da data → turno habitual vigente → sem horário previsto.

## 4. Tabelas novas / alteradas

Novas: `dp_unidade_horarios_funcionamento`, `dp_turnos`, `dp_colaborador_config_trabalho`, `dp_escalas`, `dp_escala_itens`, `dp_convocacoes` (+ eventos), `dp_migracao_jornadas_log`.
Alteradas: `dp_cobertura_minima` ganha `turno_id`, `quantidade_minima`, vigência e `ativo` (mantendo as colunas atuais até o corte).
Mantidas intactas nesta entrega: `dp_jornadas`, `dp_jornada_horarios`, `dp_colaborador_jornadas` — sem DROP, sem rename.

Todas as tabelas novas seguem o padrão do projeto: `company_id`, RLS por empresa, GRANTs explícitos, trigger de `updated_at`, índices por empresa/unidade/data.

## 5. Plano de entregas (cada fase é aprovada e testada antes da seguinte)

**Fase 1 — Fundação de horários**
`dp_unidade_horarios_funcionamento` + `dp_turnos` (com versionamento e `carga_liquida_horas`), `src/lib/dp/turno-utils.ts`, hooks `useDpHorariosFuncionamento`/`useDpTurnos`, telas `DpTurnos.tsx`, `HorarioFuncionamentoEditor.tsx`, `TurnoCard/TurnoForm`. Sem validação de 44h no cadastro de turno.

**Fase 2 — Configuração de trabalho do colaborador**
`dp_colaborador_config_trabalho` com vigência e histórico; `ColaboradorConfigTrabalho.tsx` substituindo o uso principal de `ColaboradorJornadaDialog`; campos condicionais por contrato (6x1, 5x2, 12x36, intermitente, aprendiz/menor) reaproveitando e ampliando `contrato-policy.ts`. Migração dos 2 registros legados em turnos + configuração, com log de auditoria.

**Fase 3 — Escala como centro**
`dp_escalas` + `dp_escala_itens` com snapshot obrigatório de horário e `origem_horario`. Nova `DpEscalas.tsx` (grade por dia/unidade, mobile-first em cards), atalhos: repetir semana, aplicar turnos habituais, copiar dia, trocar em lote, marcar folga, publicar. O gerador de folgas atual vira "Gerador de Folgas" dentro de Folgas e Ausências, preservado.

**Fase 4 — Validação e cobertura**
`src/lib/dp/conformidade-escala.ts` e `cobertura-utils.ts`, com severidades separadas (bloqueante / conformidade / operacional / sugestão). Ajuste de `dp_cobertura_minima` para `turno_id` e vigência; `CoberturaTurnoCard.tsx`, `ConflitoEscalaAlert.tsx`.

**Fase 5 — Convocações (intermitente)**
`dp_convocacoes` com snapshot próprio, prazo, aceite/recusa e histórico; ao aceitar, cria/atualiza item de escala com `origem_horario = 'convocacao'`, sem duplicidade e validando sobreposição.

**Fase 6 — Horário previsto + Operação do Dia**
`src/lib/dp/horario-previsto.ts` implementando a precedência; `DpOperacaoDia.tsx` com blocos Agora / Próximo turno / Alertas / Ações rápidas; reorganização da navegação (Operação do Dia, Escalas, Equipe, Convocações, Folgas e Ausências, Turnos, Unidades, Conformidade, Relatórios, Configurações).

**Fase 7 — Encerramento do legado**
Bloquear novos cadastros no formato antigo, manter leitura, e só então propor a remoção em entrega separada.

Ponto eletrônico e sugestão de escala por IA ficam fora do escopo: a arquitetura apenas fica preparada (contratos de dados e serviço de horário previsto).

## 6. Riscos e rollback

- **Risco baixo de dados** (0 vínculos, 2 jornadas). Ainda assim, migração só copia — nunca apaga.
- **Risco de UI**: `DpEscalas` atual é usada para folgas; será preservada com novo nome antes da nova escala entrar.
- **Rollback**: cada fase é uma migração aditiva; reverter = parar de usar a tela nova e voltar a rota antiga, já que o legado continua funcional e íntegro até a Fase 7.
- Testes unitários novos para `turno-utils`, `escala-utils`, `conformidade-escala`, `horario-previsto` e `cobertura-utils`; os 80 testes atuais permanecem verdes.

## 7. Padrões técnicos

Nenhuma regra jurídica, cálculo de carga ou precedência de horário dentro de componentes React. Mobile-first testado em 320/360/390/430px, cards empilhados, filtros em bottom sheet, alvos de 44px, rodapé fixo para salvar/publicar, safe area, estados de carregamento/vazio/erro e `aria-label` em botões de ícone.
