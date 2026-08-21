# Realocar Sindicatos: Patronal em Unidades, Laboral em Cargos e Salários

Faz sentido. Sindicato patronal representa a empresa/unidade, e sindicato laboral representa a categoria dos cargos — cada um passa a ser cadastrado onde já é usado, e a tela isolada de Sindicatos deixa de existir.

Nada de funcionalidade se perde: continua sendo a mesma tabela e os mesmos vínculos, então piso salarial por unidade, enquadramento do cargo, adicional por tempo de serviço, isonomia e ACT/CCT (Documentos) seguem funcionando sem alteração.

## O que muda para o usuário

**Unidades** ganha uma aba "Sindicatos Patronais"
- Lista os sindicatos patronais da empresa com CNPJ, WhatsApp e quantas unidades cada um representa.
- Cadastrar/editar com seleção de unidades representadas — o mesmo sindicato pode ser marcado em várias unidades, exatamente como hoje.
- Ao editar uma unidade, o vínculo com o sindicato patronal continua acessível de dentro da própria unidade.

**Cargos e Salários** ganha uma aba "Sindicatos Laborais" (5ª aba, junto de Cargos, Complementos Salariais, Turnos e Documentos Obrigatórios)
- Mesmo formulário e funcionalidades de hoje: nome, CNPJ, WhatsApp, cargos representados, editar, excluir, abrir WhatsApp.

**Menu de Cadastro** passa de 6 para 5 itens: Colaboradores, Unidades, Cargos e Salários, Benefícios, Pendências.

**ACT/CCT (Negociações)** continua onde está, em Documentos, sem mudança.

## Detalhes técnicos

- Extrair o conteúdo de `src/pages/dp/DpSindicatos.tsx` em dois painéis reaproveitando a lógica existente (`useDpSindicatos`, `useUpsertDpSindicato`, `useDeleteDpSindicato`, vínculos em `dp_sindicato_unidades` / `dp_sindicato_cargos`):
  - `src/components/dp/unidades/SindicatosPatronaisPanel.tsx` (filtro `tipo = patronal`, seleção de unidades)
  - `src/components/dp/cargos/SindicatosLaboraisPanel.tsx` (filtro `tipo = laboral`, seleção de cargos)
  - Um componente compartilhado de formulário para evitar código duplicado.
- `src/pages/dp/DpUnidades.tsx`: introduzir abas (`?aba=unidades|sindicatos`) no mesmo padrão de `DpCargos.tsx`, mantendo a listagem atual na primeira aba.
- `src/pages/dp/DpCargos.tsx`: adicionar a aba `sindicatos` ao conjunto já controlado por query string.
- `src/App.tsx`: `/dp/cadastros/sindicatos` passa a redirecionar para `/dp/cadastros/unidades?aba=sindicatos`; os redirects legados existentes seguem apontando para o novo caminho. Remover o lazy import de `DpSindicatos`.
- `src/config/dpNavigation.tsx`, `src/pages/dp/DpCadastrosHub.tsx`, `src/components/dp/favoritablePages.ts`: remover o item Sindicatos e ajustar descrições; registrar as duas abas como páginas favoritáveis.
- Deletar `src/pages/dp/DpSindicatos.tsx` depois da migração.
- Sem migração de banco. Nenhuma alteração em `useSindicatoDoCargo`, `useSindicatoContextoUnidade`, `cargoSalarios`, `tempoServico` ou isonomia.
- Títulos em Title Case, conforme o padrão do sistema.
