# Renomear o módulo "Conformidade" para "SESMT"

Troca apenas o rótulo visível. A rota (`/dp/conformidade`), os dados e a máscara "Em desenvolvimento" continuam iguais. "Conformidade DSR" (dentro de Folgas e Férias) não muda.

## Onde o nome muda

- Item do menu do DP (sidebar desktop e menu "Mais" mobile): "SESMT", mantendo o selo "Em breve".
- Cabeçalho da página: título "SESMT" e subtítulo mencionando saúde e segurança ocupacional (ASO, EPIs, treinamentos).
- Título da aba do navegador: "SESMT — saúde e segurança ocupacional — DP 360°".
- Aviso de módulo em desenvolvimento: "O módulo de SESMT está em desenvolvimento...".

## Detalhes técnicos

- `src/config/dpNavigation.tsx`: `label: "SESMT"` no item `/dp/conformidade`.
- `src/pages/dp/DpConformidade.tsx`: atualizar `Helmet`, `title` e descrição do header.
- `src/App.tsx`: `titulo="SESMT"` no `ModuloEmDesenvolvimentoGate` da rota.
- Nomes de arquivos, hooks e rotas permanecem (`DpConformidade`, `useDpConformidade`, `/dp/conformidade`) para não quebrar layouts de menu já salvos por usuários/empresas, que são persistidos por caminho de rota.
