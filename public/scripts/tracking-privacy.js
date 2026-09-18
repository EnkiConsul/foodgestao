/* Privacidade de rastreamento (AUD-021).
 *
 * Carregado ANTES de qualquer tracker (Google tag, pixel da Meta) e antes do
 * React, para que nenhuma ferramenta de terceiros colete a URL de páginas
 * sensíveis nem endereços com credenciais temporárias (token de ativação,
 * código de recuperação, convite, retorno de OAuth).
 *
 * Regras:
 *  - rota sensível => nenhum evento/pageview de tracker;
 *  - URL com parâmetro sensível (query ou fragmento) => nenhum evento;
 *  - o que é enviado leva apenas o caminho e uma allowlist estrita de
 *    parâmetros de campanha; nunca fragmento, nunca referrer bruto.
 *
 * Espelhado em src/lib/security/trackingPrivacy.ts (teste garante paridade).
 */
(function () {
  var SENSITIVE_PREFIXES = [
    "/auth",
    "/login",
    "/dp/login",
    "/primeiro-acesso",
    "/ativar-acesso",
    "/redefinir-acesso",
    "/esqueci-senha",
    "/reset-password",
    "/redefinir-senha",
    "/convite",
    "/aceitar-convite",
    "/oauth",
    "/.lovable/oauth",
  ];

  var SENSITIVE_PARAMS = [
    "t",
    "c",
    "token",
    "token_hash",
    "code",
    "access_token",
    "refresh_token",
    "id_token",
    "provider_token",
    "invite",
    "invite_token",
    "confirmation_token",
    "recovery_token",
    "otp",
    "email",
    "cpf",
    "authorization_id",
    "redirect",
    "type",
    "apikey",
    "key",
    "secret",
    "password",
    "senha",
  ];

  var ALLOWED_PARAMS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "fbclid",
    "plano",
  ];

  function normalizarCaminho(pathname) {
    var p = String(pathname || "/");
    if (p.charAt(0) !== "/") p = "/" + p;
    return p.toLowerCase();
  }

  function isSensitivePath(pathname) {
    var p = normalizarCaminho(pathname);
    for (var i = 0; i < SENSITIVE_PREFIXES.length; i++) {
      var pref = SENSITIVE_PREFIXES[i];
      if (p === pref || p.indexOf(pref + "/") === 0) return true;
    }
    return false;
  }

  function chavesDe(texto) {
    var bruto = String(texto || "").replace(/^[?#]/, "");
    if (!bruto) return [];
    var chaves = [];
    var partes = bruto.split(/[&;]/);
    for (var i = 0; i < partes.length; i++) {
      if (!partes[i]) continue;
      var chave = partes[i].split("=")[0];
      try {
        chave = decodeURIComponent(chave);
      } catch (e) {
        /* mantém bruto */
      }
      chaves.push(chave.trim().toLowerCase());
    }
    return chaves;
  }

  function hasSensitiveParams(search, hash) {
    var chaves = chavesDe(search).concat(chavesDe(hash));
    for (var i = 0; i < chaves.length; i++) {
      if (!chaves[i]) continue;
      if (SENSITIVE_PARAMS.indexOf(chaves[i]) !== -1) return true;
      // Qualquer chave desconhecida dentro do fragmento é tratada como suspeita
      // apenas se não estiver na allowlist de campanha.
      if (ALLOWED_PARAMS.indexOf(chaves[i]) === -1 && /token|code|secret|senha|password|auth/.test(chaves[i])) {
        return true;
      }
    }
    return false;
  }

  /** Verdadeiro quando NENHUM tracker pode reportar esta navegação. */
  function isSensitiveLocation(pathname, search, hash) {
    return isSensitivePath(pathname) || hasSensitiveParams(search, hash);
  }

  /** Caminho + apenas parâmetros de campanha; nunca fragmento. */
  function sanitizePath(pathname, search) {
    var caminho = normalizarCaminho(pathname);
    var bruto = String(search || "").replace(/^\?/, "");
    if (!bruto) return caminho;
    var mantidos = [];
    var partes = bruto.split("&");
    for (var i = 0; i < partes.length; i++) {
      if (!partes[i]) continue;
      var par = partes[i].split("=");
      var chave = (par[0] || "").toLowerCase();
      if (ALLOWED_PARAMS.indexOf(chave) !== -1) mantidos.push(chave + "=" + (par[1] || ""));
    }
    return mantidos.length ? caminho + "?" + mantidos.join("&") : caminho;
  }

  /** URL absoluta sanitizada (mesma origem), sem fragmento nem segredos. */
  function sanitizeUrl(origin, pathname, search) {
    return String(origin || "") + sanitizePath(pathname, search);
  }

  /** Referrer reduzido: "internal" na mesma origem, origem externa ou "direct". */
  function safeReferrer(referrer, origin) {
    var bruto = String(referrer || "");
    if (!bruto) return "direct";
    try {
      var u = new URL(bruto);
      if (origin && u.origin === origin) return "internal";
      return u.origin;
    } catch (e) {
      return "direct";
    }
  }

  window.__avetoTracking = {
    SENSITIVE_PREFIXES: SENSITIVE_PREFIXES,
    SENSITIVE_PARAMS: SENSITIVE_PARAMS,
    ALLOWED_PARAMS: ALLOWED_PARAMS,
    isSensitivePath: isSensitivePath,
    hasSensitiveParams: hasSensitiveParams,
    isSensitiveLocation: isSensitiveLocation,
    sanitizePath: sanitizePath,
    sanitizeUrl: sanitizeUrl,
    safeReferrer: safeReferrer,
    /** Atalho para a URL atual do navegador. */
    currentIsSensitive: function () {
      var l = window.location;
      return isSensitiveLocation(l.pathname, l.search, l.hash);
    },
  };
})();
