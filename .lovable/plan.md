## Diagnóstico

Rodei o `/admin` no preview headless com a sua sessão restaurada:

- URL resolveu para `/admin/estatisticas` e renderizou os cards (Usuários 21, Perfis 11, Lançamentos 251, Contas 36).
- **Nenhum erro** de `pageerror` ou `console.error` — só os avisos conhecidos de React Router v7 future flags.
- Build do Vite servindo normalmente (`GET /` retorna 200, HTML de 168 kB).

Ou seja, **não há tela branca causada por código** no estado atual do repositório. O que você viu no print é o iframe do preview sem conteúdo — normalmente é um dos três casos abaixo.

## Hipóteses (a validar com você antes de qualquer alteração)

1. **Iframe do preview travado no carregamento** após HMR — resolve com refresh (F5) no painel de preview.
2. **Sessão expirada / Service Worker antigo** segurando um bundle inválido em cache — resolve abrindo `?sw=off` na URL do preview para limpar o SW.
3. **Erro só ocorre em outra rota** (ex.: `/dp` ou `/inicio`, onde toquei no widget de pendências) — nesse caso precisaria da rota exata e do console.

## Próximos passos propostos

1. Você abrir o preview em `/admin` e me dizer se após um refresh forte (ou `?sw=off`) a tela volta.
2. Se persistir, me informar:
   - a URL exata mostrada na barra do preview quando aparece branco;
   - se o Console do navegador (F12) tem alguma mensagem em vermelho.
3. Com esses dados eu abro um novo plano de correção específico (provavelmente pontual em uma rota, não no card de pendências que acabei de mexer).

Nenhuma alteração de código será feita até confirmarmos a rota/erro real — assim evito "consertar" algo que já está funcionando.