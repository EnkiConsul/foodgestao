# Benefícios: editar os mesmos parâmetros do colaborador na tela de cadastro

## Por que hoje confunde

Existem duas fontes diferentes na tela de Benefícios:

- **Por colaborador** — lista mesclada: o VA/VT que está gravado na ficha do colaborador (aba Remuneração) mais as atribuições feitas a partir do catálogo. Hoje as linhas "Do cadastro" só podem ser vistas, não editadas: o botão leva para a ficha.
- **Catálogo** — a lista de outros benefícios da empresa (plano de saúde, odontológico, cesta, etc.), com valor padrão e se entra na folha. Não é o VA/VT do colaborador — por isso a tela parece "vazia" mesmo com VA configurado em 12 pessoas.

Ou seja: o que você cadastrou no colaborador (VA/VT) nunca aparece no Catálogo, e é isso que quebra a expectativa.

## O que muda

1. **Abas renomeadas e explicadas**
   - `Cálculo mensal` (fica como está)
   - `Vales por colaborador` (hoje "Por colaborador") — VA/VT vindos da ficha + atribuições do catálogo, com uma linha curta explicando as duas origens.
   - `Outros benefícios` (hoje "Catálogo") — com subtítulo: "Benefícios além do VA/VT: plano de saúde, odontológico, cesta. O vale-alimentação e o vale-transporte ficam no cadastro do colaborador."
   - Nova aba `Padrões` — o padrão de VA/VT por empresa / unidade / cargo, hoje acessível apenas de dentro do cadastro do colaborador.

2. **Editar o VA/VT direto na tela de Benefícios**
   Nas linhas "Do cadastro", o botão passa a abrir um diálogo **Vales do colaborador** com exatamente os mesmos campos da aba Remuneração:
   - VA: liga/desliga, periodicidade, valor por dia (ou mensal), dias considerados no mês (jornada/fixo), desconto do colaborador (tipo + valor), dia do pagamento, corte (dias antes), e os quatro "desconta em caso de" (falta, folga extra, atestado, férias).
   - VT: liga/desliga, valor por dia, dia do pagamento, corte, e os quatro "desconta em caso de".
   - Mesma simulação do mês e mesmos avisos (coparticipação, isonomia) já mostrados no cadastro.
   Salvar grava nas mesmas colunas de `dp_colaboradores` — é o mesmo cadastro, só outra porta de entrada. O atalho "Ficha" continua disponível.

3. **Colaborador sem vale ainda**
   Botão **Configurar vales** com seletor de colaborador, para ligar VA/VT de quem ainda não tem, sem abrir a ficha inteira.

4. **Padrão aplicável dos dois lados**
   Na aba `Padrões`, salvar um padrão oferece a mesma escolha de alcance já existente (só novos / todos do escopo / colaboradores selecionados).

5. **Benefícios do catálogo com escopo e visíveis no colaborador**
   - Todo benefício criado na tela de Benefícios aparece na aba Remuneração do colaborador — o bloco passa a listar o catálogo inteiro (não só o que já está marcado), com valor padrão e desconto visíveis.
   - O formulário de benefício (tanto na tela de Benefícios quanto no atalho "Novo benefício" dentro do colaborador) ganha o campo **Aplica-se a**: Empresa (todos), Unidade, Cargo, ou Cargo na unidade. É o mesmo escopo usado no padrão de remuneração.
   - No cadastro do colaborador, o bloco só oferece os benefícios cujo escopo alcança a unidade/cargo dele; os fora de escopo aparecem esmaecidos com o motivo ("só para a unidade X").
   - Criando pelo colaborador, o escopo vem pré-selecionado pela unidade/cargo dele, e o admin pode ampliar para a empresa antes de salvar.
   - O **alerta de isonomia** continua ativo e passa a considerar também esses benefícios do catálogo: se um colega do mesmo cargo/unidade tem o benefício marcado e o colaborador aberto não, o aviso aparece com o atalho "aplicar padrão", como já ocorre com VA/VT.

Nada muda no motor de cálculo, nas regras de desconto ou na geração de folha.

## Detalhes técnicos

- Extrair de `src/components/dp/RemuneracaoFields.tsx` um componente `ValesFields` (bloco VA + bloco VT, já usando `ValeCorteFields`), consumido tanto pela aba Remuneração do colaborador quanto pelo novo diálogo — um único lugar de verdade para os campos.
- Novo `src/components/dp/beneficios/ColaboradorValesDialog.tsx`: carrega as colunas de VA/VT do colaborador, monta o estado no mesmo formato de `RemuneracaoValue`, renderiza `ValesFields` e persiste via update em `dp_colaboradores` (reaproveitando os conversores `numeroBR`/`vaInput` já existentes). Invalida `dp_beneficios_cadastro`, `dp_colaboradores` e as queries da calculadora.
- `src/pages/dp/DpBeneficios.tsx`: renomear abas, adicionar `Padrões`, trocar o botão das linhas "Do cadastro" por Editar (abre o novo diálogo) + Ficha, e adicionar o botão "Configurar vales".
- Aba `Padrões`: reusar o diálogo/painel de padrão de remuneração já usado em `ColaboradorFormDialog.tsx` com `useDpBeneficiosPadroes` / `useSalvarDpBeneficiosPadrao`.
- Escopo do catálogo (única mudança de banco): `dp_beneficios` hoje só tem `company_id`; migração adiciona `unidade_id uuid null` e `cargo_id uuid null` (referências com `on delete cascade`), mantendo `null/null` = empresa inteira. Sem novas policies — as atuais já filtram por `company_id`; GRANTs já existem para a tabela.
- `useDpBeneficios.tsx`: `BeneficioInput` ganha `unidade_id`/`cargo_id`; `BeneficioDialog` (em `beneficios/BeneficiosDialogs.tsx`) ganha os seletores de escopo com pré-seleção via props.
- `RemuneracaoFields.tsx`: bloco de benefícios lista todo o catálogo com filtro de escopo por `unidade_id`/`cargo_id` do colaborador em edição; itens fora de escopo desabilitados com tooltip.
- Isonomia: `useDpIsonomiaBeneficios.tsx` passa a comparar também as marcações de `dp_colaborador_beneficios` do grupo (mesmo cargo/unidade), alimentando o `BeneficioIsonomiaAviso` já existente.

