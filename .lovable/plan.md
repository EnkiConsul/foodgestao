# Documentos: rescisão duplicada e adiantamento marcado como inconsistente

## O que está acontecendo (confirmado)

1. **Rescisão da Karine aparece duas vezes.** A tela de Documentos monta a lista de "Falta Importar" somando duas fontes: a conferência própria da tela e a lista oficial de Pendências. Contracheque, adiantamento e folha de ponto já vêm só das Pendências; a rescisão ficou de fora dessa regra, então a mesma cobrança entra duas vezes. Karine foi desligada em 02/07/2026 e não tem documento de rescisão importado — daí a dupla exibição.

2. **Adiantamento 08/2026 da Cristiane marcado como inconsistente.** A ficha dela tem um único registro de opção pelo adiantamento, feito em 01/04/2017, que continua valendo até hoje. O vínculo CLT foi encerrado em 27/08/2026 e o novo vínculo (freelancer) começou em 28/08/2026. Como a data de admissão atual (28/08) é posterior ao dia do adiantamento da unidade (dia 15), a tela entende que em agosto ela não teria adiantamento — mas o recibo importado é do vínculo anterior, que existia normalmente naquele mês. Resultado: documento correto acusado como inconsistente.

## O que muda

### 1. Rescisão em um único lugar
A cobrança de rescisão passa a vir apenas da lista oficial de Pendências, igual a contracheque, adiantamento e ponto. A conferência da tela para de gerar a sua própria cobrança de rescisão. Nada muda no texto, no prazo, no atraso nem no link de importação — só deixa de repetir.

### 2. Opção de adiantamento acompanha o vínculo
- Ao registrar o desligamento, a opção pelo adiantamento é encerrada na data do desligamento.
- Ao registrar um novo vínculo (recontratação) no mesmo cadastro, a opção não é herdada: fica desativada e o gestor (ou o colaborador, pelo portal) ativa novamente com a data do novo contrato.
- O histórico de todas as ativações e cancelamentos continua preservado — nada é apagado, os registros antigos seguem valendo para as competências antigas.
- A conferência dos documentos passa a olhar o vínculo daquela competência, e não apenas a admissão atual: documento do vínculo encerrado no mês deixa de ser tratado como inconsistente.

### 3. Caso da Cristiane
Com a regra acima aplicada ao histórico existente (CLT até 27/08/2026, freelancer desde 28/08/2026), o recibo de agosto volta a ser considerado correto e o alerta desaparece. Registro de cancelamento na data do desligamento e o novo vínculo sem adiantamento serão gravados no histórico dela, sem apagar nada.

## Detalhes técnicos

- `src/components/dp/documentos/DocConsistenciaPanel.tsx`: incluir `rescisao` em `TIPOS_DA_FONTE_UNICA` (remove o grupo duplicado gerado localmente); a elegibilidade de `adiantamento`/`contracheque` por competência passa a usar o vínculo vigente naquela competência (`dp_colaborador_historico_condicoes`) em vez de `data_admissao`/`data_desligamento` atuais.
- `src/lib/dp/pendencias-documentos.ts`: helper para resolver admissão/desligamento efetivos da competência a partir do histórico de vínculos; `elegivelDocumento` passa a aceitar esses limites, mantendo o comportamento atual quando não há histórico.
- `src/lib/dp/adiantamento-opcao.ts`: helper para fechar a opção no fim do vínculo e não herdar no vínculo novo (`novo_contrato`).
- Migration isolada e reversível: trigger/RPC que, ao gravar desligamento, insere solicitação `cancelar` com competência de efeito do mês do desligamento (idempotente, sem duplicar se já existir), e ao abrir vínculo `novo_contrato` mantém a opção desligada até nova solicitação. Auditoria em `audit_logs`.
- Correção pontual do histórico da Cristiane via RPC/dados (inserir `cancelar` com efeito em 2026-08 e deixar o vínculo atual sem opção), sem alterar documentos nem apagar registros.
- Testes: rescisão sem duplicidade; adiantamento de competência coberta por vínculo encerrado não é inconsistente; opção não herdada na recontratação; idempotência do cancelamento automático.
- Validação: `bunx vitest run`, `bunx tsgo --noEmit -p tsconfig.app.json`, ESLint. Nada publicado.
