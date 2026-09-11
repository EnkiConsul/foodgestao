# Risco de dobra com 90 dias + gestos de arrasto no mobile

## 1. Aviso de risco de dobra 90 dias antes

Hoje o aviso "risco de dobra" só aparece quando faltam 30 dias ou menos para o prazo legal do período mais antigo. Passa a valer a regra pedida:

- Com **180 dias** para o fechamento do segundo período sem as férias do primeiro tiradas: aviso amarelo de **acompanhamento** ("Férias a conceder — acompanhar"), para o gestor já programar.
- Com **90 dias**: vira aviso vermelho de **risco de dobra**, urgente, no topo das pendências.
- Sem período anterior em aberto, segue como hoje: "A conceder", depois "Atenção" nos últimos 30 dias.
- Depois do prazo legal, continua "Férias vencidas — pagamento em dobro".
- Sócio segue fora da regra.

Efeito prático na Pakerê: o Erildson (período 01/10/2024–30/09/2025, prazo 30/09/2026) já aparece como urgente, e casos parecidos passam a aparecer desde 90 dias antes, não só no último mês.

Nas telas de Férias e Pendências o item continua com o selo vermelho "Urgente — risco de dobra" e entra na contagem de ação imediata, acima dos itens futuros.

## 2. Arrastar da direita para a esquerda: menu das telas

- Em Pessoas 360° e no Portal do Colaborador, arrastar da borda direita para a esquerda abre a página **Mais** (todas as telas do módulo) — como já funciona hoje.
- No Portal do Colaborador, partindo da **tela inicial**: primeiro arrasto abre Mais; estando em Mais, um novo arrasto abre **Meus documentos** (histórico de documentos e recibos).
- Em qualquer outra tela do portal, o arrasto da direita apenas abre Mais, e o arrasto da esquerda continua voltando.

## 3. Arrastar da esquerda para a direita: Hub ou Analytics

Somente na navegação do módulo Pessoas 360°:

- Em telas internas, continua **voltando** para a tela anterior (nada muda).
- Estando na **tela inicial** do módulo:
  - se a empresa tiver mais de um módulo ativo, abre o **Hub de módulos**;
  - se tiver apenas um módulo, abre o **Analytics de Pessoas**.

Nos outros módulos (Financeiro, Backoffice, Conta) o gesto segue como hoje.

## Detalhes técnicos

- `src/lib/dp/ferias-direito.ts`: `nivelVencimentoPeriodo` e `alertaPendenciaFerias` recebem uma janela de risco configurável (`janelaRiscoDias`, 30 por padrão, 90 quando há período anterior em aberto); atualizar o texto de `FERIAS_EXPLICACAO_DOBRA`.
- `src/hooks/useDpPendencias.tsx`: ampliar a consulta de `dp_ferias_periodos` para conhecer todos os períodos do colaborador (inclusive `em_aquisicao`), marcar acúmulo quando existir período mais antigo com saldo, passar a janela de 90 dias e manter `urgente` para `nivel === "atencao"`.
- Telas de Férias que usam `nivelVencimentoPeriodo` (dashboard/listas) recebem o mesmo sinalizador para não divergir do painel inicial.
- `src/hooks/useEdgeGestures.ts`: manter borda/limiares atuais; no gesto esquerda→direita, quando `pathname === homeTo` e o módulo ativo for `dp`, navegar para `/hub` ou `/dp/analytics` conforme a contagem de módulos ativos (`useCompanyModules`); no gesto direita→esquerda em `portal_colaborador`, encadear home → `/dp/meu/mais` → `/dp/meu/documentos`.
- Testes: novos casos em `src/lib/dp/__tests__` para a janela de 90 dias com acúmulo e para o destino de cada gesto (função pura de decisão extraída do hook).
- Sem mudanças no banco de dados.
