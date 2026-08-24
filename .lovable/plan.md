# Conciliação: tabela que cabe na tela, sem rolagem lateral

## Problema

Hoje a tabela do desktop soma larguras mínimas fixas (`min-w-[180px]`, `min-w-[160px]`, `min-w-[150px]`, `w-[180px]`, descrição até 280px) em 11 colunas. Em telas de ~1175px isso estoura o espaço e o cartão entra em `overflow-x-auto`, obrigando a rolar para o lado para ver Status e Ações.

## O que muda (UX/UI)

1. **Grade proporcional em vez de larguras mínimas**
   - A tabela passa a usar layout fixo com larguras em porcentagem, calculadas para somar 100% da largura disponível: seleção (~3%), Data (~7%), Descrição (~20%), Valor (~8%), Conta destino (~11%), Tipo (~10%), Categoria/contraparte (~13%), Forma de pagamento (~10%), Fornecedor/cliente (~11%), Status (~7%), Ações (~7%).
   - Todos os selects das células passam a `w-full` (sem `min-w`), truncando o texto com tooltip no valor completo — nenhum controle força largura maior que a coluna.

2. **Compactação visual para ganhar espaço sem perder informação**
   - Data em formato curto (`dd/MM/yy`) com data completa no tooltip.
   - Cabeçalhos mais curtos: "Categoria", "Forma pgto.", "Fornec./Cliente" (rótulo completo no `title`).
   - Coluna Ações: os três botões viram apenas ícones (Ignorar, Dividir, Confirmar) com `title`/`aria-label` — o texto "Confirmar" sai, o significado fica no tooltip.
   - Status: badges compactos, empilháveis dentro da coluna estreita.
   - Os botões auxiliares de "Editar cadastro" / "Cadastrar …" ficam como ícone + texto truncado dentro da largura da coluna.

3. **Adaptação por largura de tela (sem quebrar nada)**
   - Entre 1024px e 1279px, as colunas menos críticas (Tipo e Forma de pagamento) ficam mais estreitas; nada é escondido.
   - A partir de 1280px, a grade usa as proporções cheias descritas acima.
   - Abaixo de 1024px continua a visão em cartões já existente, inalterada.

4. **Rolagem lateral deixa de ser o padrão**
   - O `overflow-x-auto` permanece como rede de segurança para zoom alto ou fontes grandes, mas com a grade proporcional a tabela cabe na tela em uso normal.

## Detalhes técnicos

- Arquivo único: `src/pages/ConciliacaoPluggy.tsx` (bloco desktop `lg:block`, linhas ~1199–1503).
- `<table className="w-full table-fixed text-sm">` + `<colgroup>` com `style={{ width: "…%" }}` por coluna, fonte única das proporções.
- Remover `min-w-[…]` / `w-[180px]` dos `SelectTrigger` das células e usar `w-full` mantendo `[&>span]:truncate`.
- `max-w-[280px]` da célula de descrição sai (a largura passa a vir do `colgroup`).
- Sem mudança de lógica, dados, hooks ou estado — apenas apresentação.
