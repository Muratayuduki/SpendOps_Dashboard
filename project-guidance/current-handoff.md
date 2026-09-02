# SpendOps Dashboard 現在の引継ぎ

更新日: 2026-08-01（Asia/Tokyo）

このファイルには現在の停止地点、次に行う作業、未決事項だけを置く。過去の詳細ログは`project-guidance/history/`を日付・語句で検索する。

## 現在の停止地点

- AWS基盤は2026-07-23にDestroy済みで、Terraform stateは0エントリ。
- 公開サイト、Cognitoログイン、API、DynamoDB保存、実ユーザー比較は停止中。
- ローカルのアプリ、Lambda、Terraform定義、テスト、構成図、展示資料、技術解説は保持している。
- 直近の記録済み自動テストはフロント46件、Lambda 24件、合計70件成功。
- 2026-08-01にリポジトリを`implementation/`、`materials/`、`project-guidance/`へ整理し、スキルとカスタムエージェントを追加した。
- 2026-08-01に常時読込を`current-context.md`と`active-guardrails.md`へ縮小し、長い履歴とガードレール設計資料を履歴・アーカイブへ分離した。

## 次の優先作業

1. デザインの配色、余白、ボタン、情報密度、可読性を仕上げる。
2. 自動分類と表記ゆれ対応を改善し、実例で分類精度を確認する。
3. README、構成図、Notionローカル版、企画・要件資料を現在状態へ同期する。
4. Google Slides / Google Docsの共有範囲を提出方法に合わせて確認する。

銀行CSV対応とAWS Cost Explorerは対象外。主機能の追加より提出物の仕上げを優先する。

## 未決事項

- PayPay、JCB、三井住友VISAで返金・取消がどう表現されるか。
- VISA固定列の正式な意味。
- PayPayチャージとカード明細など、異なるソース間の二重計上の扱い。
- 比較対象の最小人数を、利用者増加後に5人から引き上げるか。
- ソース別最終取込日と未取込警告をどのUIへ表示するか。

## 外部・期限依存

- 未匿名のDynamoDBシステムバックアップは復元・コピーせず、自動失効を待つ。過去分4件は2026-08-19、今回分4件は2026-08-27の予定。
- 再構築時は`activate_custom_domain = false`から始め、ACM発行後に独自ドメインを有効化する二段階手順を使う。
- Cloudflare DNSはTerraform管理外。

## 詳細履歴の探し方

```powershell
rg -n "検索語|YYYY-MM-DD" project-guidance/history
```

2026-07までの統合履歴は`project-guidance/history/codex-handoff-through-2026-07.md`に保存している。

