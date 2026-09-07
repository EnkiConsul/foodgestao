# Fase 4 — Reservar capacidade de Folgas a partir de indisponibilidades de convocáveis

## Contexto

A Fase 2 criou a chave `disponibilidade_reserva_folga` em `dp_convocacao_config` e a Fase 3 entregou a visão de Disponibilidade do gestor. Esta fase dá efeito prático àquela chave: quando ativada, os dias em que trabalhadores convocáveis (intermitentes/freelancers) informaram indisponibilidade passam a **reservar vagas do limite de folgas** da mesma data, para que o planejamento de folgas não ocupe a capacidade que a operação já sabe que precisará.

## Objetivo

Fazer com que a indisponibilidade de convocáveis reduza a capacidade disponível de folgas quando a empresa ativar `disponibilidade_reserva_folga`.

Escopos de reserva:
- Cargo individual
- Grupos de cargos (regra `cargo` com múltiplos `cargo_ids`)
- Setor
- Grupos de setores (regra `setor` com múltiplos `setor_ids`)
- Solicitações pendentes de folga já devem continuar contando na ocupação
- Alterações tardias de indisponibilidade também reservam, mas geram alerta
- Concorrência entre folgas e reservas protegida por locks existentes

## O que será alterado

### Backend (migrations)

1. **Evolver `dp_folga_limite_dia`** para, quando a configuração `disponibilidade_reserva_folga` estiver ativa na empresa/unidade, somar à contagem `em_folga` as indisponibilidades de convocáveis ativos no mesmo escopo (cargo/setor) naquela data. A função continua devolvendo o mesmo JSON, mas `em_folga` e `disponivel` passam a refletir a reserva.

2. **Evolver `dp_folga_autoatribuicao_plano`** para considerar a reserva no cálculo de ocupação de cada dia, mantendo o mesmo contrato de retorno (`ocupacao` por data).

3. **Evolver `dp_folga_autoatribuir_competencia`** para usar o mesmo cálculo de ocupação, garantindo que a distribuição automática respeite a reserva.

4. **Criar função auxiliar `dp_folga_reserva_indisponibilidade`** (opcional, se tornar o cálculo reutilizável) que retorne a quantidade de convocáveis indisponíveis em uma data para um dado escopo de cargo/setor/unidade. Usará `dp_regime_convocavel`, `dp_indisponibilidades`, `dp_colaboradores` e `dp_convocacao_config_resolvida`.

5. **Auditoria**: registrar nos audit logs quando uma indisponibilidade reservar vaga de folga (campo extra no JSON de auditoria de `dp_indisponibilidades_marcar` já existente).

### Frontend

1. **`src/lib/dp/folga-limites.ts`**: ajustar `resolverLimiteFolga`/`ocupacaoNoEscopo` ou criar função auxiliar para calcular a reserva localmente quando o frontend já tiver as indisponibilidades em memória, mantendo coerência com o backend.

2. **`src/pages/dp/DpFolgas.tsx`**: no calendário e no resumo, quando a empresa tiver `disponibilidade_reserva_folga` ativa, mostrar:
   - um indicador de "reserva" nos dias afetados;
   - a contagem de reservas junto à ocupação;
   - tooltip explicando que a reserva vem de indisponibilidade de convocáveis.

3. **`src/pages/dp/portal/DpMeuCalendario.tsx`**: se aplicável, indicar ao colaborador quando a data está reservada por indisponibilidade de convocáveis (visão read-only, sem bloquear a escolha de folga dele).

4. **`src/components/dp/convocacoes/ConvocacoesRegrasPanel.tsx`**: garantir que o label da chave esteja claro e que o efeito seja aplicado na empresa/unidade correta.

### Hook

- **`src/hooks/useDpFolgaLimites.tsx`** ou novo hook: carregar indisponibilidades do mês para o cálculo local quando `disponibilidade_reserva_folga` estiver ativa.

## Regras de negócio

- Reserva só acontece quando `disponibilidade_reserva_folga = true` na empresa/unidade resolvida.
- Só convocáveis ativos sem indisponibilidade cancelada reservam.
- A reserva segue o escopo da regra de folga:
  - Regra sem cargo/setor → reserva qualquer indisponibilidade da unidade/empresa.
  - Regra com cargo(s) → reserva só indisponibilidades dos convocáveis daquele cargo.
  - Regra com setor(es) → reserva só indisponibilidades dos convocáveis daquele setor.
- Indisponibilidades de alteração tardia reservam da mesma forma, mas mantêm o alerta existente ao gestor.
- A reserva não cria folga, não cancela folga e não altera o limite configurado: apenas aumenta a ocupação efetiva usada nos cálculos.
- Multiempresa: a consulta de indisponibilidade é sempre filtrada por `company_id` e pela unidade quando a regra é por unidade.

## Segurança

- As funções alteradas são `SECURITY DEFINER` e já validam `company_id` e/ou `is_company_admin_or_owner`.
- Leitura de `dp_indisponibilidades` respeita RLS existente (`company_id` e `colaborador_id`).
- Não expõe indisponibilidades individuais para usuários sem acesso; apenas a contagem agregada por escopo.

## Validação

- `npx vite build` (sem erros bloqueantes).
- `npm run lint` / `tsgo --noEmit` (sem erros novos).
- SQL: verificar assinatura e retorno de `dp_folga_limite_dia`, `dp_folga_autoatribuicao_plano` e `dp_folga_autoatribuir_competencia`.
- SQL: verificar que anônimo não executa as funções.
- Evidência funcional: em Folgas, ativar a chave em Convocações → Regras e observar que dias com indisponibilidades de convocáveis passam a contar como ocupados.

## Rollback

- Restaurar as versões anteriores das funções `dp_folga_limite_dia`, `dp_folga_autoatribuicao_plano` e `dp_folga_autoatribuir_competencia`.
- Remover, se criada, a função auxiliar `dp_folga_reserva_indisponibilidade`.
- Reverter as alterações nos arquivos de frontend listados.
- Nenhum dado existente será apagado.

## Pendências após esta fase

- Fase 5: conflitos com ofertas pendentes e convocações aceitas.
- Fase 6: planejamento consolidado em Convocações.
- Fase 7: automação de lembretes (se prevista).
