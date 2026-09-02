# `cache.yuduki0303.com` 公開設定手順書

## 0. 現在の状態（2026-07-23）

2026年7月23日にSpendOps DashboardのAWS基盤をTerraform Destroyで削除しました。CloudFront、ACM証明書、API、S3、Cognito、DynamoDBなどは削除済みで、Terraform stateは0件です。

CloudflareのDNSレコードはTerraform管理外のため、今回のDestroyでは変更していません。

- 証明書確認用の `_` から始まるCNAMEは、同じAWSアカウントで同じドメインのACM証明書を再作成するときに再利用できるため残す
- 公開用の `cache` CNAMEが残っている場合、削除済みCloudFrontを参照しているため、停止中は無効化または削除する
- 再構築時は、最初に `activate_custom_domain = false` でAWS基盤とACM証明書を作成する
- `terraform output custom_domain_validation_records` とCloudflareの確認用CNAMEが一致することを確認し、ACM証明書の発行を待つ
- 証明書発行後に `activate_custom_domain = true` でCloudFrontへ独自ドメインを接続する
- `terraform output -raw cloudfront_domain_name` で新しいCloudFrontドメインを取得し、Cloudflareの公開用 `cache` CNAMEをその値へ更新する

以下の手順と固定値は2026年7月22日の初回公開履歴です。再構築時は、必ず新しいTerraform outputを正として使用してください。

## 1. この手順で行うこと

取得済みの `yuduki0303.com` に `cache` というサブドメインを追加し、SpendOps Dashboardを次のURLで開けるようにします。

```text
https://cache.yuduki0303.com
```

サブドメインは新しく購入・申請するものではありません。所有しているドメインのDNS設定へレコードを追加して作成します。

この作業は、現在のサイトを止めないように二段階で進めます。

1. AWSでHTTPS証明書を申請し、Cloudflareで所有確認を行う
2. 証明書の発行後、CloudFrontと `cache.yuduki0303.com` を接続する

現在のCloudFront URLは予備として残すため、独自ドメイン設定に問題が起きても元のURLからサイトを確認できます。

## 2. 事前確認

- Cloudflareへログインできる
- CloudflareのWebサイト一覧に `yuduki0303.com` が表示されている
- `yuduki0303.com` の状態が「アクティブ」になっている
- DNSレコード一覧に、名前が `cache` の既存レコードがない
- AWSの認証が完了している

2026年7月22日の確認では、`yuduki0303.com` はCloudflareのネームサーバーを使用しており、`cache.yuduki0303.com` は未使用です。

## 3. 安全上の注意

- Cloudflareのパスワード、APIトークン、認証コードをCodexやファイルへ入力しない
- AWSのアクセスキーをTerraformファイルへ書かない
- この手順ではCloudflareのDNS設定を手動で行う
- 証明書確認用CNAMEは、証明書の自動更新にも使うため公開後も削除しない
- Cloudflareのプロキシは使わず、雲の色を灰色の「DNSのみ」にする

## 4. 第1段階：AWSで証明書を申請する（完了）

Terraformには、`cache.yuduki0303.com` 用の証明書を米国東部リージョンで申請する設定が追加されています。

第1段階のPlan内容は次のとおりです。

| 操作 | 件数 | 内容 |
|---|---:|---|
| 追加 | 1 | `cache.yuduki0303.com` 用のHTTPS証明書 |
| 更新 | 2 | 店舗チェーン絞り込みの画面ファイル |
| 削除 | 0 | なし |

この段階ではCloudFrontのドメイン設定、API、データベース、ログイン、保存済みデータは変更しません。

2026年7月22日に第1段階を適用しました。結果は追加1件、更新2件、削除0件です。証明書は申請済みで、現在はCloudflareへのDNS登録を待っています。

## 5. Cloudflareへ証明書確認用CNAMEを追加する

### 5.1 DNS画面を開く

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)へログインする
2. Webサイト一覧から `yuduki0303.com` を選択する
3. 左側メニューの「DNS」を選択する
4. 「レコード」を選択する
5. 「レコードを追加」を押す

### 5.2 表示された値を入力する

次の値を省略せず入力してください。

| Cloudflareの項目 | 入力値 |
|---|---|
| タイプ | `CNAME` |
| 名前 | `_b85ec5dd1120a80579c3b03038b0ca5d.cache` |
| ターゲット | `_130982b92457054d2df9cc72f66e4e58.jkddzztszm.acm-validations.aws` |
| プロキシステータス | `DNSのみ`（灰色の雲） |
| TTL | `自動` |

入力内容をまとめると次のとおりです。

```text
タイプ: CNAME
名前: _b85ec5dd1120a80579c3b03038b0ca5d.cache
ターゲット: _130982b92457054d2df9cc72f66e4e58.jkddzztszm.acm-validations.aws
プロキシ: DNSのみ
TTL: 自動
```

Cloudflareが名前の末尾へ `.yuduki0303.com` を自動補完する場合があります。保存後の完全な名前が次の形になっていれば正常です。

```text
_b85ec5dd1120a80579c3b03038b0ca5d.cache.yuduki0303.com
```

### 5.3 保存後の確認

1. 「保存」を押す
2. DNSレコード一覧に追加したCNAMEが表示されていることを確認する
3. 雲の色が灰色で「DNSのみ」になっていることを確認する
4. Codexへ「追加しました」と伝える

2026年7月22日にDNSレコードの反映と証明書の「発行済み」を確認しました。確認用CNAMEは証明書の自動更新にも使うため、今後も削除しないでください。

## 6. 第2段階：CloudFrontへ独自ドメインを接続する

証明書が「発行済み」になったため、Terraformの独自ドメイン設定を有効にしています。

第2段階では次を変更します。

- CloudFrontの別名へ `cache.yuduki0303.com` を追加
- CloudFrontへ発行済みの証明書を設定
- APIのアクセス許可元へ `https://cache.yuduki0303.com` を追加
- Terraformの公開URL表示を独自サブドメインへ変更

2026年7月22日に第2段階のTerraform Planを作成しました。

| 操作 | 件数 | 内容 |
|---|---:|---|
| 追加 | 0 | なし |
| 更新 | 3 | CloudFront、APIのアクセス許可元、S3読取ポリシーの再計算 |
| 削除 | 0 | なし |

2026年7月22日にユーザー承認後、第2段階を適用しました。実行結果は追加0件、変更2件、削除0件です。S3読取ポリシーは再計算されましたが、差分がなかったため実際の変更対象にはなりませんでした。データベース、ログイン、保存済みデータは変更していません。

CloudFrontは「配信済み」で、独自ドメイン、HTTPS証明書、TLS 1.2、APIのアクセス許可元が反映されています。Apply後のTerraform Planも「変更なし」です。

## 7. Cloudflareへ公開用CNAMEを追加する

第2段階のTerraform Apply後、2026年7月22日にCloudflareへ公開用レコードを追加しました。証明書確認用CNAMEとは別のレコードです。

1. Cloudflareの `yuduki0303.com` を開く
2. 「DNS」→「レコード」を開く
3. 「レコードを追加」を押す
4. 次の値を入力する

| Cloudflareの項目 | 入力値 |
|---|---|
| タイプ | `CNAME` |
| 名前 | `cache` |
| ターゲット | `dj96v59f267v9.cloudfront.net` |
| プロキシステータス | `DNSのみ`（灰色の雲） |
| TTL | `自動` |

5. 「保存」を押す
6. `https://cache.yuduki0303.com` を開く

## 8. 公開後の確認項目

- [x] `https://cache.yuduki0303.com` がHTTPSで開く
- [x] HTTPS証明書エラーがなく、HTTP 200になる
- [x] ログイン画面が表示される
- [x] 独自ドメインからAPIへの通信許可がHTTP 204で返る
- ログイン後に保存済みの結果を取得できる
- PayPayとカードを読み込める
- 店舗チェーンの絞り込みが表示される
- [x] 元のCloudFront URLも引き続きHTTP 200で開ける
- [x] APIのヘルス確認がHTTP 200になる
- [x] Terraformの再Planが「変更なし」になる

ログイン情報は取り扱わないため、ログイン後の保存済み結果取得とCSV読込はユーザーが画面上で最終確認します。

## 9. 問題が発生した場合

### 証明書が「検証保留」のまま

- 確認用CNAMEが「DNSのみ」になっているか確認する
- 名前とターゲットに入力漏れがないか確認する
- 名前が `.yuduki0303.com.yuduki0303.com` のように二重になっていないか確認する
- 確認用CNAMEを削除せず、DNS反映を待つ

### 証明書エラーが表示される

- 第2段階のCloudFront更新が完了する前に、公開用CNAMEを追加していないか確認する
- CloudFrontへ `cache.yuduki0303.com` が設定されているか確認する
- ACM証明書が「発行済み」になっているか確認する

### 403エラーが表示される

- CloudFrontの更新が完了しているか確認する
- 公開用CNAMEのターゲットが `dj96v59f267v9.cloudfront.net` になっているか確認する
- Cloudflareのプロキシが「DNSのみ」になっているか確認する

### ログイン後の保存・取得に失敗する

- APIのアクセス許可元へ `https://cache.yuduki0303.com` が追加されているか確認する
- ブラウザを再読み込みしてから再度ログインする

## 10. 元に戻す方法

独自サブドメイン側で問題が起きた場合は、Cloudflareの公開用CNAME（名前が `cache` のレコード）を一時的に無効化または削除し、元のCloudFront URLを使用します。

証明書確認用の `_` から始まるCNAMEは、自動更新に必要なため削除しません。CloudFront、API、データベース、ログイン情報、保存済みデータはそのまま残ります。

## 11. 作業完了チェックリスト

- [x] 第1段階のTerraform Planを確認した
- [x] 第1段階のApplyを承認した
- [x] 証明書確認用CNAMEをCloudflareへ追加した
- [x] 確認用CNAMEを「DNSのみ」にした
- [x] ACM証明書が「発行済み」になった
- [x] 第2段階のTerraform Planを確認した
- [x] 第2段階のApplyを承認した
- [x] 公開用の `cache` CNAMEをCloudflareへ追加した
- [x] `https://cache.yuduki0303.com` を開けた
- [ ] ログインとデータ取得を確認した
- [x] Terraformの再Planが「変更なし」になった
