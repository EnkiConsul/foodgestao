

# Configurar Colunas da Tabela de Lancamentos

## O que sera feito

Adicionar um botao de configuracao (icone de engrenagem) ao lado do cabecalho da tabela que abre um popover permitindo ao usuario escolher quais colunas deseja exibir na tabela de lancamentos. A preferencia sera salva no localStorage para persistir entre sessoes.

## Colunas configuraveis

As seguintes colunas poderao ser mostradas/ocultadas pelo usuario:

| Coluna      | Visivel por padrao | Pode ocultar |
|-------------|-------------------|--------------|
| Data        | Sim               | Nao (sempre visivel) |
| Descricao   | Sim               | Nao (sempre visivel) |
| D/C         | Sim               | Sim |
| Valor       | Sim               | Nao (sempre visivel) |
| Status      | Sim               | Sim |
| Vencimento  | Sim               | Sim |
| Saldo       | Sim               | Sim |
| Acoes       | Sim               | Nao (sempre visivel) |

## Como ficara visualmente

- Um botao com icone `SlidersHorizontal` ou `Settings2` posicionado proximo ao botao de exportar CSV, na barra de acoes da pagina
- Ao clicar, abre um `Popover` com uma lista de checkboxes para cada coluna configuravel
- As colunas obrigatorias (Data, Descricao, Valor, Acoes) aparecem desabilitadas e sempre marcadas

## Detalhes Tecnicos

### Arquivo: `src/pages/Lancamentos.tsx`

1. **Estado de colunas visiveis**: Criar um estado `visibleColumns` com tipo `Record<string, boolean>`, inicializado a partir do `localStorage` (chave `lancamentos_columns`). Colunas: `dc`, `status`, `vencimento`, `saldo`.

2. **Persistencia**: Sempre que `visibleColumns` mudar, salvar no `localStorage`.

3. **Botao + Popover**: Adicionar um botao com `Popover` na barra de acoes (proximo ao botao CSV/Exportar). Dentro do popover, listar checkboxes para cada coluna configuravel.

4. **Renderizacao condicional**: No `TableHeader` e no `TableBody`, envolver cada `TableHead`/`TableCell` das colunas configuraveis com `{visibleColumns.coluna && (...)}`.

5. **ColSpan dinamico**: Calcular o `colSpan` do "SALDO ANTERIOR" e "Nenhum registro" dinamicamente com base no numero de colunas visiveis.

6. **Import adicional**: Importar `Settings2` do lucide-react.

