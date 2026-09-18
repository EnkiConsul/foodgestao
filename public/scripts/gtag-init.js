/* Inicialização do Google tag (gtag.js). Externalizado do index.html para
 * permitir uma futura política de segurança de conteúdo (CSP) sem
 * 'unsafe-inline' em script-src.
 *
 * AUD-021: em rota sensível (login, ativação, recuperação, convite, OAuth) ou
 * em URL com credencial temporária na query/fragmento, a própria biblioteca do
 * Google NÃO é baixada — assim nem o cabeçalho Referer da requisição carrega a
 * credencial — e nenhuma visualização é enviada. Nos demais casos a URL vai
 * sanitizada (caminho + allowlist de campanha), sem fragmento e sem referrer
 * bruto, e o script é pedido com referrer suprimido. */
(function () {
  var MEDIDA = "G-S82MB9C11K";
  var privacidade = window.__avetoTracking;
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;

  var carregado = false;
  function carregarBiblioteca() {
    if (carregado) return;
    carregado = true;
    var s = document.createElement("script");
    s.async = true;
    s.referrerPolicy = "no-referrer";
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + MEDIDA;
    document.head.appendChild(s);
  }

  function sensivel() {
    var loc = window.location;
    return !privacidade || privacidade.isSensitiveLocation(loc.pathname, loc.search, loc.hash);
  }

  /* O SPA usa isto ao sair de uma rota sensível para uma rota comum. */
  window.__avetoLoadGtag = function () {
    if (sensivel()) return false;
    carregarBiblioteca();
    return true;
  };

  gtag("js", new Date());

  if (sensivel()) {
    gtag("config", MEDIDA, { send_page_view: false });
    return;
  }

  var loc = window.location;
  gtag("config", MEDIDA, {
    send_page_view: true,
    page_path: privacidade.sanitizePath(loc.pathname, loc.search),
    page_location: privacidade.sanitizeUrl(loc.origin, loc.pathname, loc.search),
    page_referrer: privacidade.safeReferrer(document.referrer, loc.origin),
  });
  carregarBiblioteca();
})();
