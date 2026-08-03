# Novo modelo padrão de categorias 360°FOOD (food service)

Substituir o modelo padrão atual (68 categorias) pela nova árvore de 3 níveis com ~230 categorias, acrescentando campos de orientação para o usuário leigo e para o agente de categorização automática por IA.

## O que muda para o usuário

- **Categorias Padrão (backoffice)** passa a exibir a nova árvore completa: Entradas (5 grupos), Saídas (18 grupos) e Transferências (5 itens), com numeração hierárquica igual ao documento.
- Cada categoria padrão ganha campos de orientação:
  - **O que lançar aqui** e **O que não lançar aqui** (textos guia, exibidos como dica na tela de lançamentos e conciliação).
  - **Palavras-chave de identificação** (lista usada pelo motor de regras e pela IA no match da descrição).
  - **Exemplos de fornecedores/documentos** (ex.: iFood, distribuidora de bebidas, nota fiscal de serviço).
  - **Classificação gerencial**: entra na DRE, compõe margem de contribuição, é CMV, é patrimonial/investimento.
- Botão **"Aplicar categorias padrão"** no backoffice e na tela de Categorias: substitui totalmente as categorias da empresa pelo modelo novo — apaga as anteriores antes de recriar.
- Grupo **3. Transferências** criado por completo, conforme solicitado.

### Regras de negócio embutidas nos textos guia

- Verbas comerciais de fornecedores = apenas contrapartida distinta (publicidade, exclusividade); rebate de compra reduz CMV.
- Entregadores: próprio/CLT → Mão de Obra Direta; motoboy terceirizado → Serviços Operacionais Diretos; logística do marketplace → Fretes de Marketplaces; subsídio ao cliente → Subsídios de Frete.
- Taxas de meios de pagamento em Despesas Variáveis de Venda (margem de contribuição); antecipação de recebíveis em Despesas Financeiras.
- IPTU somente em Ocupação e Estrutura.
- Juros separados do principal na amortização de empréstimos.
- Sem categorias por plataforma de mídia (Google, Meta, TikTok) — isso é fornecedor/descrição.
- 1.5, 2.15, 2.16, 2.17 e Transferências marcados como fora da DRE.

## Impacto na exclusão das categorias antigas

Apagar categorias de uma empresa com lançamentos vinculados é destrutivo. O botão de aplicar vai:

1. Exigir confirmação explícita com o texto do impacto e a contagem de lançamentos afetados.
2. Recriar o modelo novo e, quando houver lançamentos apontando para uma categoria antiga, **remapear** para a categoria nova equivalente quando existir mapeamento seguro; sem equivalência, o lançamento fica em **2.18.4 Valores a Classificar** (entradas ficam em 1.4.5) em vez de perder o vínculo.
3. Registrar a operação em audit_logs.

Isso preserva saldos e relatórios, cumprindo a substituição total pedida sem quebrar histórico.

## Plano de contas padrão

Revisão do `chart_account_templates` para dar conta compatível a todos os grupos novos, incluindo:

- Receitas complementares, financeiras e outras receitas (grupo 4).
- CMV separado de alimentos, bebidas, embalagens e mão de obra direta (grupo 5).
- Despesas variáveis de venda, ocupação, marketing, veículos e financeiras (grupo 6/7).
- Investimentos apontando para contas do **Ativo Não Circulante**, e movimentos de sócios/financiamentos para Patrimônio Líquido/Passivo.

Cada categoria padrão nova já nasce com `chart_account_code` compatível, respeitando as regras de `chartCompat.ts` (analítica, de resultado; exceção liberada para investimentos → Ativo).

## Detalhes técnicos

1. **Migração de schema** em `public.category_templates`: novos campos `guidance_include`, `guidance_exclude`, `keywords text[]`, `examples`, `in_dre boolean`, `is_contribution_margin boolean`, `is_cmv boolean`, `is_patrimonial boolean`. Espelhar os mesmos campos em `public.categories` para que a orientação viaje para a empresa.
2. **Ajuste de compatibilidade**: liberar em `chartCompat.ts` e no trigger `category_templates_validate_chart_account` o vínculo de categorias de investimento/patrimoniais com contas do Ativo/Passivo/PL, mantendo o bloqueio de contas sintéticas.
3. **Seed do novo modelo**: migração que limpa `category_templates` e insere a árvore completa (código, pai, nível, subtipo, tipo de lançamento, ordem, textos guia, palavras-chave, flags, conta contábil). `subtype` recebe também os valores necessários para patrimonial/transferência.
4. **Contas contábeis**: migração ajustando/complementando `chart_account_templates` e revisão de `chart_accounts_seed_default` para novas empresas.
5. **RPC `apply_default_categories(p_company_id, p_context)`** (SECURITY DEFINER): remapeia lançamentos, remove categorias antigas da empresa, recria a partir dos templates com vínculo contábil e devolve resumo (criadas, removidas, lançamentos remapeados, lançamentos enviados para "Valores a Classificar").
6. **Frontend**: `src/pages/admin/CategoriasPadrao.tsx` ganha os campos novos no formulário (textos guia, palavras-chave via chips, exemplos, switches gerenciais) e badges das flags; botão de aplicar com diálogo de confirmação e resumo do resultado. Dica de orientação exibida no seletor de categoria em Lançamentos e Conciliação.
7. **Categorização por IA**: `categorize_transaction` e a função de sugestão passam a usar `keywords` e `guidance_include/exclude` como sinal adicional; `generate-category-ai-description` recebe os campos no prompt.
8. **Transferências**: grupo 3 criado com `transaction_type = 'transferencia'`; o seletor de categoria em transferências fica opcional e pré-selecionado pelo tipo de contas envolvidas.
9. **Testes**: unitários da árvore/compatibilidade e do remapeamento, além de teste do DRE garantindo que grupos fora da DRE não afetem Lucro Bruto/EBITDA/Resultado.

## Ordem de execução

Schema e compatibilidade → contas contábeis padrão → seed da nova árvore → RPC de aplicação → backoffice e UI → integração com IA → testes.
