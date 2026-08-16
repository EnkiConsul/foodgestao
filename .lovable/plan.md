# Abrir cadastro de sindicatos dentro do sistema

Hoje o botão "Abrir cadastro de sindicatos" (no bloco Enquadramento Sindical do cadastro do colaborador) abre uma nova aba do navegador, saindo da tela atual.

## O que muda

- O botão passa a navegar dentro do próprio sistema para a tela de Sindicatos, sem abrir nova aba.
- Antes de navegar, o diálogo de cadastro do colaborador é fechado, para não deixar a janela aberta por cima da nova tela.
- Depois de cadastrar o sindicato, o usuário volta ao cadastro do colaborador pelo caminho normal (o vínculo rápido de sindicato continua disponível ali mesmo, sem precisar sair da tela).

## Detalhes técnicos

- `src/components/dp/SindicatoEnquadramentoField.tsx`: remover `target="_blank" rel="noreferrer"` do `Link`; trocar por navegação programática (`useNavigate` para `/dp/cadastros/sindicatos`) disparada em `onClick`, chamando antes um novo callback opcional `onBeforeNavigate` para fechar o diálogo.
- `src/components/dp/ColaboradorFormDialog.tsx`: passar esse callback (fecha o diálogo) ao componente de enquadramento.
