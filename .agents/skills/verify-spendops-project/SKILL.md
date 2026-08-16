---
name: verify-spendops-project
description: SpendOps Dashboardのフロントエンドテスト、JavaScript構文、Lambda unittest、Terraform fmt・validate・stateを一括検証し、失敗箇所と現在状態を短く報告する。ユーザーがテスト、一括検証、回帰確認、動作確認、提出前確認、変更後確認、70件テスト、Terraform validateを依頼したときに使用する。
---

# SpendOpsを一括検証する

## 前提を確認する

1. `project-guidance/current-context.md`と`project-guidance/active-guardrails.md`を読む。期待件数や完了条件が必要な場合だけ`README.md`の該当見出しを読む。
2. `git status --short`で他者の変更を確認し、変更や未追跡ファイルを戻さない。
3. 実CSV、金融情報、認証情報をテスト出力へ含めない。
4. `verification_operator`が利用可能なら、会話履歴を渡さず検証範囲、対象パス、除外条件だけで委譲し、rootで結果を統合する。

## 検証する

既定ではフロント、Lambda、Terraformの順に全検証を実行する。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-spendops-project/scripts/Invoke-SpendOpsChecks.ps1
```

ランタイムがない領域だけを明示的に除外できる。除外は成功扱いにせず、未確認として報告する。

```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/verify-spendops-project/scripts/Invoke-SpendOpsChecks.ps1 -SkipLambda
```

## 報告する

- 成功したスイートと件数を示す。
- 最初の失敗コマンド、終了コード、原因候補を示す。
- 実行しなかった検証と理由を未確認として分離する。
- テストを通すためのコード変更は、ユーザーが修正まで依頼した場合だけ行う。
- AWS Apply、Destroy、デプロイ、外部公開を行わない。
- 失敗時はテスト名、関数名、エラー文字列を`rg`で検索し、`script.js`や`handler.py`を最初から全文読込しない。
