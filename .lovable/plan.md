# Convocações: antecedência de 3 dias, várias datas e convocação aberta

Hoje a tela de Convocações cria uma convocação por vez (um colaborador, uma data) e só aceita vínculo intermitente. Não existe registro de antecedência, nem convocação aberta, nem seleção de várias datas.

## 1. Regra de antecedência (3 dias corridos)

- Antecedência = data da prestação − data de criação, em dias corridos.
- Menos de 3 dias = fora do prazo padrão. Nunca bloqueia o envio.
- Vale para intermitentes e freelancers (freelancers passam a ser convocáveis).
- Quando o gestor tentar enviar fora do prazo, abre um diálogo de confirmação consciente:

```text
Convocação com antecedência inferior ao prazo padrão

Esta Convocação está sendo enviada com menos de 3 dias corridos
de antecedência. Para trabalhadores intermitentes, o prazo legal
previsto é de pelo menos 3 dias corridos.

Você pode continuar, mas esta Convocação ficará registrada como
realizada fora do prazo padrão.

[ Voltar e ajustar a data ]   [ Continuar mesmo assim ]
```

- "Voltar e ajustar" fecha o alerta e não cria nada.
- "Continuar mesmo assim" envia e marca a exceção.

## 2. Várias datas na mesma convocação (mensal)

- No formulário, além da data única, permitir selecionar várias datas (calendário multi-seleção) com o mesmo horário/turno.
- Cada data vira uma convocação independente e a antecedência é avaliada por data.
- Antes de enviar, resumo: "2 das 5 datas selecionadas possuem antecedência inferior a 3 dias", com marcação por data (dentro/fora do prazo) e ações [ Revisar datas ] / [ Continuar com as 5 datas ].
- A exceção é registrada apenas nas datas afetadas.

## 3. Convocação aberta

- Nova convocação sem colaborador definido: publicada para os elegíveis (intermitentes e freelancers ativos da unidade), quem aceitar primeiro assume a vaga.
- Quantidade de vagas configurável (padrão 1). Ao preencher as vagas, as demais respostas são recusadas com aviso claro.
- Mesma regra de antecedência: o alerta aparece uma única vez antes de publicar; ao confirmar, a exceção é registrada na convocação aberta e herdada pelas ocorrências geradas.

## 4. Visualização administrativa

- No detalhe/lista, indicador discreto ao lado do status: `⚠ Enviada com antecedência inferior a 3 dias` (tooltip com a antecedência calculada, quem confirmou e quando).
- O status principal continua sendo aguardando / aceita / recusada / cancelada / expirada.
- Filtro opcional na tela: "somente fora do prazo de antecedência".

## 5. Portal do trabalhador

- Nenhuma mudança de fluxo: Aceitar / Recusar seguem iguais, sem linguagem jurídica sobre a exceção.
- Convocações abertas aparecem como oferta disponível ("vaga aberta"), com aviso quando as vagas já foram preenchidas.

## Detalhes técnicos

**Banco (migração)**
- `dp_convocacoes`: `antecedencia_dias int`, `fora_prazo_antecedencia boolean not null default false`, `confirmado_fora_prazo_por uuid`, `confirmado_fora_prazo_em timestamptz`.
- `colaborador_id` passa a aceitar nulo (convocação aberta) + `vagas int default 1`, `tipo` (`individual` | `aberta`), `aceita_por_colaborador_id`.
- Trigger `BEFORE INSERT/UPDATE`: calcula `antecedencia_dias` e `fora_prazo_antecedencia` no servidor a partir de `data` e `now()`; se estiver fora do prazo, exige a flag de confirmação enviada pelo cliente e grava `confirmado_fora_prazo_por = auth.uid()` e `confirmado_fora_prazo_em = now()` — o frontend não pode falsificar usuário, timestamp nem o status de exceção. Sem confirmação, o insert é rejeitado.
- Registro na auditoria (`audit_logs`) da exceção, com convocação, data da prestação e antecedência.
- GRANTs/RLS mantidos no padrão atual da tabela; políticas ajustadas para leitura de convocação aberta pelos elegíveis.

**Domínio (`src/lib/dp/convocacoes.ts`)**
- `ANTECEDENCIA_PADRAO_DIAS = 3`, `antecedenciaDias(data, agora)`, `foraDoPrazo(...)`, `resumoAntecedencia(datas[])`.
- `podeConvocar` passa a aceitar `freelancer` via `contrato-policy.ts` (novo campo `podeSerConvocado`, verdadeiro para intermitente e freelancer).

**UI**
- `src/pages/dp/DpConvocacoes.tsx`: seleção de várias datas, tipo individual/aberta, resumo de antecedência, selo `⚠ fora do prazo` e filtro.
- Novo `src/components/dp/ConvocacaoAntecedenciaDialog.tsx` (alerta + confirmação, versão única e versão resumo múltiplo).
- `src/hooks/useDpConvocacoes.tsx`: envio em lote, flag de confirmação, convocação aberta e aceite com disputa de vagas.
- Portal (`DpMinhasConvocacoes.tsx`): ofertas abertas, sem menções à exceção.

**Testes (`src/lib/dp/__tests__/convocacoes.test.ts` + novos)**
- 3 dias ou mais: sem alerta.
- Menos de 3 dias: alerta, sem envio antes da confirmação, envio após confirmar, exceção registrada.
- Cancelar no alerta: nada publicado.
- Várias datas: contagem correta de exceções e marcação só nas datas afetadas.
- Segurança: insert fora do prazo sem confirmação é rejeitado; confirmação/usuário vêm do servidor.
