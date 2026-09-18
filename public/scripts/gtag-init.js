/* Inicialização do Google tag (gtag.js). Externalizado do index.html para
 * permitir uma futura política de segurança de conteúdo (CSP) sem
 * 'unsafe-inline' em script-src. Não coleta nada por si só. */
(function () {
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;
  gtag("js", new Date());
  gtag("config", "G-S82MB9C11K");
})();
