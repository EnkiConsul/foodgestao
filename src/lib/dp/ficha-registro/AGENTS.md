# Regras de src/lib/dp/ficha-registro

- Divergência com a Ficha de Registro: qualquer cargo, salário, vínculo, forma de pagamento ou horário gravado diferente da ficha de origem exige justificativa (mín. 15, `JUSTIFICATIVA_DIVERGENCIA_MIN` em `src/lib/dp/ficha-registro/divergencia.ts`) e ciência, registradas via `registrarCienciaRegra` (`src/lib/dp/regras-oficial.ts`) — a ficha é registro contábil (CTPS/eSocial).
- Histórico da ficha de registro (férias, afastamentos, advertências) é lido por `dp-ficha-historico-varrer` e só entra nos módulos pela RPC idempotente `dp_ficha_historico_aplicar` após conferência; afastamentos e advertências ficam no dossiê interno sem notificar o colaborador — evita alertas falsos.
- Importação de ficha: regime, forma de pagamento, cargo (com CBO), salário padrão da unidade/convenção e dependentes são sugeridos pela própria ficha e gravados só quando o gestor aprova.
