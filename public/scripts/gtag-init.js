/* Inicialização do Google tag (gtag.js). Externalizado do index.html para
 * permitir uma futura política de segurança de conteúdo (CSP) sem
 * 'unsafe-inline' em script-src.
 *
 * AUD-021: em rota sensível (login, ativação, recuperação, convite, OAuth) ou
 * em URL com credencial temporária na query/fragmento, nenhuma visualização é
 * enviada. Nos demais casos a URL vai sanitizada (caminho + allowlist de
 * campanha), sem fragmento e sem referrer bruto. */
(function () {
  var privacidade = window.__avetoTracking;
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;
  gtag("js", new Date());

  var loc = window.location;
  var sensivel = !privacidade || privacidade.isSensitiveLocation(loc.pathname, loc.search, loc.hash);

  if (sensivel) {
    // Carrega a biblioteca, mas sem nenhuma visualização automática e sem
    // qualquer URL: o SPA decide o que reportar depois de sair da rota.
    gtag("config", "G-S82MB9C11K", { send_page_view: false });
    return;
  }

  gtag("config", "G-S82MB9C11K", {
    send_page_view: true,
    page_path: privacidade.sanitizePath(loc.pathname, loc.search),
    page_location: privacidade.sanitizeUrl(loc.origin, loc.pathname, loc.search),
    page_referrer: privacidade.safeReferrer(document.referrer, loc.origin),
  });
})();
