# Pessoas 360 — Fase 4: Férias sem passivos históricos artificiais

## O problema hoje

Ao gerar os períodos de férias de uma pessoa, o sistema cria um período por ano **desde a data de admissão**. Para quem já trabalhava na empresa antes de o Pessoas 360 entrar em uso, isso inventa férias vencidas e alertas de prazo que não correspondem à realidade — as férias antigas já foram pagas ou controladas fora do sistema.

## O que muda

1. **Data de início do controle de férias**
   - Nas configurações do Pessoas (Férias), a empresa informa a partir de qual dia o sistema passa a controlar férias.
   - Na ficha de cada pessoa é possível informar uma data própria (para quem entrou depois ou tem situação diferente), que prevalece sobre a da empresa.
   - Sem essa data informada, o padrão continua sendo a admissão (comportamento atual para empresas novas).

2. **Geração de períodos respeitando a data de controle**
   - Só são criados períodos cujo ano aquisitivo termina a partir da data de controle.
   - Períodos anteriores não são criados nem alertados; nada é apagado do que já existe.

3. **Saldo inicial informado (opcional)**
   - Para o período em curso na virada, o gestor pode registrar um **saldo inicial de dias** e uma observação (ex.: "20 dias de saldo trazidos do controle anterior").
   - Esse saldo entra no cálculo de dias disponíveis, aparece identificado como "saldo trazido" e fica registrado no histórico com autor e data.

4. **Períodos anteriores como "controle externo"**
   - Períodos já existentes que ficarem antes da data de controle passam a ser marcados como controlados fora do sistema: sem alerta de vencimento, sem cobrança de prazo, visíveis apenas como histórico.

5. **Telas afetadas**
   - Hub de Férias: aviso claro quando a empresa ainda não definiu a data de controle, e selo "Controle externo" nos períodos antigos.
   - Painéis de prazo/vencimento e indicadores deixam de contar os períodos de controle externo.
   - Portal do colaborador mostra apenas o que o sistema controla, com o saldo trazido somado quando informado.

## Detalhes técnicos

- `dp_config_dp`: nova coluna `ferias_controle_inicio date`.
- `dp_colaboradores`: nova coluna `ferias_controle_inicio date` (sobrepõe a da empresa).
- `dp_ferias_periodos`: novas colunas `controle_externo boolean not null default false`, `saldo_inicial_dias integer`, `saldo_inicial_obs text`.
- `dp_ferias_gerar_periodos`: passa a iniciar no período aquisitivo cujo `fim_aquisitivo >= COALESCE(colaborador.ferias_controle_inicio, config.ferias_controle_inicio, data_admissao)`; marca `controle_externo` nos períodos anteriores existentes.
- `dp_ferias_recalc_periodo` / cálculo de saldo: somar `saldo_inicial_dias` aos dias de direito e ignorar períodos `controle_externo` nas contagens de vencimento.
- Nova rotina `dp_ferias_definir_saldo_inicial(_periodo_id, _dias, _obs)` — `SECURITY DEFINER`, `pg_advisory_xact_lock`, validação de admin/owner da empresa, `REVOKE` de `anon/PUBLIC` e `GRANT EXECUTE` para `authenticated, service_role`, com registro no histórico.
- Erros novos traduzidos em `FERIAS_ERRO_TEXTO` (`src/lib/dp/ferias-direito.ts`).
- Hooks: `useDpFeriasConfig`, `useDpFerias`, `useDpMinhasFerias`, `useAnalyticsFerias` — filtrar `controle_externo` e expor o saldo trazido.
- Testes unitários das regras puras + typecheck e a suíte do Pessoas 360; validação visual no preview.
