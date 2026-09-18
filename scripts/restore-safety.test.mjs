import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRestoreTarget, validateRestoreMarker, RESTORE_MARKER } from './restore-safety.mjs';

const source = 'postgresql://reader:fake@staging.invalid:5432/postgres';
test('permite somente banco local descartável com nome específico', () => {
  assert.deepEqual(validateRestoreTarget(source, 'postgres://u:fake@127.0.0.1:5432/restore_drill_ci'), {database: 'restore_drill_ci'});
});
for (const target of [
  'postgres://u:fake@db.grtxmbffgmgnkawlvqhm.supabase.co/restore_drill',
  'postgres://u:fake@localhost/postgres',
  'postgres://u:fake@localhost/restore_drill?host=production.invalid',
  'postgres://u:fake@localhost/restore_drill#fragment',
  'https://localhost/restore_drill',
  'invalid-secret-string',
]) {
  test('recusa destino inseguro sem reproduzir credencial: ' + target.split('@').pop(), () => {
    assert.throws(() => validateRestoreTarget(source, target), error => !error.message.includes('fake') && !error.message.includes('invalid-secret-string'));
  });
}
test('recusa aliases locais, protocolos e usuários diferentes para o mesmo banco', () => {
  assert.throws(() => validateRestoreTarget('postgres://a:fake@localhost/restore_drill', 'postgresql://b:fake@[::1]:5432/restore_drill'));
});
test('destino deve confirmar marcador e identidade consultados', () => {
  validateRestoreMarker({database:'restore_drill',marker:RESTORE_MARKER}, 'restore_drill');
  for (const identity of [null, {}, {database:'postgres',marker:RESTORE_MARKER}, {database:'restore_drill',marker:null}]) {
    assert.throws(() => validateRestoreMarker(identity, 'restore_drill'));
  }
});
