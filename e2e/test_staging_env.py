import os
import unittest
from unittest.mock import patch
from staging_env import PROJECT_REF, SUPABASE_URL, assert_staging_db, public_config


class StagingDestinations(unittest.TestCase):
    def test_requires_explicit_public_destination(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(RuntimeError):
                public_config()

    def test_accepts_only_public_key_for_staging(self):
        with patch.dict(os.environ, {"TEST_SUPABASE_URL": SUPABASE_URL, "TEST_SUPABASE_ANON_KEY": "sb_publishable_" + "x" * 40}, clear=True):
            self.assertEqual(public_config()[0], PROJECT_REF)
            os.environ["TEST_SUPABASE_ANON_KEY"] = "sb_secret_" + "x" * 40
            with self.assertRaises(RuntimeError):
                public_config()

    def test_allows_staging_direct_and_pooler(self):
        for url in [f"postgresql://postgres:dummy@db.{PROJECT_REF}.supabase.co:5432/postgres", f"postgres://postgres.{PROJECT_REF}:dummy@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"]:
            self.assertEqual(assert_staging_db(url), url)

    def test_rejects_other_hosts_projects_and_overrides(self):
        for url in ["postgres://postgres:dummy@db.grtxmbffgmgnkawlvqhm.supabase.co/postgres", "postgres://postgres.other:dummy@aws-0-sa-east-1.pooler.supabase.com/postgres", f"postgres://postgres:dummy@db.{PROJECT_REF}.supabase.co/postgres?host=other", f"postgres://postgres:dummy@db.{PROJECT_REF}.supabase.co.evil.com/postgres"]:
            with self.subTest(url=url), self.assertRaises(RuntimeError):
                assert_staging_db(url)


if __name__ == "__main__":
    unittest.main()
