/**
 * Origem pública canônica do sistema.
 *
 * Fonte única para links absolutos gerados no app (canonical, og:url,
 * JSON-LD, link/QR code da loja online). Nunca derive isso de
 * `window.location.origin`: no preview do Lovable isso geraria um endereço
 * `id-preview--....lovable.app`, que não serve para compartilhar com clientes.
 */
export const PUBLIC_SITE_ORIGIN = "https://www.aveto360.com";
