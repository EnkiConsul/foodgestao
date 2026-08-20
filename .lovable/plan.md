# Padrão de benefícios: não sugerir replicar o que está desligado

## O que está acontecendo

Verifiquei os dados: o padrão gravado hoje é o da empresa (vale-alimentação ligado, R$ 24, prêmio de assiduidade ligado, vale-transporte desligado). No cadastro do Erildson o vale-alimentação está desligado.

Como o colaborador ficou diferente do padrão, o sistema abre a pergunta "salvar como padrão" — e nela lista **os quatro grupos sempre, todos já marcados**, inclusive Vale-alimentação (com o resumo "Sem vale-alimentação"). Ou seja: o diálogo está sugerindo gravar como padrão o VA **desligado** e, se o alcance for "todos", isso removeria o VA de R$ 24 de todo mundo. Foi isso que pareceu errado.

## Como vai ficar

1. O diálogo passa a listar **apenas os grupos que realmente divergem** do padrão vigente; grupos iguais ao padrão saem da lista (nada a decidir sobre eles).
2. Um grupo cuja divergência é "o benefício está desligado neste colaborador" entra **desmarcado**, com rótulo explícito de remoção, por exemplo: "Vale-alimentação: desligado neste cadastro — marcar remove o VA do padrão (e de quem estiver no alcance)".
3. Ao marcar um grupo desse tipo com alcance "todos", aparece um aviso em vermelho com a contagem de colaboradores ativos que perderiam o benefício, e é preciso confirmar.
4. Se o único desvio do colaborador é ter um benefício desligado, o diálogo **não abre sozinho** ao salvar: benefício desligado num colaborador é exceção individual, não novo padrão. O cadastro salva direto e o padrão da unidade/empresa continua intacto.
5. A pergunta continua igual quando o desvio é de valores/regras ligados (valor do VA, dia de pagamento, corte, assiduidade, ficha de benefícios).

## Detalhes técnicos

- `src/lib/dp/beneficiosPadrao.ts`: novo helper que classifica cada grupo divergente como `alteracao` ou `desligamento` (grupo com switch mestre `vale_alimentacao` / `vale_transporte` / `premio_assiduidade` falso na tela e verdadeiro no padrão de referência), e helper de contagem de quem perde o benefício.
- `src/components/dp/ColaboradorFormDialog.tsx`:
  - `devePerguntarPadrao()` passa a exigir ao menos um grupo divergente do tipo `alteracao`.
  - `concluir()` pré-seleciona apenas os grupos `alteracao` em `gruposPadrao`.
  - Lista de grupos renderiza somente `gruposDiferentes`, com rótulo/resumo próprio para o caso de desligamento e aviso de impacto quando marcado com alcance "todos".
- Nenhuma mudança de schema; a gravação em `dp_beneficios_padroes` continua respeitando `grupos` (mescla por grupo já existente).
- Testes unitários para os novos helpers em `src/lib/dp/__tests__/`.
