# Melhorar as regras e a ficha de admissão

## Resultado para quem usa
- A tela de regras ficará mais fácil de ler: blocos de dados, documentos e familiares bem separados, campos e ações alinhados. Cada bloco poderá ser recolhido; no celular, começarão fechados e só um ficará aberto por vez. Mostrar um resumo curto do que há em cada bloco fechado, sem perder o ponto em que o gestor estava.
- Separar “Comprovante escolar do menor” de “Autorização judicial”. Explicar em linguagem simples a finalidade de cada um. Não exigir autorização judicial de todo menor: disponibilizá-la como item condicional, configurável pelo gestor somente quando cabível; o comprovante escolar terá sua própria regra. Não confundir documentação do candidato menor com documentos de dependentes.
- Retirar “Declaração de CNH sem suspensão” da lista padrão da admissão, mantendo a CNH válida e preservando anexos e histórico existentes. Não reintroduzir o item ao restaurar os documentos padrão.
- Retirar o bloco “Documentos que a empresa emite” da **configuração da ficha do candidato**; esses itens continuarão disponíveis no controle/importação de documentos da empresa e não serão apagados.
- Dar ao gestor um caminho claro, dentro das regras de admissão, para incluir documentos próprios, ajustar sua exigência e retirar itens conforme as regras da empresa. Documentos já anexados não serão apagados, e a ficha/checklist do candidato refletirão a configuração vigente.
- Na seção de familiares, permitir configurar quais parentescos podem constar da admissão e para quais finalidades da ficha (por exemplo, dependente do imposto e Sesc), com opção de cadastrar/retirar graus de parentesco próprios da empresa. A seleção do candidato mostrará apenas as opções válidas; as verificações antes de salvar usarão a mesma regra. Não alterar o cadastro/cálculo dos benefícios, IR ou salário-família: selecionar uma finalidade na ficha não é concessão automática de benefício.

## Cuidados e verificação
- Preservar fichas em andamento e dados já enviados; ao retirar uma opção usada em ficha existente, manter os dados legíveis na revisão e sinalizar ao gestor a necessidade de ajuste, sem exclusão silenciosa.
- Confirmar em celular e computador a expansão exclusiva, alinhamento, rolagem, leitura de mensagens e operação por teclado; testar inclusão/remoção de documento e parentesco, regras condicionais e convite em andamento. Não publicar sem solicitação.

## Detalhes técnicos
- Reaproveitar o catálogo por empresa e as rotinas oficiais de documentos; revisar a semeadura para não recriar o item de CNH e migrar os requisitos antigos sem apagar arquivos. Regras de menores distintas, com aplicação e exigência coerentes entre catálogo, checklist do candidato, revisão e conferência no servidor.
- Hoje as regras de parentesco são por empresa e o servidor já valida dependente/Sesc; a tela do candidato, porém, filtra uma lista fixa de parentescos. Alinhar resposta pública, opções da ficha, revisão e validação à configuração persistida, inclusive parentescos próprios, garantindo autorização por empresa e auditoria nas alterações. Manter legislação de IR/salário-família fora do controle livre da empresa.
- Alterar apenas o necessário nas rotinas de admissão e na apresentação, com testes de regressão, migração reversível onde houver mudança estrutural e validação no servidor para toda regra nova.
