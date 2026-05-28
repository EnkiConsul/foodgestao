# Transformar Gestor Plin em PWA

Objetivo: deixar o app instalável no celular (ícone na home, tela cheia, splash) e pronto para ser empacotado como APK via PWABuilder e enviado à Play Store.

## O que será feito

1. **Manifest (`public/manifest.webmanifest`)**
   - `name`: "Gestor Plin"
   - `short_name`: "Gestor Plin"
   - `start_url`: "/"
   - `display`: "standalone"
   - `background_color` e `theme_color` usando o azul primário (#2D6EB5)
   - `icons`: 192x192 e 512x512 (gerados com o ícone TreePine sobre fundo azul, conforme identidade visual — sem logo em imagem do app, apenas o ícone)
   - `lang`: "pt-BR"

2. **Service Worker via `vite-plugin-pwa`**
   - Instalar `vite-plugin-pwa` e configurar em `vite.config.ts`
   - Estratégia `autoUpdate` (atualiza sozinho quando há nova versão publicada)
   - Cache de assets estáticos (JS/CSS/fontes/imagens) com Workbox
   - Network-first para chamadas Supabase (sem cachear dados sensíveis)
   - Fallback offline básico para a shell do app

3. **Meta tags em `index.html`**
   - `<link rel="manifest">`
   - `theme-color`, `apple-mobile-web-app-capable`, `apple-touch-icon`
   - Viewport já existente mantido

4. **Ícones**
   - Gerar `icon-192.png`, `icon-512.png` e `icon-maskable-512.png` (com safe zone para Android adaptive icon) em `public/`
   - Usar TreePine branco sobre fundo azul #2D6EB5

5. **Prompt de instalação (opcional, leve)**
   - Pequeno botão "Instalar app" no header/menu que aparece quando o navegador dispara `beforeinstallprompt` — sem ser intrusivo

## Fora do escopo

- Geração do APK/AAB em si (feita externamente no PWABuilder.com após publicar)
- Assinatura digital, conta Google Play Console, ficha da loja
- Push notifications nativas
- Funcionalidades offline avançadas (edição offline com sync)

## Próximo passo do usuário (depois que estiver pronto)

1. Publicar o app no Lovable (domínio `gestorplin.com`)
2. Ir em https://www.pwabuilder.com, colar a URL
3. Baixar o pacote Android (TWA) e enviar à Play Console

Confirma que posso seguir com essa abordagem (PWA + ícones azul/TreePine + auto-update)?
