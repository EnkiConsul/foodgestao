# Pessoas 360° — Revisão mobile completa

## O problema da aba Dados (causa confirmada)

No cadastro do colaborador, o bloco de campos usa uma grade de 1 coluna no celular e 2 colunas no desktop, mas vários campos estão marcados para "ocupar 2 colunas" **sem** restringir isso ao desktop. No celular esses campos tentam ocupar uma coluna que não existe e vazam por cima dos vizinhos — é exatamente o efeito de campos encavalados que você viu.

O mesmo padrão aparece em outros pontos do módulo (Remuneração, Adicional por tempo de serviço, aviso de isonomia, enquadramento sindical, cadastro de unidade, perfil do colaborador no portal e Sindicatos).

## O que será feito

### 1. Corrigir o encavalamento (prioridade)
- Ajustar todos os campos "largura dupla" para só ocuparem 2 colunas a partir do tablet/desktop.
- Revisar a aba Dados campo a campo no celular: rótulos, alturas de toque (mínimo 44px), campos de CPF/telefone/data sem quebra, blocos de "Acesso ao portal" e "Desligamento" empilhados corretamente.
- Aplicar a mesma correção nas abas Remuneração, Horário de Trabalho, Dependentes e Documentos.

### 2. Padronizar o cabeçalho e as abas do cadastro
- Abas com rolagem horizontal e indicador de que há mais abas à direita.
- Cabeçalho e rodapé fixos, com o botão salvar sempre visível no celular (diálogo em tela cheia).

### 3. Adotar os padrões mobile já criados em todo o módulo
Os componentes-base existem, mas quase não estão em uso. Serão aplicados nas telas do Pessoas 360° (admin e portal):
- Indicadores/KPIs → cartões padronizados em 2 colunas no celular, sem números cortados.
- Filtros → busca sempre visível e demais filtros em painel deslizante inferior.
- Abas → faixa rolável padronizada.
- Diálogos e formulários → tela cheia no celular, com cabeçalho/rodapé fixos.

### 4. Varredura tela por tela
Revisão em 407px de todas as telas do módulo (Colaboradores, Cargos, Unidades, Folgas, Escala do Mês, Operação do Dia, Ponto, Apuração, Folha, Provisões, Rescisões, Benefícios, Atestados, Documentos, Comunicação, Sindicatos, Configurações e todo o Portal do Colaborador), corrigindo:
- grades fixas de 3+ colunas que apertam campos;
- textos e valores truncados ou sobrepostos;
- rolagem horizontal na página;
- botões pequenos demais para o toque;
- tabelas remanescentes sem versão em cartões.

### 5. Verificação
- Checagem automatizada em 407px de cada rota do módulo: sem rolagem horizontal, sem sobreposição de elementos e sem erros de console.
- Captura de tela das telas principais antes/depois.

## Detalhes técnicos

- Causa raiz: `col-span-2` aplicado sem prefixo responsivo dentro de contêineres `grid-cols-1 md:grid-cols-2` (ex.: `src/components/dp/ColaboradorFormDialog.tsx` linhas 1518, 1727, 1740, 1750, 1888, 1905). Correção: `md:col-span-2` (ou `sm:` conforme o contêiner) em todos os arquivos afetados: `ColaboradorFormDialog.tsx`, `RemuneracaoFields.tsx`, `AdicionalTempoServicoCard.tsx`, `BeneficioIsonomiaAviso.tsx`, `SindicatoEnquadramentoField.tsx`, `UnidadeFormDialog.tsx`, `pages/dp/DpSindicatos.tsx`, `pages/dp/portal/DpMeuPerfil.tsx`.
- Adoção de `DpStatCard`/`DpStatGrid`, `DpFilters`, `DpTabsBar` e `DpDialogShell` (hoje praticamente sem uso) nas páginas de `src/pages/dp/**`.
- Nenhuma alteração de regra de negócio, cálculo ou banco de dados — somente camada de apresentação.
- Validação com script Playwright em viewport 407x748 medindo `scrollWidth`, colisão de bounding boxes em formulários e erros de console por rota.

## Fora de escopo

Módulos Financeiro e Pedidos, redesenho visual/identidade e mudanças de funcionalidade.
