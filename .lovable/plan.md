# Convocações — Adendo final da Fase 2

Duas correções incorporadas. O restante da Fase 2 permanece como aprovado.

## A. Prazo de resposta: 1 dia útil preservado

- A regra de produto continua sendo **1 dia útil**. Nada de 24 horas: `prazo_resposta_horas` sai do desenho e `prazo_resposta_uteis = 1` volta a ser o único parâmetro.
- Os dois conceitos seguem separados: **prazo de resposta de referência** (1 dia útil, nunca encurtado) e **encerramento operacional** (início da oferta). Se o início vier antes do fim do prazo, a oferta termina como `encerrada_inicio_ocorrencia` — nunca como `sem_resposta`.
- A ausência de calendário é tratada como **lacuna de infraestrutura**, não como licença para aproximar a regra.

**Dependência técnica da 3A — calendário corporativo central**, reutilizável por Convocações, Jornada, Ponto, Escala, Apuração e Folgas. Escopo mínimo, sem virar módulo de feriados e **sem** tabela exclusiva de Convocações:

```text
dp_calendario_dias_nao_uteis
  company_id · data · tipo (feriado_nacional|estadual|municipal|ponto_facultativo|fechamento)
  abrangencia: empresa inteira ou unidade(s) específicas
  descricao · criado_por · timestamps
  UNIQUE por empresa + data + abrangência
```
Duas funções autoritativas no banco, únicas para toda a plataforma:
```text
dp_e_dia_util(company_id, unidade_id, data)      → boolean   (sábado, domingo e não úteis)
dp_proximo_dia_util(company_id, unidade_id, data, n) → date
```
Sábado/domingo vêm da própria função (parametrizáveis por configuração da empresa, para casos em que sábado é útil); feriados vêm da tabela. **Sem dependência de API externa em tempo real** para decidir aceite — a decisão é sempre local ao banco. Antes de criar a tabela, a 3A apresenta o desenho e confirma se alguma estrutura já existente pode ser reaproveitada (a auditoria atual mostrou que `dp_datas_bloqueadas` é bloqueio de folgas e `dp_config_dp.politica_feriado` é só política de tratamento — nenhuma serve como fonte).

**Se na 3A a fonte de feriados não puder ser fechada com segurança, PARO nesse item** e apresento a decisão necessária, sem aproximação silenciosa. Todo o resto da 3A/3B que não depende do cálculo de dia útil segue normalmente.

## B. Sincronização da escala: um mecanismo por etapa

A estratégia "RPC sincroniza + flag de sessão bloqueia o trigger" está **removida do plano**. Princípio adotado: **em cada etapa, apenas um mecanismo é responsável pela sincronização.**

```text
3A  → trigger dp_convocacao_sync_escala é o ÚNICO mecanismo. RPCs novas ainda não sincronizam.
      Legado (tela + Portal atuais) intacto.

3B  → RPCs novas completas e testadas, mas NÃO chamam sincronização.
      Elas alteram dp_convocacoes e o trigger — adaptado de forma compatível para os novos
      estados (aceita, desistida, substituida, cancelada, encerradas) — faz a sincronização.
      Teste obrigatório: exatamente uma alteração de escala por transição lógica.

CUTOVER (com a Fase 4) → publica frontend e Portal novos, confirma uso das RPCs,
      as RPCs passam a chamar dp_convocacao_sync_escala_internal() explicitamente,
      o trigger é REMOVIDO na mesma migration, writes diretos revogados,
      dp_convocacoes_respond_self removida, NOT NULL e índices finais aplicados.
```
Nunca existe janela em que RPC explícita e trigger respondam pela mesma sincronização.

**`dp_convocacao_sync_escala_internal(...)`** — função interna de domínio extraída da lógica atual do trigger: não exposta ao frontend (sem EXECUTE para `authenticated`/`anon`), valida contexto, recebe só os dados necessários, roda na mesma transação da RPC, é idempotente e preserva a regra da V1 de **um item de escala por colaborador/data**. Na 3B ela pode existir já implementada e coberta por testes diretos, mas só passa a ser chamada pelas RPCs no cutover, quando o trigger sai.

---

Nada implementado: sem migration, tabela, coluna, índice, RPC, trigger, cron ou RLS. Com este adendo, considero a Fase 2 encerrada e aguardo sua autorização para a Fase 3.
