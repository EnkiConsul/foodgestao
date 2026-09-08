# Fase 1 — Feriados na Rotina + Autorização (erro `is_company_admin_or_owner`)

LEITURA DO PLANO:
- Plano integral localizado: SIM
- Marcador final localizado: SIM
- Fase autorizada: FASE 1 — FERIADOS + AUTORIZAÇÃO DA ROTINA
- Fases posteriores iniciadas: NÃO

## Diagnóstico confirmado (verificado no código e no banco)

### A. Feriado não entra na avaliação da Rotina
- O padrão do dia vem de `baselinePorDow` (`src/lib/dp/operacao-panorama.ts:744`): mediana de pessoas trabalhando por dia da semana nas últimas semanas, ignorando totalmente se o dia é feriado.
- `avaliarDia` (`operacao-panorama.ts:779`) compara o previsto com esse padrão e gera "abaixo do padrão" quando a diferença passa a tolerância de 20%.
- `src/hooks/useDpOperacaoPanorama.tsx` não carrega feriado nenhum: não há qualquer referência a feriados no arquivo (busca por "feriado" retorna zero ocorrências). Ele só lê dispensas de alerta, colaboradores, turnos, folgas, ausências, avulsos e ocorrências.
- Fonte canônica dos feriados: tabela `dp_unidade_feriados` (por empresa e unidade, com `ativo`, tipos data específica / anual / relativa) e o resolver do banco `public.dp_feriados_resolver(_unidade_id, _inicio, _fim)`; o espelho puro está em `src/lib/dp/feriados.ts` e o cadastro em `src/hooks/useDpFeriados.tsx`.

Causa raiz: o feriado é dia comum para a Rotina — nem entra no cálculo do padrão (contaminando a mediana do dia da semana), nem no dia avaliado (falso alerta quantitativo em feriado).

### B. `function private.is_company_admin_or_owner(uuid) does not exist`
- A função existe apenas com dois argumentos: `private.is_company_admin_or_owner(_user_id uuid, _company_id uuid)` (e o espelho em `public`).
- Três funções gravadas no banco chamam a versão de um argumento (confirmado lendo a definição atual no banco):
  - `public.dp_operacao_alerta_dispensar(...)` → `private.is_company_admin_or_owner(p_company)`
  - `public.dp_operacao_alerta_reverter(...)` → `private.is_company_admin_or_owner(p_company)`
  - `public.dp_pessoa_avulsa_definir_setor_dia(...)` → `private.is_company_admin_or_owner(v_reg.company_id)`
- Origem: migration `supabase/migrations/20260907224739_...sql` (linhas 84, 137, 200).

Causa raiz: chamada com aridade errada. Como o erro estoura antes do UPDATE/INSERT, hoje "marcar o dia como resolvido", "reabrir o alerta" e "definir setor do dia da pessoa avulsa" falham sempre, para qualquer usuário.

## O que será implementado

1. Migration corrigindo as três chamadas para `private.is_company_admin_or_owner(auth.uid(), <company_id>)`, mantendo `SECURITY DEFINER`, `search_path`, validações de entrada, checagem de unidade da mesma empresa, locks e grants exatamente como estão. Nenhuma policy, tabela ou privilégio é alterado.
2. Feriado na avaliação da Rotina, somente na camada de padrão/alerta:
   - o hook do panorama passa a carregar os feriados ativos da unidade no período (via `dp_feriados_resolver`, respeitando empresa/unidade selecionadas);
   - `baselinePorDow` passa a aceitar um conjunto de datas de feriado e excluir esses dias do histórico usado para a mediana, para o padrão do dia da semana representar dia normal;
   - o dia avaliado que for feriado deixa de gerar alerta quantitativo por comparação com dia comum: quando não houver padrão específico de feriado, a situação vira "sem padrão" com rótulo de feriado, em vez de "abaixo";
   - se houver histórico suficiente de feriados anteriores, o padrão do feriado usa a mediana dos feriados; caso contrário, sem alerta quantitativo.
   - o dia mostra a marca de Feriado (nome do feriado) no desktop e na lista mobile.
3. Todos os demais alertas operacionais seguem intactos: cobertura mínima, descoberto por turno, DSR, folgas acima do limite, convocações, atestados, ocorrências. Feriado inativo continua sendo dia comum. Feriado cadastrado em uma unidade não afeta outra.

## Fora do escopo desta fase

Mão de Obra Extra, folguistas, coberturas, textos de risco legal, multiunidade, notificações, pendências, tabelas, menu, KPIs, favoritos, Home e Analytics não são alterados. Nenhuma outra fase é iniciada.

## Detalhes técnicos

- Banco: uma migration só com `CREATE OR REPLACE FUNCTION` das três funções citadas (mesma assinatura, mesmo corpo, apenas a chamada de autorização corrigida). Sem alteração de schema, sem novos grants, sem mudança de RLS, `src/integrations/supabase/types.ts` não muda.
- Frontend: `src/lib/dp/operacao-panorama.ts` (parâmetro opcional de feriados em `baselinePorDow`; `avaliarDia`/rótulo cientes de feriado), `src/hooks/useDpOperacaoPanorama.tsx` (query dos feriados do período + repasse), `src/pages/dp/DpOperacaoPanorama.tsx` e o componente de lista mobile (`DiasEmLista`) apenas para exibir a marca de Feriado.
- Testes: novos casos em `src/lib/dp/__tests__/operacao-panorama.test.ts` (dia comum, feriado ativo, feriado inativo, feriado só em uma unidade, acima/abaixo do padrão, preservação dos outros alertas); consultas de validação de autorização como owner, admin autorizado, usuário sem permissão e tentativa cross-company nas três RPCs; `bunx tsgo --noEmit` e a suíte de `src/lib/dp`; evidências visuais em 1366×768 e 360 px.
- Rollback: reverter a migration reaplicando o corpo anterior das três funções (retorna ao estado com o erro) e reverter os arquivos de frontend listados acima. Nenhum dado é apagado.

Ao final da Fase 1: PARAR e aguardar aprovação expressa para a Fase 2.
