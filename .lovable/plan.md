# Padrão de benefícios e adicionais de risco no cadastro do colaborador

## 1. Vale-alimentação desligado sendo sugerido como padrão

Verifiquei os dados: o padrão gravado hoje é o da empresa (vale-alimentação ligado, R$ 24, prêmio de assiduidade ligado, vale-transporte desligado). No cadastro do Erildson o vale-alimentação está desligado.

Como o colaborador ficou diferente do padrão, o sistema abre a pergunta "salvar como padrão" — e nela lista **os quatro grupos sempre, todos já marcados**, inclusive Vale-alimentação (resumo "Sem vale-alimentação"). Ou seja, o diálogo estava sugerindo gravar como padrão o VA **desligado**; com alcance "todos", isso removeria o VA de R$ 24 de todo mundo.

Como vai ficar:

1. O diálogo lista **apenas os grupos que realmente divergem** do padrão vigente; grupos iguais ao padrão saem da lista.
2. Grupo cuja divergência é "o benefício está desligado neste colaborador" entra **desmarcado**, com rótulo explícito: "Vale-alimentação: desligado neste cadastro — marcar remove o VA do padrão e de quem estiver no alcance".
3. Marcar um grupo desse tipo com alcance "todos" mostra aviso em vermelho com a contagem de colaboradores ativos que perderiam o benefício, e exige confirmação.
4. Se o único desvio for um benefício desligado, o diálogo **não abre sozinho** ao salvar: desligar benefício de uma pessoa é exceção individual, não novo padrão.
5. A pergunta segue igual quando o desvio é de valores/regras ligados (valor do VA, dia de pagamento, corte, assiduidade, ficha de benefícios).

## 2. Periculosidade não era oferecida como padrão

Confirmei que insalubridade e periculosidade **não fazem parte do padrão de benefícios** — e com razão: risco é característica do **cargo**, não da unidade. Hoje a propagação existe só no sentido cargo → colaboradores (tela de Cargos, com o aviso "aplicar aos N colaboradores deste cargo"). Ao digitar 30% de periculosidade direto na ficha do Erildson, nada é perguntado e o valor fica só nele.

Como vai ficar:

1. Ao salvar o colaborador com insalubridade/periculosidade **diferente do cargo dele**, aparece uma pergunta própria (separada da de benefícios):
   - "Só este colaborador" — mantém como exceção individual, com o aviso de equidade;
   - "Aplicar ao cargo MOTOQUEIRO" — grava os percentuais no cargo;
   - "Aplicar ao cargo e aos N colaboradores ativos deste cargo" — grava no cargo e propaga, igual ao comportamento da tela de Cargos.
2. Quando o valor da ficha já é igual ao do cargo (caso atual do Erildson depois que o cargo foi ajustado para 30%), nada é perguntado.
3. Se o cargo tem risco e o colaborador está com 0%, o diálogo trata como redução individual: opção de aplicar ao cargo vem desmarcada e com aviso de impacto.

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: helper que classifica cada grupo divergente como `alteracao` ou `desligamento` (switch mestre `vale_alimentacao` / `vale_transporte` / `premio_assiduidade` falso na tela e verdadeiro no padrão), e helper de contagem de quem perde o benefício.
- `src/components/dp/ColaboradorFormDialog.tsx`:
  - `devePerguntarPadrao()` exige ao menos um grupo divergente do tipo `alteracao`;
  - `concluir()` pré-seleciona só os grupos `alteracao`;
  - lista renderiza apenas `gruposDiferentes`, com rótulo/aviso próprio para desligamento;
  - novo diálogo de riscos, encadeado depois do de benefícios, comparando `insalubridade_percentual` / `periculosidade_percentual` da ficha com `dp_cargos`.
- `src/lib/dp/cargos.ts`: helper de comparação risco-ficha vs risco-cargo, reutilizado pelos dois lados (Cargos e Colaborador).
- Atualização do cargo e propagação usam a mutation já existente em `useDpCadastros` (a mesma usada pelo `CargoFormDialog`).
- Sem mudança de schema. Testes unitários dos novos helpers em `src/lib/dp/__tests__/`.
