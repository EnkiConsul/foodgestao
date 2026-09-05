# Folgas — período mensal de escolha e atribuição automática

## O que já existe (diagnóstico)

- As regras de folga por empresa/unidade ficam em uma configuração única que já guarda quantas folgas de fim de semana são exigidas por mês, a política de sábado, o modo de domingo e o tipo de descanso. Nada de "domingo fixo" no código: os dias aplicáveis já vêm dessa configuração.
- Os limites de quantas pessoas podem folgar por dia (por unidade, dia da semana e cargo) já existem e já são checados na marcação pelo portal e pelo administrador. Cobertura mínima já está fora da trava de folgas.
- O pedido do colaborador já passa por uma função no banco (com trava, sem duplicidade e com checagem de limite) e cai nas Solicitações, que o administrador já aprova.
- Já existe execução automática diária no banco (é assim que a escala mensal é gerada), então não precisa de nada novo de infraestrutura.
- Não existe hoje: período mensal de escolha, bloqueio fora do período, pedido de exceção identificável, nem atribuição automática no fechamento.

## O que vai ser construído

### Regras (Pessoas > Folgas > Regras)
Nova seção "Período para escolha das folgas", recorrente, sem cadastrar datas todo mês:
- Abre todo mês no dia [10] · Encerra todo mês no dia [20] (1 a 28, abertura menor ou igual ao encerramento).
- Caixa "Atribuir automaticamente as folgas não escolhidas" com o texto "Quem não escolher a folga dentro do período receberá uma data automaticamente".
- Resumo para o administrador com a explicação do mês seguinte e a ordem de distribuição: dias vazios, dias com vagas, e por último os dias finais do mês quando tudo estiver lotado.

### Portal do colaborador
Um bloco por competência-alvo (sempre o mês seguinte ao mês corrente):
- Antes da abertura: "Disponível para escolha a partir de 10/09" e botão "Solicitar exceção"; calendário do mês-alvo não marcável.
- Durante: "Escolha suas folgas de outubro até 20/09", calendário liberado, com vagas restantes por dia conforme os limites de cargo/grupo.
- Depois: "O período para escolha das folgas de outubro encerrou em 20/09" + "Solicitar exceção"; se a distribuição automática já rodou, a data aparece marcada como "Folga definida automaticamente"; se ainda não, "Estamos definindo automaticamente as folgas ainda não escolhidas".

### Distribuição automática após o fechamento
Roda sozinha, uma vez por competência, por empresa e unidade. Para cada pessoa que ainda não tem a quantidade exigida de folgas de fim de semana no mês-alvo (contando escolhidas, administrativas e automáticas já existentes), atribui as que faltam:
1. dias aplicáveis totalmente vazios para a regra de cargo/grupo;
2. dias com capacidade restante, começando pelo menos ocupado;
3. se tudo estiver lotado, dos últimos dias aplicáveis do mês para os primeiros, marcando o excesso.
Nada de excesso silencioso: cada folga acima do limite fica registrada com regra, limite, ocupação antes e depois, pessoa, data, competência e motivo, e o administrador vê o aviso "3 folgas foram atribuídas automaticamente acima dos limites configurados porque não havia mais vagas disponíveis no mês", com a lista detalhada. Nenhuma folga anterior é cancelada.

Fora do escopo: troca automática da folga gerada e qualquer liberação automática de limite.

## Detalhes técnicos

Migrações novas (nada de editar migrações antigas):
- `dp_config_dp`: `folga_janela_abre_dia`, `folga_janela_fecha_dia` (checks 1..28 e abre <= fecha), `folga_janela_ativa`, `folga_autoatribuir`. Validação também no `dp_config_dp_salvar` existente.
- Enum `dp_folga_origem`: novo valor `auto_fechamento_periodo`.
- `dp_folgas_janela_efetiva(_company, _unidade, _data_ref)` → competência-alvo (mês seguinte), datas de abertura/fechamento no fuso efetivo da operação (mesma resolução de timezone já usada em Convocações), estado `antes | aberta | encerrada`.
- `dp_folga_solicitar`: recebe `p_fora_da_janela boolean`; marcação normal de data no mês-alvo fora da janela levanta `FOLGA_FORA_DA_JANELA`; com o sinalizador, cria a solicitação marcada como `FORA_DA_JANELA_DE_MARCACAO` (reutiliza `dp_solicitacoes`, sem tabela nova) para o administrador ver "Solicitação excepcional — período de escolha ainda não iniciado/encerrado". `dp_folga_criar_admin` segue livre (decisão administrativa).
- Nova `dp_folga_autoatribuicao_execucoes` (company, unidade, competência, status pendente/processando/concluida/erro, contadores, erro, timestamps) com unicidade por company+unidade+competência, GRANTs e RLS de leitura só para admin/owner da empresa; escrita só por função.
- `dp_folga_autoatribuir_competencia(_company, _unidade, _competencia)`: transacional, `pg_advisory_xact_lock` pela chave company+unidade+competência, idempotente, usando `dp_folga_limite_dia` para capacidade e a configuração vigente para dias aplicáveis e quantidade exigida; grava detalhes do excesso na execução e em auditoria. `dp_folga_autoatribuir_todas()` percorre as empresas/unidades cuja janela fechou e ainda não foram processadas.
- Agendamento diário via `pg_cron` (uma vez por dia, junto do horário dos jobs de DP): roda 1x/dia; o atraso máximo de processamento é de até um dia após o fechamento, em troca de custo mínimo — é a cadência mais econômica que atende a regra.
- Nenhuma consulta a `dp_cobertura_minima` em folgas.

Frontend:
- `src/lib/dp/folga-janela.ts`: funções puras de estado da janela (antes/aberta/encerrada, competência-alvo) e do algoritmo de distribuição (prioridades 1/2/3, quantidade faltante, ocupação por grupo de cargos) — testadas em `src/test/unit/folgaJanela.test.ts`.
- `useDpConfigDp` + `DpConfiguracoesJornada` (seção nova), `DpFolgas`/`DpAdminCalendario` (aviso de excesso e selo de folga automática), `DpMeuCalendario` (três estados + "Solicitar exceção"), Solicitações do administrador com o rótulo de exceção.
- Tipos regenerados após as migrações, sem `as any`.

Testes: janela (dia 09/10/20/21), competência sempre o mês seguinte, quem já cumpriu não recebe nada, distribuição em dias vazios, priorização por menor ocupação, contingência do fim para o começo do mês com registro de excesso, quota por grupo de cargos, empresa configurada para sábado, idempotência em duas execuções e isolamento entre empresas. Build, testes, lint e typecheck reais com números reportados.
