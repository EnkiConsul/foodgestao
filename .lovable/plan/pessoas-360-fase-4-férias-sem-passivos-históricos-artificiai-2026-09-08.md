# Pessoas 360 — Fase 4: Férias sem passivos históricos artificiais

## O problema hoje

Ao gerar os períodos de férias de uma pessoa, o sistema cria um período por ano **desde a data de admissão**. Para quem já trabalhava na empresa antes de o Pessoas 360 entrar em uso, isso inventa férias vencidas antigas e alertas de prazo que não correspondem à realidade — essas férias já foram pagas ou controladas fora do sistema.

## Regra padrão

Por segurança, o padrão passa a ser: **o sistema cobra apenas o último ciclo de férias de cada pessoa** (o período aquisitivo mais recente já completo, mais o período em curso). Nada anterior a isso gera pendência ou alerta de vencimento.

Se a empresa quiser controlar mais do que isso, ela mesma define uma data de corte anterior — a responsabilidade por esses períodos antigos é da empresa.

## O que muda

1. **Data de corte do controle de férias**
   - Nas configurações do Pessoas (Férias), a empresa pode informar a partir de qual dia o sistema controla férias. Em branco = regra padrão (último ciclo).
   - Na ficha de cada pessoa é possível informar uma data própria, que prevalece sobre a da empresa.

2. **Geração de períodos respeitando o corte**
   - Sem data informada: cria o período em curso e o último período aquisitivo completo; os anteriores ficam fora da cobrança.
   - Com data informada: cria a partir do período aquisitivo que termina nessa data ou depois.
   - Nada existente é apagado.

3. **Períodos anteriores como "controle externo"**
   - Períodos fora do corte ficam marcados como controlados fora do sistema: sem alerta de vencimento, sem prazo cobrado, visíveis apenas como histórico com o selo "Controle externo".

4. **Saldo inicial informado (opcional)**
   - Para o período em curso na virada, o gestor pode registrar um **saldo inicial de dias** e uma observação (ex.: "20 dias trazidos do controle anterior").
   - Esse saldo entra nos dias disponíveis, aparece identificado como "saldo trazido" e fica no histórico com autor e data.

5. **Telas afetadas**
   - Hub de Férias: explicação da regra de corte em uso e selo "Controle externo" nos períodos antigos.
   - Painéis de prazo/vencimento e indicadores deixam de contar os períodos de controle externo.
   - Portal do colaborador mostra apenas o que o sistema controla, somando o saldo trazido quando informado.

## Detalhes técnicos

- `dp_config_dp`: nova coluna `ferias_controle_inicio date` (nulo = regra padrão do último ciclo).
- `dp_colaboradores`: nova coluna `ferias_controle_inicio date` (sobrepõe a da empresa).
- `dp_ferias_periodos`: novas colunas `controle_externo boolean not null default false`, `saldo_inicial_dias integer`, `saldo_inicial_obs text`.
- `dp_ferias_gerar_periodos`: calcula o corte efetivo — `colaborador.ferias_controle_inicio` → `config.ferias_controle_inicio` → padrão (início do penúltimo período aquisitivo em relação a hoje) — e só cria períodos com `fim_aquisitivo >= corte`; marca `controle_externo = true` nos períodos existentes anteriores ao corte.
- `dp_ferias_recalc_periodo` e o cálculo de saldo: somar `saldo_inicial_dias` aos dias de direito; ignorar períodos `controle_externo` nas contagens de vencimento e pendências.
- Nova rotina `dp_ferias_definir_saldo_inicial(_periodo_id, _dias, _obs)` — `SECURITY DEFINER`, `pg_advisory_xact_lock`, validação de admin/owner da empresa, `REVOKE` de `anon/PUBLIC`, `GRANT EXECUTE` para `authenticated, service_role`, com registro no histórico.
- Erros novos traduzidos em `FERIAS_ERRO_TEXTO` (`src/lib/dp/ferias-direito.ts`).
- Hooks `useDpFeriasConfig`, `useDpFerias`, `useDpMinhasFerias`, `useAnalyticsFerias`: filtrar `controle_externo` e expor o saldo trazido.
- Testes unitários das regras puras de corte + typecheck e a suíte do Pessoas 360; validação visual no preview.
