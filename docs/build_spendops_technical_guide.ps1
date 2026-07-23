param(
  [string]$OutputPath = (Join-Path (Get-Location) 'outputs\SpendOps_Dashboard_技術解説.docx')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Escape-Xml([string]$Text) {
  return [System.Security.SecurityElement]::Escape($Text)
}

function New-Run {
  param(
    [string]$Text,
    [bool]$Bold = $false,
    [string]$Color = '',
    [int]$SizeHalfPoints = 0
  )

  $properties = @('<w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/>')
  if ($Bold) { $properties += '<w:b/>' }
  if ($Color) { $properties += "<w:color w:val=`"$Color`"/>" }
  if ($SizeHalfPoints -gt 0) {
    $properties += "<w:sz w:val=`"$SizeHalfPoints`"/><w:szCs w:val=`"$SizeHalfPoints`"/>"
  }
  return '<w:r><w:rPr>' + ($properties -join '') + '</w:rPr><w:t xml:space="preserve">' + (Escape-Xml $Text) + '</w:t></w:r>'
}

function New-Paragraph {
  param(
    [string]$Text,
    [string]$Style = 'Normal',
    [bool]$KeepNext = $false
  )

  $keep = if ($KeepNext) { '<w:keepNext/>' } else { '' }
  return '<w:p><w:pPr><w:pStyle w:val="' + $Style + '"/>' + $keep + '</w:pPr>' + (New-Run -Text $Text) + '</w:p>'
}

function New-LeadParagraph {
  param(
    [string]$Lead,
    [string]$Text,
    [string]$Style = 'Normal'
  )

  return '<w:p><w:pPr><w:pStyle w:val="' + $Style + '"/></w:pPr>' +
    (New-Run -Text $Lead -Bold $true) + (New-Run -Text $Text) + '</w:p>'
}

function New-ListParagraph {
  param(
    [string]$Text,
    [int]$NumId = 1
  )

  return '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + $NumId + '"/></w:numPr></w:pPr>' + (New-Run -Text $Text) + '</w:p>'
}

function New-HyperlinkParagraph {
  param(
    [string]$Label,
    [string]$Description,
    [string]$RelationshipId
  )

  $linkRun = '<w:hyperlink r:id="' + $RelationshipId + '" w:history="1"><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:color w:val="1155CC"/><w:u w:val="single"/></w:rPr><w:t>' + (Escape-Xml $Label) + '</w:t></w:r></w:hyperlink>'
  $suffix = if ($Description) { New-Run -Text (' - ' + $Description) -Color '555555' -SizeHalfPoints 18 } else { '' }
  return '<w:p><w:pPr><w:pStyle w:val="SourceText"/></w:pPr>' + $linkRun + $suffix + '</w:p>'
}

function New-PageBreak {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function New-Cell {
  param(
    [string]$Text,
    [int]$Width,
    [bool]$Bold = $false,
    [string]$Align = 'left'
  )

  $paragraph = '<w:p><w:pPr><w:pStyle w:val="TableText"/><w:jc w:val="' + $Align + '"/></w:pPr>' + (New-Run -Text $Text -Bold $Bold) + '</w:p>'
  return '<w:tc><w:tcPr><w:tcW w:w="' + $Width + '" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>' + $paragraph + '</w:tc>'
}

function New-Table {
  param(
    [array]$Rows,
    [int[]]$Widths,
    [bool]$HeaderRow = $true
  )

  $grid = ($Widths | ForEach-Object { '<w:gridCol w:w="' + $_ + '"/>' }) -join ''
  $rowXml = for ($rowIndex = 0; $rowIndex -lt $Rows.Count; $rowIndex++) {
    $cells = for ($columnIndex = 0; $columnIndex -lt $Widths.Count; $columnIndex++) {
      New-Cell -Text ([string]$Rows[$rowIndex][$columnIndex]) -Width $Widths[$columnIndex] -Bold ($HeaderRow -and $rowIndex -eq 0)
    }
    $rowProperties = if ($HeaderRow -and $rowIndex -eq 0) { '<w:trPr><w:tblHeader/></w:trPr>' } else { '' }
    '<w:tr>' + $rowProperties + ($cells -join '') + '</w:tr>'
  }

  return @"
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9360" w:type="dxa"/>
    <w:tblInd w:w="0" w:type="dxa"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="DADCE0"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="DADCE0"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="DADCE0"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="DADCE0"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="DADCE0"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="DADCE0"/>
    </w:tblBorders>
    <w:tblCellMar>
      <w:top w:w="80" w:type="dxa"/><w:start w:w="120" w:type="dxa"/>
      <w:bottom w:w="80" w:type="dxa"/><w:end w:w="120" w:type="dxa"/>
    </w:tblCellMar>
  </w:tblPr>
  <w:tblGrid>$grid</w:tblGrid>
  $($rowXml -join "`n")
</w:tbl>
"@
}

function Add-ZipEntry {
  param(
    [System.IO.Compression.ZipArchive]$Archive,
    [string]$Name,
    [string]$Content
  )

  $entry = $Archive.CreateEntry($Name, [System.IO.Compression.CompressionLevel]::Optimal)
  $stream = $entry.Open()
  $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
  try { $writer.Write($Content) } finally { $writer.Dispose(); $stream.Dispose() }
}

$body = [System.Collections.Generic.List[string]]::new()

$body.Add((New-Paragraph -Text 'SpendOps Dashboard 技術解説' -Style 'DocTitle' -KeepNext $true))
$body.Add((New-Paragraph -Text 'セキュリティ、個人情報保護、システム構成、技術選定、検証範囲' -Style 'Subtitle' -KeepNext $true))
$body.Add((New-Paragraph -Text '更新日: 2026年7月23日 / 展示評価用の補足資料' -Style 'Meta'))

$body.Add((New-Paragraph -Text 'この資料で確認できること' -Style 'Heading1' -KeepNext $true))
$body.Add((New-Paragraph -Text 'この資料は、展示用スライドで紹介するSpendOps Dashboardについて、実装の仕組みと安全性の根拠を確認するための技術資料です。一般向けの説明では省いた詳細を、実装済み・未実装・今後の確認事項に分けて記載します。'))
$body.Add((New-LeadParagraph -Lead '結論: ' -Text 'CSV原本をクラウドへ送らず、ブラウザで必要な形へ変換してから本人単位で保存する設計です。匿名比較にも最低人数条件を設けています。一方、現在はAWS基盤を削除済みのため、公開サイト、ログイン、クラウド保存、実ユーザー比較は停止しています。'))

$body.Add((New-Paragraph -Text '現在の状態' -Style 'Heading2' -KeepNext $true))
$statusRows = @(
  @('項目', '2026年7月23日時点'),
  @('対応データ', 'PayPay、JCB、三井住友VISAのCSV'),
  @('実装済み', 'CSV解析、月別・年間・全期間レポート、匿名比較、分類修正、本人別分類学習'),
  @('検証', 'フロントエンド46件、Lambda 24件、合計70件の自動テスト成功'),
  @('公開状態', 'Terraform Destroy後のため停止中。ソース、テスト、Terraform定義は保持'),
  @('対象外', '銀行CSV、AWS料金分析、収入・資産推移、予算管理')
)
$body.Add((New-Table -Rows $statusRows -Widths @(2100, 7260)))

$body.Add((New-Paragraph -Text '読み進め方' -Style 'Heading2' -KeepNext $true))
$body.Add((New-ListParagraph -Text '仕組みを知りたい: 「1. データの流れ」「2. システム構成」' -NumId 1))
$body.Add((New-ListParagraph -Text '安全性を確認したい: 「4. セキュリティ」「5. 個人情報保護」' -NumId 1))
$body.Add((New-ListParagraph -Text '技術選定を評価したい: 「3. 技術選定の妥当性」「7. 検証範囲」' -NumId 1))
$body.Add((New-ListParagraph -Text '弱点や今後を確認したい: 「8. 制約とリスク」「9. 次の改善」' -NumId 1))

$body.Add((New-PageBreak))
$body.Add((New-Paragraph -Text '1. CSVをクラウドへ置かず、ブラウザで整える' -Style 'Heading1' -KeepNext $true))
$body.Add((New-Paragraph -Text 'PayPay、JCB、三井住友VISAでは文字コード、ヘッダー位置、列の並びが異なります。SpendOpsはファイルを選択した端末内でCSVを読み、共通の取引形式へ変換します。'))

$flowRows = @(
  @('段階', '処理', 'データの扱い'),
  @('1', 'CSVを選択', 'ファイルはブラウザが読み、原本をAWSへ送らない'),
  @('2', '形式判定・正規化', 'UTF-8 / Shift_JIS、ヘッダー位置、列構成の違いを吸収'),
  @('3', '端末内レポート', '月別、年間、全期間、カテゴリ、比較、明細を表示'),
  @('4', '認証済み保存', '必要な正規化済み取引と月別集計だけをJWT付きで送信'),
  @('5', 'Lambda検証', '入力形式、本人ID、集計整合性、重複を検証して保存'),
  @('6', '比較表示', '条件を満たす匿名集計だけを本人の結果と比較')
)
$body.Add((New-Table -Rows $flowRows -Widths @(800, 2600, 5960)))

$body.Add((New-Paragraph -Text '保存前の主な処理' -Style 'Heading2' -KeepNext $true))
$body.Add((New-ListParagraph -Text '収入行を支出集計から除外し、対象列を固定11カテゴリへ正規化する。' -NumId 1))
$body.Add((New-ListParagraph -Text '利用先に7〜19桁の連続数字が含まれる場合は、Lambdaで [redacted] へ置換する。' -NumId 1))
$body.Add((New-ListParagraph -Text '取引番号は送信せず、正規化項目と同一明細の出現順から決定的な取引キーを生成する。' -NumId 1))
$body.Add((New-ListParagraph -Text '問題のある行があっても、残りの行で分析を継続する部分取込方針を採用する。' -NumId 1))

$body.Add((New-Paragraph -Text '2. システム構成' -Style 'Heading1' -KeepNext $true))
$body.Add((New-Paragraph -Text 'ブラウザ → Cognito認証 → API Gateway → Lambda → DynamoDB というAPI経路と、非公開S3 → CloudFront → ブラウザという画面配信経路を分けています。Terraformはこれらの構成をコードとして管理します。'))
$body.Add((New-LeadParagraph -Lead '重要な境界: ' -Text 'CSV原本の解析はブラウザ内で完結します。APIが受け取るのは、画面復元と集計に必要な正規化済みデータだけです。'))

$body.Add((New-PageBreak))
$body.Add((New-Paragraph -Text '3. 技術選定は「小規模でも安全に試せること」を優先' -Style 'Heading1' -KeepNext $true))
$technologyRows = @(
  @('領域', '採用技術', '妥当と判断した理由', '注意点'),
  @('画面', 'HTML / CSS / JavaScript', '静的配信でき、CSV解析を端末内へ置ける。依存関係が少ない', '画面が大きくなると部品管理が難しい'),
  @('API', 'API Gateway + Lambda', 'CSV取込や閲覧時だけ処理する構成と相性がよく、サーバー管理を減らせる', '実行時間、同時実行、コールドスタートを考慮する'),
  @('認証', 'Amazon Cognito', 'ユーザープール、JWT、グループで本人・管理者を分離できる', 'トークンの保管と検証はアプリ側でも慎重に扱う'),
  @('DB', 'DynamoDB', 'user_idを中心にした本人単位の読取へ合わせやすい', '結合や自由な横断集計には向かない'),
  @('配信', 'S3 + CloudFront OAC', 'S3を直接公開せず、HTTPS配信経路を限定できる', '証明書、キャッシュ、独自ドメイン管理が必要'),
  @('構成管理', 'Terraform', 'Planで変更内容を確認してからApplyでき、再構築手順をコード化できる', 'State保護と承認手順が必要')
)
$body.Add((New-Table -Rows $technologyRows -Widths @(1200, 1850, 3950, 2360)))

$body.Add((New-Paragraph -Text '選定の評価' -Style 'Heading2' -KeepNext $true))
$body.Add((New-Paragraph -Text '学校課題として実装範囲を説明しやすく、利用者数が少ない段階で常時稼働サーバーを管理しない構成です。一方、将来複雑な検索や大量の横断集計が必要になれば、DB設計や分析基盤を再検討する余地があります。'))

$body.Add((New-PageBreak))
$body.Add((New-Paragraph -Text '4. 認証・認可・保存先を層ごとに分ける' -Style 'Heading1' -KeepNext $true))
$body.Add((New-Paragraph -Text 'セキュリティは一つの機能に任せず、ブラウザ、API、Lambda、DB、配信基盤の各層で制限します。'))

$body.Add((New-Paragraph -Text '認証とAPI' -Style 'Heading2' -KeepNext $true))
$body.Add((New-ListParagraph -Text 'Cognitoでメール確認、新規登録、ログインを行い、ID・Access・Refresh TokenはsessionStorageだけに保持する。' -NumId 1))
$body.Add((New-ListParagraph -Text '保護APIはAPI GatewayのJWT Authorizerを必須とし、Authorizationヘッダーのトークンを検証する。' -NumId 1))
$body.Add((New-ListParagraph -Text 'LambdaはJWTの本人識別子を保存キーに使い、一般ユーザーのデータを本人単位で分離する。' -NumId 1))
$body.Add((New-ListParagraph -Text '管理者APIはCognitoのadminsグループを確認し、一般ユーザーと権限を分ける。' -NumId 1))

$body.Add((New-Paragraph -Text '保存と配信' -Style 'Heading2' -KeepNext $true))
$body.Add((New-ListParagraph -Text 'DynamoDB 4テーブルはサーバー側暗号化、PITR、削除保護をTerraformで定義する。' -NumId 1))
$body.Add((New-ListParagraph -Text '静的Web資産用S3はPublic Access Blockを有効にし、CloudFront OACだけへ読取を許可する。' -NumId 1))
$body.Add((New-ListParagraph -Text 'S3はSSE-S3、CloudFrontはHTTPS、APIは許可したオリジンだけを対象にする。' -NumId 1))
$body.Add((New-ListParagraph -Text 'LambdaのIAM権限は対象テーブルと必要な操作へ限定する。' -NumId 1))

$body.Add((New-Paragraph -Text 'ログの方針' -Style 'Heading2' -KeepNext $true))
$body.Add((New-Paragraph -Text 'CloudWatch LogsへCSV全文、リクエスト本文、利用先、カード番号、認証情報を出さない方針です。実運用では、設定変更後にもログ内容を継続監査する必要があります。'))

$body.Add((New-PageBreak))
$body.Add((New-Paragraph -Text '5. 個人情報保護は「集めない・分ける・比較を粗くする」' -Style 'Heading1' -KeepNext $true))
$privacyRows = @(
  @('AWSへ保存する', 'AWSへ保存しない'),
  @('本人ID、取引日、金額、正規化した利用先、固定カテゴリ、支払い元', 'CSV原本、ファイル名、未加工行'),
  @('月別集計、取込ID、取込日時、検証件数', 'カード番号、口座番号、パスワード、確認コード'),
  @('分類ルールの照合用SHA-256値、支払い元、固定カテゴリ', '氏名、商品名、メール本文全文、分類控えファイル')
)
$body.Add((New-Table -Rows $privacyRows -Widths @(4680, 4680)))

$body.Add((New-Paragraph -Text '匿名比較の条件' -Style 'Heading2' -KeepNext $true))
$body.Add((New-ListParagraph -Text '本人を除く他ユーザー5人以上の完全月がある場合だけ、実平均を返す。' -NumId 1))
$body.Add((New-ListParagraph -Text '月途中の暫定月や、PayPay・カードの片方しかない統合月を実比較から除外する。' -NumId 1))
$body.Add((New-ListParagraph -Text '5人未満では実平均を返さず、合成参考値へ切り替え、実統計ではないことを画面へ表示する。' -NumId 1))
$body.Add((New-ListParagraph -Text '管理者にも他人の生明細、氏名、カード情報を表示しない。' -NumId 1))

$body.Add((New-Paragraph -Text '同意・退会・バックアップ' -Style 'Heading2' -KeepNext $true))
$body.Add((New-Paragraph -Text '登録時に匿名集計を比較へ利用する同意を取ります。退会時には本人に紐づく取引・月別集計・取込記録・ユーザー情報を削除する設計ですが、退会APIは誤操作防止のため現在HTTP 501で無効化中です。長期保持する比較バックアップは月別集計だけを匿名IDへ置換し、元IDとの対応表を残していません。'))
$body.Add((New-LeadParagraph -Lead '法令面の注意: ' -Text '本資料は個人情報保護法などへの適合を断定するものではありません。実運用前には利用規約、プライバシーポリシー、保存期間、削除手順、事故対応、問い合わせ窓口を専門家を含めて確認する必要があります。' -Style 'Note'))

$body.Add((New-PageBreak))
$body.Add((New-Paragraph -Text '6. データ品質と重複防止' -Style 'Heading1' -KeepNext $true))
$body.Add((New-Paragraph -Text '支出分析は、形式が違うCSVを同じ意味へ揃えられるかで品質が決まります。SpendOpsは形式判定、カテゴリ正規化、部分取込、本人別ルールを組み合わせています。'))
$body.Add((New-ListParagraph -Text 'PayPayはUTF-8、JCBと三井住友VISAはShift_JISを基本として読み分ける。' -NumId 1))
$body.Add((New-ListParagraph -Text '利用先の表記揺れやコンビニ支店名をチェーン単位へまとめる。' -NumId 1))
$body.Add((New-ListParagraph -Text '固定11カテゴリへ正規化し、不明な利用先だけを利用者が修正できる。' -NumId 1))
$body.Add((New-ListParagraph -Text '本人別分類ルールは利用先名を保存せず、支払い元と正規化利用先から作るSHA-256値で照合する。' -NumId 1))
$body.Add((New-ListParagraph -Text 'Lambdaは正規化項目から取引キーを作り、importBatchIdと合わせて重複登録を抑止する。' -NumId 1))

$body.Add((New-Paragraph -Text 'データ品質で残る課題' -Style 'Heading2' -KeepNext $true))
$body.Add((New-Paragraph -Text '返金・取消の表現は実CSVで追加確認が必要です。また、PayPayチャージとカード明細のように異なるソース間で同じ支出が現れる場合は、自動で重複解消していません。'))

$body.Add((New-Paragraph -Text '7. 70件の自動テストで主な経路を確認' -Style 'Heading1' -KeepNext $true))
$testRows = @(
  @('対象', '件数', '主な確認内容'),
  @('フロントエンド', '46', 'CSV解析、文字コード、集計、比較、統合、明細絞り込み、分類修正、認証補助、アイコン参照'),
  @('Lambda', '24', '入力検証、本人分離、保存、匿名比較、管理者認可、分類ルール、退会APIの安全停止'),
  @('Terraform', '-', 'fmt、validate、state 0件を確認。現在はAWSリソース削除済み')
)
$body.Add((New-Table -Rows $testRows -Widths @(1800, 900, 6660)))
$body.Add((New-Paragraph -Text '自動テストは実装の回帰を減らしますが、公開環境でのログイン、メール確認、実ブラウザ、AWSサービス間通信をすべて保証するものではありません。AWS再構築後には公開E2E確認が必要です。'))

$body.Add((New-PageBreak))
$body.Add((New-Paragraph -Text '8. 現在の制約とリスク' -Style 'Heading1' -KeepNext $true))
$riskRows = @(
  @('状態', '影響', '対応方針'),
  @('AWS基盤を削除済み', '公開サイト、ログイン、クラウド保存、実比較を現在利用できない', '再構築する場合は新しいTerraform Planを確認し、承認後にApplyする'),
  @('最終取込日警告が未表示', '利用者が古いデータと気づきにくい', 'ソース別の最終取込日と未取込警告を画面へ追加する'),
  @('行別エラー詳細が未表示', '修正すべきCSV行を特定しにくい', '失敗行番号と理由を表示する'),
  @('返金・取消ルールが未確定', '支出が過大・過小になる可能性がある', '3サービスの実例を確認してテストを追加する'),
  @('退会APIがHTTP 501', '利用者自身で削除を完了できない', '誤削除防止UIと再認証を設計して有効化する'),
  @('比較データが少ない', '実平均を出せず合成参考値になる月がある', '参加者増加後に匿名化基準と比較指標を再評価する')
)
$body.Add((New-Table -Rows $riskRows -Widths @(2100, 3500, 3760)))

$body.Add((New-Paragraph -Text '9. 次に行う改善' -Style 'Heading1' -KeepNext $true))
$body.Add((New-ListParagraph -Text '展示でライブデモを行う場合は、AWS料金と公開範囲を確認してから基盤を再構築し、登録・CSV取込・再読込までE2E確認する。' -NumId 2))
$body.Add((New-ListParagraph -Text '最終取込日、未取込警告、行別エラーを追加し、結果の信頼性を画面上で判断できるようにする。' -NumId 2))
$body.Add((New-ListParagraph -Text '返金・取消・異なる支払い元間の重複を実CSVで検証し、ルールとテストを追加する。' -NumId 2))
$body.Add((New-ListParagraph -Text '退会処理、保存期間、事故対応、運用ログ監査を含む実運用手順を整備する。' -NumId 2))
$body.Add((New-ListParagraph -Text '利用者数が増えた段階で、比較の最小人数、指標、再識別リスクを再評価する。' -NumId 2))

$body.Add((New-LeadParagraph -Lead '技術面の総括: ' -Text 'SpendOpsは、複数形式のCSVを一つの支出レポートへ揃える機能だけでなく、金融データをどこまで扱うかを明確に分けた点に価値があります。現在の停止状態と未実装項目を含めて説明することで、実装範囲を過大に見せず評価できる資料としています。'))

$body.Add((New-PageBreak))
$body.Add((New-Paragraph -Text '参考資料' -Style 'Heading1' -KeepNext $true))
$body.Add((New-Paragraph -Text 'プロジェクト内資料' -Style 'Heading2' -KeepNext $true))
$body.Add((New-ListParagraph -Text 'README.md - 最新仕様、公開停止状態、テスト結果、制約' -NumId 1))
$body.Add((New-ListParagraph -Text 'docs/system_prompt_guardrails_v2.md - セキュリティと作業ガードレール' -NumId 1))
$body.Add((New-ListParagraph -Text 'docs/codex_handoff.md - 実装・検証・削除・匿名バックアップの履歴' -NumId 1))
$body.Add((New-ListParagraph -Text 'terraform/*.tf - Cognito、API Gateway、Lambda、DynamoDB、S3、CloudFrontの定義' -NumId 1))
$body.Add((New-ListParagraph -Text 'app-site/*.js、lambda/src/handler.py - CSV処理、認証補助、保存・比較ロジック' -NumId 1))

$body.Add((New-Paragraph -Text '公式資料' -Style 'Heading2' -KeepNext $true))
$body.Add((New-HyperlinkParagraph -Label 'Amazon API Gateway' -Description 'APIの作成、公開、保守、監視、保護' -RelationshipId 'rId10'))
$body.Add((New-HyperlinkParagraph -Label 'AWS Lambda quotas and scaling' -Description '短時間処理とスケーリング上の制約' -RelationshipId 'rId11'))
$body.Add((New-HyperlinkParagraph -Label 'Amazon Cognito authentication' -Description 'ユーザープール認証とJWT' -RelationshipId 'rId12'))
$body.Add((New-HyperlinkParagraph -Label 'Amazon DynamoDB' -Description 'サーバーレスNoSQLとアクセス特性' -RelationshipId 'rId13'))
$body.Add((New-HyperlinkParagraph -Label 'CloudFront Origin Access Control' -Description 'S3オリジンへのアクセス制限' -RelationshipId 'rId14'))
$body.Add((New-HyperlinkParagraph -Label 'Amazon S3 encryption' -Description '保存時暗号化と転送時保護' -RelationshipId 'rId15'))
$body.Add((New-HyperlinkParagraph -Label 'Terraform plan' -Description 'Apply前の変更内容確認' -RelationshipId 'rId16'))
$body.Add((New-HyperlinkParagraph -Label 'Terraform apply' -Description 'Planで提案された操作の適用' -RelationshipId 'rId17'))

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    $($body -join "`n")
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
      <w:cols w:space="708"/>
      <w:docGrid w:linePitch="360"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ja-JP" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="160" w:line="276" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="160" w:line="276" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="000000"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="DocTitle"><w:name w:val="Document Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="60"/><w:keepNext/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:color w:val="000000"/><w:sz w:val="52"/><w:szCs w:val="52"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="160"/><w:keepNext/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Metadata"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="240"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="400" w:after="120"/></w:pPr><w:rPr><w:color w:val="000000"/><w:sz w:val="40"/><w:szCs w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="120"/></w:pPr><w:rPr><w:color w:val="000000"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="320" w:after="80"/></w:pPr><w:rPr><w:color w:val="434343"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="80" w:after="160" w:line="276" w:lineRule="auto"/><w:ind w:left="240" w:right="240"/></w:pPr><w:rPr><w:color w:val="000000"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="276" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="19"/><w:szCs w:val="19"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="SourceText"><w:name w:val="Source Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="80" w:after="80" w:line="276" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="555555"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
</w:styles>
'@

$numberingXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="●"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:spacing w:after="80" w:line="276" w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/></w:rPr></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="720"/></w:tabs><w:spacing w:after="80" w:line="276" w:lineRule="auto"/><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
'@

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
'@

$packageRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
'@

$documentRels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html" TargetMode="External"/>
  <Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html" TargetMode="External"/>
  <Relationship Id="rId12" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-how-to-authenticate.html" TargetMode="External"/>
  <Relationship Id="rId13" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html" TargetMode="External"/>
  <Relationship Id="rId14" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html" TargetMode="External"/>
  <Relationship Id="rId15" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html" TargetMode="External"/>
  <Relationship Id="rId16" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://developer.hashicorp.com/terraform/cli/commands/plan" TargetMode="External"/>
  <Relationship Id="rId17" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://developer.hashicorp.com/terraform/cli/commands/apply" TargetMode="External"/>
</Relationships>
'@

$settingsXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>
'@

$coreXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SpendOps Dashboard 技術解説</dc:title><dc:subject>展示評価用の技術・セキュリティ・個人情報保護資料</dc:subject><dc:creator>SpendOps Dashboard Project</dc:creator><cp:lastModifiedBy>SpendOps Dashboard Project</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-07-23T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-07-23T00:00:00Z</dcterms:modified>
</cp:coreProperties>
'@

$appXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Microsoft Office Word</Application><DocSecurity>0</DocSecurity><ScaleCrop>false</ScaleCrop><Company></Company><LinksUpToDate>false</LinksUpToDate><SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged><AppVersion>16.0000</AppVersion></Properties>
'@

$parent = Split-Path -Parent $OutputPath
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent | Out-Null }
$fileStream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite)
$archive = [System.IO.Compression.ZipArchive]::new($fileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
try {
  Add-ZipEntry $archive '[Content_Types].xml' $contentTypes
  Add-ZipEntry $archive '_rels/.rels' $packageRels
  Add-ZipEntry $archive 'docProps/core.xml' $coreXml
  Add-ZipEntry $archive 'docProps/app.xml' $appXml
  Add-ZipEntry $archive 'word/document.xml' $documentXml
  Add-ZipEntry $archive 'word/styles.xml' $stylesXml
  Add-ZipEntry $archive 'word/numbering.xml' $numberingXml
  Add-ZipEntry $archive 'word/settings.xml' $settingsXml
  Add-ZipEntry $archive 'word/_rels/document.xml.rels' $documentRels
} finally {
  $archive.Dispose()
  $fileStream.Dispose()
}

Write-Output $OutputPath
