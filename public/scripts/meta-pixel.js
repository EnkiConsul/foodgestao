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

  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = !0;
    n.version = "2.0";
    n.queue = [];
    t = b.createElement(e);
    t.async = !0;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");

  var granted = marketingConsent();
  fbq("consent", granted ? "grant" : "revoke");
  fbq("init", FB_PIXEL_ID);
  if (granted && !rotaSensivel()) fbq("track", "PageView");

  window.addEventListener("plin:cookie-consent-change", function (e) {
    var allow = !!(e.detail && e.detail.marketing);
    if (allow && !granted) {
      granted = true;
      fbq("consent", "grant");
      if (!rotaSensivel()) fbq("track", "PageView");
    } else if (!allow && granted) {
      granted = false;
      fbq("consent", "revoke");
    }
  });

  /** Visualização de rota do SPA: sempre reavalia rota sensível e consentimento. */
  window.__avetoPixelPageView = function () {
    if (!granted || rotaSensivel()) return false;
    fbq("track", "PageView");
    return true;
  };
})();
