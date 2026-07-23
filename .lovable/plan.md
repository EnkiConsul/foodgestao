## Objetivo
Substituir a escrita textual "360°FOOD" pela nova logomarca enviada (versão colorida sobre fundo marinho) nos cabeçalhos das telas de autenticação.

## Onde aparece o texto "360°FOOD" como título visual
- `src/pages/Auth.tsx` (linha 315) — `<CardTitle>360°FOOD</CardTitle>` na tela `/auth`.
- `src/pages/dp/DpLogin.tsx` (linhas 76-79) — CardTitle com spans laranja/branco no Portal do Colaborador.

As demais ocorrências são apenas metadados (`<title>`, `<meta>`, `sr-only`), que devem permanecer como texto para SEO/acessibilidade.

## Passos
1. Publicar a imagem enviada como asset via `lovable-assets create` a partir de `/mnt/user-uploads/logo_perfil_whatsapp.png`, gerando `src/assets/360food-logo-marinho.png.asset.json`.
2. Em `src/pages/Auth.tsx`:
   - Substituir o `<CardTitle>360°FOOD</CardTitle>` por um `<img>` centralizado com a nova logo (altura ~64px, `alt="360°FOOD"`), mantendo `CardDescription` abaixo.
   - Remover o ícone `Lock` decorativo do header (o logo já cumpre o papel visual). Manter demais elementos.
3. Em `src/pages/dp/DpLogin.tsx`:
   - Substituir o `<CardTitle>` com spans por um `<img>` da logo com o mesmo tratamento.
   - Manter o `CardDescription` "Portal do Colaborador — acesse com CPF e senha".

## Escopo mantido
- Metadados `<title>`/`<meta>` continuam com o texto "360°FOOD".
- Sidebar, landing e demais telas não são alteradas nesta rodada.

## Observação técnica
A imagem enviada tem fundo azul marinho sólido — ela funcionará bem sobre o card branco como um bloco visual. Se preferir logo sem fundo (transparente) para se integrar ao card, posso gerar uma variante após aprovação.