const projectRef = "utjhzpdbqzajrhnzcher";

function fail(message) {
  console.error(`::error::STAGING_SUPABASE_DB_URL: ${message}`);
  process.exit(1);
}

const value = process.env.STAGING_SUPABASE_DB_URL;
if (!value?.trim()) fail("secret ausente.");
if (/\b(?:Set-Clipboard|Read-Host|EscapeDataString)\b/.test(value) && !/^postgres(?:ql)?:\/\//.test(value)) {
  fail("o secret contém o comando PowerShell. Execute o comando e cole somente a URI gerada.");
}
if (/your-password/i.test(value)) fail("substitua o marcador [YOUR-PASSWORD] pela senha do banco.");
if (/\s/.test(value)) fail("cole a URL em uma linha, sem espaços. Codifique os espaços da senha como %20.");
if (value.includes("#")) fail("codifique o caractere # da senha como %23.");

let url;
try {
  url = new URL(value);
} catch {
  fail("URL inválida. Copie a conexão PostgreSQL em Connect → Session pooler e codifique os caracteres reservados da senha.");
}

if (!["postgres:", "postgresql:"].includes(url.protocol)) {
  fail("copie a URI que começa com postgresql:// em Connect → Session pooler.");
}
if (!url.username || !url.password) fail("a URI precisa conter o usuário e a senha do banco.");

const direct = url.hostname === `db.${projectRef}.supabase.co`;
const pooler = url.hostname.endsWith(".pooler.supabase.com") &&
  url.username.endsWith(`.${projectRef}`) && url.port === "5432";
if (!direct && !pooler) {
  fail("use a conexão do projeto aveto360-homologacao (direta ou Session pooler na porta 5432).");
}
