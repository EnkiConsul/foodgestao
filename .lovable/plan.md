

## Atualizar a Logomarca do Gestor Plin

### O que sera feito
Copiar a nova imagem enviada para `public/images/logo-gestor-plin.png`, substituindo o arquivo anterior. O codigo do sidebar ja aponta para esse caminho, entao nenhuma alteracao de codigo sera necessaria.

### Passos

1. Copiar `user-uploads://Logo_Gestor_Plin_Lovable.png` para `public/images/logo-gestor-plin.png` (sobrescrevendo o arquivo vazio anterior)
2. Verificar que `AppSidebar.tsx` ja referencia `/images/logo-gestor-plin.png` (confirmado - nenhuma alteracao de codigo necessaria)

### Detalhes tecnicos
- O arquivo sera colocado em `public/images/` para ser servido estaticamente
- A constante `logoGestorPlin` em `AppSidebar.tsx` ja aponta para `/images/logo-gestor-plin.png`
- A classe CSS `h-9 w-auto` mantera a altura em 36px com largura proporcional

