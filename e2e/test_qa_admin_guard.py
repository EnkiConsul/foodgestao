"""Testes da barreira de ambiente do qa_admin (sem acessar banco)."""
import os, sys, unittest
from unittest import mock
sys.path.insert(0, os.path.dirname(__file__))
import qa_admin as q

H, P = q.HOMOLOG_PROJECT_REF, "grtxmbffgmgnkawlvqhm"


class Guard(unittest.TestCase):
    def test_homologacao_valida(self):
        self.assertEqual(q.assert_authorized_test_database(f"postgresql://postgres:x@db.{H}.supabase.co:5432/postgres"), H)
        self.assertEqual(q.assert_authorized_test_database(f"postgresql://postgres.{H}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"), H)

    def test_producao(self):
        for u in (f"postgresql://postgres:x@db.{P}.supabase.co/postgres",
                  f"postgresql://postgres.{P}:x@aws-0-sa-east-1.pooler.supabase.com/postgres"):
            with self.assertRaises(q.UnauthorizedDatabaseError): q.assert_authorized_test_database(u)

    def test_desconhecido(self):
        for u in ("postgresql://postgres:x@localhost/postgres",
                  f"postgresql://postgres:x@db.{H}.supabase.co.evil.com/postgres",
                  "postgresql://postgres:x@db.abcdefghijklmnopqrst.supabase.co/postgres"):
            with self.assertRaises(q.UnauthorizedDatabaseError): q.assert_authorized_test_database(u)

    def test_sem_identificacao(self):
        for u in ("", "postgresql:///postgres", "postgresql://aws-0-sa-east-1.pooler.supabase.com/postgres",
                  "postgresql://postgres:x@aws-0-sa-east-1.pooler.supabase.com/postgres"):
            with self.assertRaises(q.UnauthorizedDatabaseError): q.assert_authorized_test_database(u)

    def test_divergente(self):
        with self.assertRaises(q.UnauthorizedDatabaseError):
            q.assert_authorized_test_database(f"postgresql://postgres.{P}:x@db.{H}.supabase.co/postgres")
        with self.assertRaises(q.UnauthorizedDatabaseError):
            q.assert_authorized_test_database(f"postgresql://postgres.{H}:x@db.{H}.supabase.co/postgres")

    def test_qa_rpc_bloqueia_antes_do_psql(self):
        with mock.patch.dict(os.environ, {"SUPABASE_DB_URL": f"postgresql://postgres:x@db.{P}.supabase.co/postgres"}), \
             mock.patch.object(q.subprocess, "run") as run:
            with self.assertRaises(q.UnauthorizedDatabaseError): q.qa_rpc("_test_balance_engine")
            run.assert_not_called()


if __name__ == "__main__":
    unittest.main()
