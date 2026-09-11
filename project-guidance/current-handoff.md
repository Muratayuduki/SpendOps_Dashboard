# SpendOps Dashboard 現在の引継ぎ

更新日: 2026-09-11（Asia/Tokyo）

このファイルには現在の停止地点、次に行う作業、未決事項だけを置く。過去の詳細ログは`project-guidance/history/`を日付・語句で検索する。

## 現在の停止地点

- AWS基盤は2026-09-11にTerraform Destroyを完了し、現在のTerraform stateは0エントリである。ローカルstateバックアップは保持している。
- Destroy前に、AWS外で削除済みのACMとCognito推定利用者数3→4をrefresh-onlyでstateへ反映した（AWS変更0）。Cognito 1件とDynamoDB 4件の削除保護解除Plan（0 add/5 change/0 destroy）を適用後、Destroy Plan（0 add/0 change/42 destroy、SHA256 `E05E92D13FCB1FB0187F376A73ABACF67B5832AF24FB359FBC1ABE4AFDFD4BD8`）をユーザー承認後に適用した。
- 2026-09-07の構築時には、公開サイト、health、demo-reportの200、認証必須reportsの未認証アクセス401、DynamoDB、Cognito、Lambda、S3、ACMの状態を確認済み。現在はDestroy済みのため利用できない。
- 初回ApplyはACM作成後にOAuth認証失効で中断したが、新規Planを監査・承認後、残り42件を適用した。再Planは追加0、変更0、削除0。
- ユーザー承認により、暗号化ロック付きremote backendは未実装のままlocal stateでApplyした。stateバックアップは取得済み。
- 比較選択カードのWeb資産は2026-09-07の本番公開環境へ反映済みだった。現在はDestroy済みで、ソースだけをローカルに保持している。
- Cloudflare DNSはTerraform管理外のため残存している。独自ドメイン、CloudFront alias、AWS基盤の再構築は未実施である。
- ローカルのアプリ、Lambda、Terraform定義、テストはリポジトリ内に保持している。構成図、最新完成動画、紹介サイトは`C:\development\SpendOps_Dashboard_Material\`へ分離済み。旧説明資料と制作中間物は2026-09-09に整理済みで、説明資料は現行仕様から新規作成する。
- 直近の記録済み自動テストはフロント47件、Lambda 24件、合計71件成功。
- 2026-08-01にリポジトリを`implementation/`、`materials/`、`project-guidance/`へ整理し、スキルとカスタムエージェントを追加した。
- 2026-08-01に常時読込を`current-context.md`と`active-guardrails.md`へ縮小し、長い履歴とガードレール設計資料を履歴・アーカイブへ分離した。

## 次の優先作業

1. AWS基盤を再構築する場合は、最新stateを確認し、新規Planを作成・監査してから明示承認を得る。
2. 提出時に、AWS基盤がDestroy済みであることを前提に、提出物とローカル成果物の確認範囲を確定する。
3. デザイン、自動分類・表記ゆれ対応、提出資料の仕上げを進める。

銀行CSV対応とAWS Cost Explorerは対象外。主機能の追加より提出物の仕上げを優先する。

## 未決事項

- PayPay、JCB、三井住友VISAで返金・取消がどう表現されるか。
- VISA固定列の正式な意味。
- PayPayチャージとカード明細など、異なるソース間の二重計上の扱い。
- 比較対象の最小人数を、利用者増加後に5人から引き上げるか。
- ソース別最終取込日と未取込警告をどのUIへ表示するか。
- Cognitoの新規登録では、確認コード入力を閉じると`UNCONFIRMED`ユーザーが残り、再登録時に登録済みと表示される。未確認ユーザーが確認コード入力へ戻ってコードを再送できる導線を実装し、新規登録、画面を閉じる、再開、メール確認、ログインまでを一連で検証する。

## 外部・期限依存

- 旧AWSアカウントの未匿名DynamoDBシステムバックアップ8件は2026-08-19と2026-08-27に自動失効予定だったが、2026-09-02時点では旧アカウントへアクセスできず、失効状態は要再確認。復元・コピーは行わない。
- Cloudflare DNSはTerraform管理外で残存している。AWS基盤再構築後に独自ドメインを扱う場合は、別途新規Planと明示承認が必要である。

## 詳細履歴の探し方

```powershell
rg -n "検索語|YYYY-MM-DD" project-guidance/history
```

2026-07までの統合履歴は`project-guidance/history/codex-handoff-through-2026-07.md`に保存している。

