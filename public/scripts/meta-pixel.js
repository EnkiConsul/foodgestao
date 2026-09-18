/* Meta Pixel com respeito ao consentimento de marketing.
 * Externalizado do index.html para permitir uma futura política de segurança
 * de conteúdo (CSP) sem 'unsafe-inline' em script-src.
 *
 * AUD-021: em rota sensível (login, ativação, recuperação, convite, OAuth) ou
 * em URL com credencial temporária na query/fragmento, nenhuma visualização é
 * enviada — nem na carga inicial, nem quando o consentimento muda. */
(function () {
  const FB_PIXEL_ID = "1575266947199692";
  const privacidade = window.__avetoTracking;

  function rotaSensivel() {
    if (!privacidade) return true;
    const l = window.location;
    return privacidade.isSensitiveLocation(l.pathname, l.search, l.hash);
  }

  function marketingConsent() {
    try {
      const raw = localStorage.getItem("plin_cookie_consent");
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      return parsed.marketing === true;
    } catch {
      return false;
    }
  }

  // Fila local do pixel. A biblioteca da Meta só é baixada fora de rota
  // sensível e com consentimento — assim nem o cabeçalho Referer da
  // requisição pode levar credencial temporária.
  !(function (f) {
    if (f.fbq) return;
    var n = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
  })(window);

  var bibliotecaPedida = false;
  function carregarBiblioteca() {
    if (bibliotecaPedida) return;
    bibliotecaPedida = true;
    var t = document.createElement("script");
    t.async = true;
    t.referrerPolicy = "no-referrer";
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    var s = document.getElementsByTagName("script")[0];
    s.parentNode.insertBefore(t, s);
  }

  var granted = marketingConsent();
  fbq("consent", granted ? "grant" : "revoke");
  fbq("init", FB_PIXEL_ID);
  if (granted && !rotaSensivel()) {
    carregarBiblioteca();
    fbq("track", "PageView");
  }

  window.addEventListener("plin:cookie-consent-change", function (e) {
    var allow = !!(e.detail && e.detail.marketing);
    if (allow && !granted) {
      granted = true;
      fbq("consent", "grant");
      if (!rotaSensivel()) {
        carregarBiblioteca();
        fbq("track", "PageView");
      }
    } else if (!allow && granted) {
      granted = false;
      fbq("consent", "revoke");
    }
  });

  /** Visualização de rota do SPA: sempre reavalia rota sensível e consentimento. */
  window.__avetoPixelPageView = function () {
    if (!granted || rotaSensivel()) return false;
    carregarBiblioteca();
    fbq("track", "PageView");
    return true;
  };
})();
