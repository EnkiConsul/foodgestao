# Ajustes de navegação no celular (4 telas)

Correções apenas visuais/de layout no celular. Nenhuma regra de negócio, permissão ou salvamento muda.

## 1. Convocações — abas embaralhadas

As abas (Próximas, Aguardando, Aprovações, Confirmadas, Realizadas, Histórico, Disponibilidade, Planejamento, Regras) quebram em várias linhas dentro de uma faixa de altura fixa, então uma linha fica escrita por cima da outra e cobre o título do card.

- A faixa das abas passa a crescer conforme as linhas, com espaçamento entre elas, ficando legível no celular e igual ao atual no computador.
- Cada aba com área de toque confortável.

## 2. Mensagens — tela desalinhada / arrasta para o lado

Os títulos longos dos modelos (por exemplo "Modelo padrão — novo acesso Portal Colaborador") esticam o cartão além da largura da tela, empurrando a página inteira para o lado.

- Título passa a ser cortado com "…" dentro do cartão, sem esticar a tela.
- Os três botões (duplicar, editar, excluir) ganham área de toque maior no celular.
- Fim do arraste lateral da página.

## 3. Cadastrar Atestado e Cadastrar Registro Disciplinar

Formulários muito longos e com campos que aparecem "crus" no celular.

- Espaçamento entre campos reduzido no celular (mantido no computador), diminuindo a rolagem.
- Campo de arquivo com aparência de botão do sistema ("Selecionar arquivo" + nome do arquivo escolhido), no lugar do controle padrão do navegador.
- Campos curtos (data, dias de afastamento) em duas colunas a partir de telas médias.
- Botão de enviar sempre alcançável, sem ficar escondido atrás do menu inferior.

## 4. Menu inferior cobrindo o fim das telas

Aumento da folga no fim do conteúdo no celular, para o último campo/botão não ficar por baixo do menu Hub/Operação/Importar/Mais.

## Detalhes técnicos

- `src/pages/dp/DpConvocacoes.tsx`: `TabsList` com `h-auto flex-wrap gap-1 p-1` (remove o `h-10` fixo herdado) e triggers com altura mínima de toque.
- `src/pages/dp/DpMensagens.tsx`: adicionar `min-w-0` no cartão do grid (item de grid tem `min-width: auto`, o que anula o `truncate` interno) e `min-h-10 min-w-10` nos botões de ação em telas pequenas.
- `src/pages/dp/DpAtestados.tsx` e `src/pages/dp/DpDisciplinar.tsx`: `space-y-4` → `space-y-3 sm:space-y-4`; agrupar data/dias em `grid gap-3 sm:grid-cols-2`; substituir o `Input type="file"` visível por input oculto + `Button variant="outline"` com nome do arquivo (mesmo `ref`/`accept`/handler atuais).
- `src/components/dp/DpShell.tsx`: `pb-24` → `pb-28` no `main` mobile (mantendo `md:pb-8`).
- Verificação: `tsgo --noEmit`, suíte de testes do DP e captura Playwright em 407×748 confirmando ausência de rolagem horizontal e abas sem sobreposição.
