/** The drill may destroy only an explicitly marked local disposable database. */
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
export const RESTORE_MARKER = 'aveto360:disposable-restore:v1';

function parseDatabaseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error('URL de banco inválida; valor omitido.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.search || url.hash) {
    throw new Error('Use URL PostgreSQL sem parâmetros de conexão ou fragmento.');
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database || database.includes('/')) throw new Error('Nome do banco inválido.');
  return { url, database, host: url.hostname.toLowerCase(), port: url.port || '5432' };
}

export function validateRestoreTarget(source, destination) {
  const src = parseDatabaseUrl(source);
  const dst = parseDatabaseUrl(destination);
  if (!LOCAL.has(dst.host) || !/^restore_drill(?:_[a-z0-9]+)*$/.test(dst.database)) {
    throw new Error('Restore recusado: destino deve ser local e ter nome restore_drill ou restore_drill_<sufixo>.');
  }
  const sameHost = src.host === dst.host || (LOCAL.has(src.host) && LOCAL.has(dst.host));
  if (sameHost && src.port === dst.port && src.database === dst.database) {
    throw new Error('Restore recusado: origem e destino apontam para o mesmo banco.');
  }
  return { database: dst.database };
}

export function validateRestoreMarker(identity, expectedDatabase) {
  if (identity?.database !== expectedDatabase || identity?.marker !== RESTORE_MARKER) {
    throw new Error('Restore recusado: identidade/marcador descartável do servidor não conferem.');
  }
}
