# Convocações — Fase 3B: motor funcional de backend

Inclui, como primeiro item, o registro formal do baseline técnico (o modo de planejamento bloqueia a escrita da memória agora; ela é gravada assim que o plano for aprovado).

## 0. Registrar o baseline técnico pré-3B

Gravar em memória do projeto, como referência (nenhuma correção de débito nesta etapa):

- Build: `npm run build` exit 1 apenas pelo `prebuild` do security-lint — 229 críticos + 255 warnings pré-existentes, nenhum atribuído à 3A.1/3A.1.1; `npx vite build` exit 0.
- Testes: 98 arquivos (92 ok, 2 falhos, 4 skipped) · 960 testes (912 ok, 2 falhos, 46 skipped). Falhas pré-existentes: `orders-domain.test.ts` e `orders-entitlement.test.ts`. Nenhuma em DP/Convocações.
- Lint: 1414 problemas (6 erros + 1408 warnings).
- TypeScript strict: 46 erros, todos pré-existentes, nenhum em Convocações.
- Regra: usar estes números para separar débito antigo de regressão; não corrigir esses débitos dentro de Convocações, salvo se a própria fase tocar o arquivo/regra.

Status das fases após isso: 3A.0 encerrada · 3A.1 encerrada · 3A.1.1 aprovada e encerrada · **3B em execução** · Fase 4 (frontend/cutover) depois.

## 1. Escopo da 3B

Somente backend, sobre a fundação já aplicada. Nenhuma tela nova, nenhum arquivo de frontend alterado, nenhuma remoção do fluxo legado (a tela e o Portal atuais continuam funcionando exatamente como hoje).

Regra estrutural mantida da Fase 2: **na 3B o trigger `dp_convocacao_sync_escala` continua sendo o único mecanismo de sincronização de escala**. As RPCs novas alteram `dp_convocacoes` e deixam o trigger sincronizar. A função interna de domínio é escrita e testada, mas só passa a ser chamada no cutover, quando o trigger sai.

## 2. Motor a construir (RPCs `SECURITY DEFINER`, escrita RPC-only)

Todas revalidam autorização (admin/owner da empresa, ou o próprio colaborador quando aplicável), derivam `company_id` no servidor, ignoram qualquer empresa vinda do cliente, registram evento em `dp_convocacao_eventos` e são idempotentes por natureza da transição.

**Planejamento**
- Criar/editar grupo e ocorrências em rascunho (necessidade, horário ofertado, vagas, condições comuns).
- Revisar ocorrência publicada: nova versão como sucessora única, anterior marcada como revisada, na mesma transação com bloqueio da anterior.
- Configuração por empresa/unidade, lida sempre por `dp_convocacao_config_resolvida`.

**Publicação**
- Resolve o timezone no backend e aborta com `TIMEZONE_NAO_CONFIGURADO` se não houver (fail closed).
- Calcula `inicio_previsto`/`fim_previsto`, `encerramento_operacional`, `prazo_resposta_base` (1 dia útil, seg–sex) e `antecedencia_dias`.
- Antecedência mínima de 3 dias: se violada, marca `fora_antecedencia` e **exige justificativa e confirmação do gestor** — alerta e registro, nunca bloqueio.
- Gera as ofertas em `dp_convocacoes` com `regime_snapshot`, `remuneracao_snapshot`, `timezone_snapshot`, `origem` e `compatibilidade` (`integral` ou `incompativel`), respeitando indisponibilidades e regimes convocáveis (intermitente e freelancer).

**Resposta e vagas**
- Aceite atômico: bloqueio da ocorrência, contagem de ocupantes, respeito a `vagas`, e Opção A — no máximo uma alocação ativa por colaborador/data. Ao preencher a última vaga, a ocorrência vai a `preenchida` e as ofertas pendentes concorrentes são encerradas com motivo próprio.
- Recusa, desistência após aceite, cancelamento pelo empregador e substituição (sucessora vinculada por `substitui_convocacao_id`/`substituida_por_id`, sempre na mesma empresa).
- Descumprimentos gerados pelo motor conforme a análise: sem justo motivo em regime intermitente grava referência de 50% (bilateral, colaborador ou empregador); `sem_resposta` continua sendo estado operacional, não descumprimento.

**Indisponibilidade**
- Marcar e cancelar por RPC (colaborador ou gestor), encerrando na mesma transação as ofertas pendentes do dia e registrando evento.

**Encerramentos automáticos**
- Rotina de encerramento por prazo/início: `sem_resposta` quando o prazo de referência vence, `encerrada_inicio_ocorrencia` quando o início chega antes do fim do prazo. Idempotente e segura para rodar repetidamente.
- Registro de comparecimento (origem manual nesta fase).

## 3. Testes obrigatórios da fase

Executados em transação revertida, sem deixar registro:

- Concorrência de aceite: duas sessões disputando a última vaga — exatamente um aceite, sem overbooking.
- Opção A: segundo aceite do mesmo colaborador na mesma data recusado.
- Publicação sem timezone: aborta; com antecedência menor que 3 dias: publica marcando fora do prazo apenas com justificativa.
- Prazo de 1 dia útil atravessando fim de semana.
- Sincronização de escala: exatamente uma alteração de item por transição lógica.
- Multiempresa: repetição dos cenários negativos da 3A.1.1 pelas novas RPCs.
- Regras de 50% e fluxos de desistência/cancelamento/substituição.
- Fluxo legado intacto: tela e Portal atuais continuam operando sem erro.

## 4. Critério de encerramento da 3B

Motor completo, coberto por testes, com banco sem registros artificiais, fluxo legado funcionando e nenhuma regressão em relação ao baseline do item 0. Frontend, Portal novo, remoção do trigger e índices finais ficam para o cutover da Fase 4.

## Notas técnicas

- Migrations incrementais, uma por bloco funcional (planejamento, publicação, resposta/vagas, indisponibilidade, encerramentos, função interna de escala), cada uma validada isoladamente.
- Grants: `EXECUTE` apenas para `authenticated` nas RPCs de uso do app; funções internas de domínio sem `EXECUTE` para `authenticated`/`anon`; tabelas seguem sem DML direto.
- `dp_convocacoes_respond_self` e o trigger legado permanecem intactos nesta fase.
- Nenhum arquivo de frontend é alterado; `src/integrations/supabase/types.ts` é regenerado automaticamente após as migrations.
