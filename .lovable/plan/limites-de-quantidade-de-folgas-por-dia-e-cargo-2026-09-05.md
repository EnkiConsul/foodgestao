# Limites de quantidade de folgas por dia e cargo

O arquivo do plano anterior foi arquivado após a aprovação, então ele está reescrito aqui igual ao que combinamos, para eu poder executar.

## Regra central

A pergunta que a tela responde passa a ser: **"quantas pessoas podem folgar ao mesmo tempo neste dia?"** — e não mais "sobra gente suficiente para operar?".

Folga **não** é bloqueada por cobertura mínima. A cobertura mínima continua existindo apenas como informação na operação/escala.

## O que será feito

### 1. Regras recorrentes de limite (tela Regras de folgas)
- Novo bloco **"Quantas pessoas podem folgar por dia"**, com regras que valem sempre (sem precisar cadastrar dia por dia):
  - escopo: empresa inteira ou uma unidade;
  - dia da semana (ou "todos os dias");
  - cargo(s) a que a regra se aplica, ou "qualquer cargo";
  - quantidade máxima de pessoas em folga;
  - vigência (início e fim opcionais) e liga/desliga.
- Regra mais específica vence a mais genérica (unidade + cargo + dia > unidade + dia > empresa).
- Lista com edição e exclusão, e um resumo em linguagem simples de cada regra ("Na Unidade Centro, sábados, Garçom: no máximo 2 em folga").

### 2. Exceção pontual por data
- O limite por data que já existe hoje continua funcionando e passa a ser tratado como **exceção**: quando existe limite cadastrado para aquele dia, ele prevalece sobre a regra recorrente.
- Na janela do dia do calendário aparece qual limite está valendo e de onde ele vem (exceção do dia ou regra recorrente).

### 3. Aplicação no calendário, no portal e no sorteio
- Atribuir folga (admin), solicitar folga (portal) e o sorteio automático passam a validar **somente** o limite de pessoas em folga, com mensagem clara: "Este dia já atingiu o limite de 2 pessoas em folga para Garçom".
- As travas atuais de cobertura mínima saem do fluxo de folgas.
- Contagem considera folgas ativas do dia (não conta canceladas, férias e licenças).

## Detalhes técnicos

- Migração: `dp_folga_limite_regras` (company_id, unidade_id nulo = empresa, dia_semana nulo = todos, maximo, vigencia_inicio/fim, ativo, timestamps + trigger de updated_at) e `dp_folga_limite_regra_cargos` (regra_id, cargo_id). GRANTs para `authenticated`/`service_role`, RLS por empresa no padrão das demais tabelas de DP.
- Nova função pura em `src/lib/dp/` para resolver o limite efetivo (exceção do dia > regra por unidade+cargo+dia > ... > padrão sem limite), com testes unitários de precedência e vigência.
- RPCs `dp_folga_criar_admin` e `dp_folga_solicitar`: remover a validação de `dp_capacidade_habitual_dia_cargo` e passar a validar o limite resolvido no banco; manter bloqueios de data e regras de DSR.
- `DpConfiguracoesJornada.tsx`: novo bloco de cadastro das regras; `DpFolgas.tsx`, `DpAdminCalendario.tsx` e `DpMeuCalendario.tsx`: exibir o limite vigente e a origem; edge function `dp-sorteio-folgas`: usar o limite resolvido em vez de apenas `dp_dia_config.limite_folgas`.
