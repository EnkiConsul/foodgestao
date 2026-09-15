"""Regressão: garante que `delete_account` consegue realizar hard delete
após o conserto do trigger `prevent_hard_delete_account_with_history`.

Invoca a rotina de QA `_test_delete_account_hard_regression` server-side com
service_role (ver e2e/qa_admin.py — P0.2-C), que:
  1) cria uma conta vazia + um cartão + fatura apontando p/ OUTRA conta
     (cenário que o trigger quebrado bloqueava por causa da coluna errada)
     e valida que delete_account retorna 'hard' e remove a linha;
  2) aponta o cartão para uma 3ª conta e valida que o trigger volta a
     barrar (check_violation) quando a conta É a conta de pagamento.
"""
from __future__ import annotations
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qa_admin import qa_rpc, session_user_id  # noqa: E402



def main() -> int:
    result = qa_rpc("_test_delete_account_hard_regression",
                    {"_user_id": session_user_id()})
    print("body  :", json.dumps(result))
    if not isinstance(result, dict) or result.get("ok") is not True:
        print("❌ Rotina de regressão retornou resultado inesperado.")
        return 1

    payload = result
    if payload.get("ok") is True \
            and payload.get("hard_delete_result") == "hard" \
            and payload.get("guard_triggered") is True:
        print("✅ Regressão OK: hard delete permitido e trigger continua barrando conta ligada a cartão.")
        return 0
    print("❌ Regressão falhou:", payload)
    return 1


if __name__ == "__main__":
    sys.exit(main())
