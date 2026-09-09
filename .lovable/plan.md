# Tirar "Importar ficha de registro" do menu

A tela continua existindo e funcionando, mas deixa de aparecer no menu do Pessoas 360. Ela passa a ser aberta somente pelo caminho de cadastro de colaborador (botão "Novo colaborador" > importar ficha).

## O que muda
- Remover o item "Importar ficha de registro" da lista do grupo "Cadastro" no menu lateral e no menu "Mais".
- Remover a tela dos resultados da busca do menu, para não voltar por ali.
- Manter o endereço da tela ativo, para quem chega pelo cadastro de colaborador continuar conseguindo importar a ficha.

## O que não muda
- A tela de importação de ficha e todo o seu funcionamento.
- O botão dentro de "Novo colaborador" que leva à importação.
- Qualquer regra de negócio, banco de dados, permissões ou outras telas.

## Detalhes técnicos
- `src/config/dpNavigation.tsx`: remover a entrada `/dp/colaboradores/importar-ficha` do grupo `cadastro`.
- `src/lib/nav/navSearch.ts`: remover as palavras-chave dessa rota.
- `src/App.tsx`: manter a rota `colaboradores/importar-ficha` intacta.
- Rodar verificação de tipos e a suíte de testes de navegação (`src/config/mobileNav.parity.test.ts` e testes de navegação relacionados).
