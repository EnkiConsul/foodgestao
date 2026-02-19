

## Corrigir Layout da Tabela de Lancamentos

### Problema
As linhas da tabela de lancamentos estao crescendo verticalmente quando o conteudo das colunas tem muitos caracteres, quebrando o layout visual.

### Solucao
Aplicar `table-fixed` na tabela e garantir que todas as celulas com texto tenham truncamento (`truncate`) e larguras maximas definidas, impedindo que o conteudo force o crescimento da linha.

### Alteracoes Tecnicas

**Arquivo: `src/pages/Lancamentos.tsx`**

1. **Tabela com layout fixo**: Adicionar a classe `table-fixed` ao componente `<Table>` para que as colunas respeitem as larguras definidas nos headers.

2. **Ajustar larguras dos headers (`<TableHead>`)**: Definir larguras proporcionais e adequadas para cada coluna:
   - Data: `w-[75px]`
   - Descricao: sem largura fixa (ocupa o espaco restante)
   - D/C: `w-[40px]`
   - Categoria: `w-[110px]`
   - Conta: `w-[110px]`
   - Forma Pgto: `w-[100px]`
   - Valor: `w-[95px]`
   - Status: `w-[85px]`
   - Vencimento: `w-[75px]`
   - Saldo: `w-[95px]`
   - Acoes: `w-[90px]`

3. **Truncamento nas celulas de dados (`<TableCell>`)**: Garantir que as celulas de Descricao, Categoria, Conta e Forma de Pagamento tenham `truncate`, `overflow-hidden` e `max-w-0` (truque para `table-fixed` respeitar truncamento).

4. **Celula de Descricao**: Alterar o container interno de `max-w-[200px]` para `min-w-0 w-full` com `truncate` no span, permitindo que ocupe todo o espaco disponivel e trunque adequadamente.

5. **Celulas de Categoria, Conta e Forma Pgto**: Substituir `max-w-[100px]` por `overflow-hidden` e adicionar um `<span>` interno com `truncate block` para garantir o corte do texto.

Essas mudancas garantem que todas as linhas da tabela mantenham uma altura uniforme, independente do tamanho do conteudo, com texto longo sendo cortado com reticencias (`...`).
