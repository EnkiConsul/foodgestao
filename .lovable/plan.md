# Benefícios: Cadastro Único de Regras e Títulos em Title Case

## O Que Muda

1. A aba "Vales por colaborador" sai da tela de Benefícios.
2. A aba "Catálogo da empresa" passa a ser **Cadastro de Benefícios** e vira o lugar único onde qualquer benefício é criado e editado — Vale-Alimentação, Vale-Transporte e todos os demais (plano de saúde, cesta, auxílio creche, ou qualquer um novo criado pelo usuário).
3. VA e VT aparecem nesse cadastro com **exatamente as mesmas regras** da aba Remuneração da ficha do colaborador. Editar em qualquer uma das duas telas altera o mesmo dado, e a empresa que não usa o benefício pode excluí-lo.
4. Todos os títulos do módulo passam para Title Case (Primeira Letra de Cada Palavra Maiúscula).

## Cadastro de Benefícios

A aba passa a listar, em uma lista só:

- **Vale-Alimentação** e **Vale-Transporte** — abrem um editor com os mesmos campos da Remuneração: valor por dia, periodicidade, dias base e origem dos dias, dia do pagamento, dias de corte, o que desconta (falta, folga extra, atestado, férias) e desconto do colaborador (percentual ou valor). Cada um pode ser salvo como padrão da **Empresa**, de uma **Unidade** ou de um **Cargo**, respeitando a hierarquia já usada hoje (Empresa → Unidade → Cargo → Colaborador) e mantendo o alerta de isonomia. Ambos podem ser **excluídos** quando a empresa não usa o benefício — a exclusão desativa o vale para a empresa (some do cálculo mensal, da ficha e da folha) e pode ser reativada depois pelo botão de recriar o benefício.
- **Demais benefícios** — a lista atual do catálogo, com os mesmos botões de criar, editar e excluir que já existem hoje.

Ao editar VA/VT (ou qualquer benefício com padrão) **na ficha do colaborador**, o sistema pergunta o alcance da alteração antes de salvar: exceção só deste colaborador, padrão do cargo, padrão da unidade ou padrão da empresa — o mesmo diálogo de escopo já definido para benefícios, com o aviso de isonomia quando a mudança afeta um grupo.


## Abas Finais da Tela de Benefícios

```text
Cálculo Mensal | Histórico | Cadastro de Benefícios
```

O botão "Atribuir benefício" (que só existia para a aba removida) passa para o Cadastro de Benefícios, junto de cada benefício da lista, para vincular colaboradores.

## Títulos em Title Case

Padronização de títulos visíveis: cabeçalhos de página, rótulos de abas, títulos de diálogos e títulos de cards do módulo Pessoas 360° e da tela de Benefícios. Ex.: "Benefícios e auxílios" → "Benefícios e Auxílios"; "Cálculo mensal" → "Cálculo Mensal"; "Novo benefício" → "Novo Benefício". Preposições e artigos curtos (de, da, do, e, em, para, por) permanecem minúsculos, como é a convenção em português. Textos descritivos e frases de apoio não mudam.

## Detalhes Técnicos

- `src/pages/dp/DpBeneficios.tsx`: remover a `TabsContent value="ficha"`, o cálculo de `linhas`, `useDpBeneficiosCadastro` na listagem e o `ColaboradorFichaDialog` usado só por ela; renomear a aba `catalogo`.
- Novo `src/components/dp/beneficios/ValeRegrasCard.tsx` + `ValeRegrasDialog.tsx`: reaproveitam `ValeCorteFields` e os mesmos campos de `RemuneracaoFields.tsx`, extraindo o bloco VA/VT para um componente compartilhado para que as duas telas usem uma fonte só de UI e validação.
- Persistência: padrão de empresa em `dp_config_dp` (`va_*` / `vt_*`); padrão de unidade e cargo em `dp_beneficios_padroes.payload` (helpers já existentes em `src/lib/dp/beneficiosPadrao.ts` e `beneficioEscopo.ts`); exceção do colaborador continua em `dp_colaboradores.vale_*`. Sem migração de banco.
- KPIs da tela recalculados sem a lista da aba removida (contagem de benefícios ativos, colaboradores atendidos, custo bruto e líquido).
- Title Case aplicado nos `DpPageHeader`, `TabsTrigger`, `DialogTitle` e `Helmet` do módulo Pessoas.
