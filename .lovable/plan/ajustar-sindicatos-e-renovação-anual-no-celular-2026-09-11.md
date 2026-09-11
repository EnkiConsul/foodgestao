# Ajustar sindicatos e renovação anual no celular

## Objetivo
Organizar a aba de sindicatos em telas pequenas e evitar o preenchimento repetitivo ao cadastrar a negociação do ano seguinte.

## Alterações

1. **Navegação mobile da unidade**
   - Substituir a grade apertada de cinco abas por uma faixa horizontal rolável no celular, mantendo todas as opções legíveis e sem sobreposição.
   - Manter a apresentação atual em telas maiores.

2. **Conteúdo da aba Sindicato**
   - Ajustar cartões, textos e botões para a largura do celular.
   - Empilhar ações quando necessário, evitar cortes e preservar uma área de toque confortável.
   - Organizar o formulário de nova negociação com conteúdo rolável e ações sempre acessíveis, sem ultrapassar a altura da tela.

3. **Pré-preenchimento da nova negociação**
   - Ao tocar em “Nova Negociação”, localizar a negociação mais recente da unidade.
   - Preencher automaticamente o sindicato patronal, o sindicato laboral e o mês-base usados nela.
   - Sugerir como ano-base o ano seguinte ao último registro; se não houver histórico, manter o ano e mês atuais.
   - Não reaproveitar o PDF anterior: o novo arquivo continuará obrigatório.
   - Permitir que o gestor altere qualquer valor sugerido antes de cadastrar.

4. **Validação**
   - Cobrir os cenários com histórico e sem histórico.
   - Conferir no celular a aba Sindicato, o cadastro da negociação e os botões inferiores.
   - Garantir que edição, upload, exclusão e aplicação aos cargos continuem funcionando como hoje.

## Detalhes técnicos
- A lista já é ordenada da negociação mais recente para a mais antiga; ela será a fonte do preenchimento inicial.
- A mudança será apenas no formulário e na apresentação, sem alteração de permissões ou estrutura dos dados.
