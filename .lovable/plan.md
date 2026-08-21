# Desligar Folha e Ponto + Benefícios por Escopo

## Resposta à dúvida
Sim: o mesmo benefício pode ser cadastrado mais de uma vez com parâmetros diferentes por unidade ou por cargo. O cadastro de benefícios já tem os campos de escopo (Unidade / Cargo) e o banco não impede nomes repetidos, então "Vale Refeição – Loja Centro" e "Vale Refeição – Cozinha" convivem com valores e regras próprios. O que falta é ficar claro na tela: hoje dá para criar dois iguais sem aviso e sem selo visível de qual escopo é qual.

## O que será feito

### 1. Benefícios por unidade/cargo mais claros
- No cadastro de benefícios, mostrar selo de escopo em cada item ("Empresa", "Unidade X", "Cargo Y").
- Agrupar na lista os benefícios com o mesmo nome, para enxergar as variações lado a lado.
- Botão "Duplicar para outro escopo": copia as regras do benefício e abre o formulário já com o mesmo nome, para só escolher a unidade/cargo e ajustar o valor.
- Aviso (não bloqueio) quando dois benefícios do mesmo nome cobrem o mesmo escopo, para evitar duplicidade acidental.

### 2. Remover tudo ligado a Folha de Pagamento e Ponto
Folha e Ponto ficam totalmente ocultos (código preservado, desativado), Escala continua ativa.

- Menu: retirar os grupos "Folha de Pagamento" (incluindo Provisões, Relatórios da Folha, Rescisões) e "Ponto" (Espelho, Ponto do Time, Apuração), além de "Registrar Ponto" e "Contracheque" no portal do colaborador.
- Rotas: as páginas de folha/ponto/rescisões/contracheque passam a redirecionar para o DP em vez de renderizar.
- Tela de Benefícios: remover o botão/seletor "Gerar na Folha", o campo "Lançar na folha como" no cadastro do benefício, a coluna/etiqueta "entra na folha" e ajustar o texto de apoio da página.
- Outras telas: remover cards, KPIs, atalhos, pendências e favoritos que apontem para folha ou ponto (home do DP, filtros, pendências, catálogo de módulos).
- Cadastros que hoje explicam impacto "na folha" (piso salarial, adicionais, benefícios) passam a falar em remuneração/valores, sem citar geração de folha.
- Documentos: mantém a importação de arquivos, incluindo as categorias Contracheque e Arquivos de Ponto, que continuam sendo o caminho para disponibilizar esses documentos ao colaborador (recebidos da contabilidade e do sistema de ponto).

### 3. Módulos comerciais
- Ponto e Folha saem da vitrine de módulos e das dependências; DP e Escala seguem.

## Detalhes técnicos
- `src/config/dpNavigation.tsx`: remover grupos `ponto`, `folha` e itens de portal `meu-ponto`/contracheque; ajustar `matchPrefixes` de `/dp/beneficios` para o grupo de cadastros; atualizar `mobileNav.parity.test.ts` e `favoritablePages.ts`.
- `src/App.tsx`: trocar as rotas de `/dp/ponto*`, `/dp/folha*`, `/dp/rescisoes`, `/dp/meu/ponto`, `/dp/meu/contracheque` por `<Navigate to="/dp" replace />`; `/dp/beneficios` deixa de usar o gate do módulo `folha`.
- `src/pages/dp/DpBeneficios.tsx` e `src/components/dp/beneficios/BeneficiosDialogs.tsx`: remover UI de `folha_tipo` e a ação de gerar lançamentos; `useDpBeneficios.tsx` perde a query `dp_folha_periodos` e a mutation de geração (coluna `folha_tipo` fica no banco, gravada como `null`).
- `src/lib/modules.ts` / `src/lib/dp/moduleMap.ts`: retirar `ponto` e `folha` de `DP_SUBMODULES` e das regras de rota.
- Escopo de benefícios: usar `beneficioEscopo.ts` para os selos e a detecção de sobreposição; sem migração de banco (colunas `unidade_id`/`cargo_id` já existem).
- Nenhuma tabela é apagada: os dados e as funções de folha/ponto continuam no backend para reativação futura.
