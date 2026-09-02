param(
  [string]$OutputPath = (Join-Path (Get-Location) 'materials\deliverables\proposals\SpendOps_Dashboard_企画書_更新版.docx')
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
    [bool]$Italic = $false,
    [string]$Color = '',
    [int]$SizeHalfPoints = 0
  )

  $properties = @()
  if ($Bold) { $properties += '<w:b/>' }
  if ($Italic) { $properties += '<w:i/>' }
  if ($Color) { $properties += "<w:color w:val=`"$Color`"/>" }
  if ($SizeHalfPoints -gt 0) {
    $properties += "<w:sz w:val=`"$SizeHalfPoints`"/><w:szCs w:val=`"$SizeHalfPoints`"/>"
  }
  $rPr = if ($properties.Count) { '<w:rPr>' + ($properties -join '') + '</w:rPr>' } else { '' }
  return '<w:r>' + $rPr + '<w:t xml:space="preserve">' + (Escape-Xml $Text) + '</w:t></w:r>'
}

function New-Paragraph {
  param(
    [string]$Text,
    [string]$Style = 'Normal',
    [string]$Align = '',
    [bool]$Bold = $false,
    [bool]$Italic = $false,
    [string]$Color = '',
    [int]$SizeHalfPoints = 0,
    [bool]$KeepNext = $false
  )

  $pPr = @("<w:pStyle w:val=`"$Style`"/>")
  if ($Align) { $pPr += "<w:jc w:val=`"$Align`"/>" }
  if ($KeepNext) { $pPr += '<w:keepNext/>' }
  return '<w:p><w:pPr>' + ($pPr -join '') + '</w:pPr>' +
    (New-Run -Text $Text -Bold $Bold -Italic $Italic -Color $Color -SizeHalfPoints $SizeHalfPoints) + '</w:p>'
}

function New-RichParagraph {
  param(
    [array]$Runs,
    [string]$Style = 'Normal',
    [string]$Align = '',
    [bool]$KeepNext = $false
  )

  $pPr = @("<w:pStyle w:val=`"$Style`"/>")
  if ($Align) { $pPr += "<w:jc w:val=`"$Align`"/>" }
  if ($KeepNext) { $pPr += '<w:keepNext/>' }
  $runXml = foreach ($run in $Runs) {
    New-Run -Text $run.Text -Bold ([bool]$run.Bold) -Italic ([bool]$run.Italic) -Color ([string]$run.Color) -SizeHalfPoints ([int]$run.Size)
  }
  return '<w:p><w:pPr>' + ($pPr -join '') + '</w:pPr>' + ($runXml -join '') + '</w:p>'
}

function New-ListParagraph {
  param(
    [string]$Text,
    [int]$NumId,
    [bool]$BoldLead = $false
  )

  $content = if ($BoldLead -and $Text.Contains('：')) {
    $parts = $Text.Split('：', 2)
    (New-Run -Text ($parts[0] + '：') -Bold $true) + (New-Run -Text $parts[1])
  } else {
    New-Run -Text $Text
  }
  return '<w:p><w:pPr><w:pStyle w:val="Normal"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="' + $NumId + '"/></w:numPr></w:pPr>' + $content + '</w:p>'
}

function New-PageBreak {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function New-Cell {
  param(
    [string]$Text,
    [int]$Width,
    [bool]$Bold = $false,
    [string]$Fill = '',
    [string]$Align = 'left'
  )

  $fillXml = if ($Fill) { "<w:shd w:val=`"clear`" w:color=`"auto`" w:fill=`"$Fill`"/>" } else { '' }
  $p = New-Paragraph -Text $Text -Style 'TableText' -Align $Align -Bold $Bold
  return '<w:tc><w:tcPr><w:tcW w:w="' + $Width + '" w:type="dxa"/><w:vAlign w:val="center"/>' + $fillXml + '</w:tcPr>' + $p + '</w:tc>'
}

function New-Table {
  param(
    [array]$Rows,
    [int[]]$Widths,
    [bool]$HeaderRow = $false,
    [string]$HeaderFill = 'F4F6F9',
    [string]$BorderColor = 'D5DAE0'
  )

  $grid = ($Widths | ForEach-Object { '<w:gridCol w:w="' + $_ + '"/>' }) -join ''
  $rowXml = for ($r = 0; $r -lt $Rows.Count; $r++) {
    $cells = for ($c = 0; $c -lt $Widths.Count; $c++) {
      $cell = $Rows[$r][$c]
      $isHeader = $HeaderRow -and $r -eq 0
      New-Cell -Text ([string]$cell) -Width $Widths[$c] -Bold $isHeader -Fill ($(if ($isHeader) { $HeaderFill } else { '' }))
    }
    $trPr = if ($HeaderRow -and $r -eq 0) { '<w:trPr><w:tblHeader/></w:trPr>' } else { '' }
    '<w:tr>' + $trPr + ($cells -join '') + '</w:tr>'
  }

  return @"
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="9360" w:type="dxa"/>
    <w:tblInd w:w="120" w:type="dxa"/>
    <w:tblLayout w:type="fixed"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="$BorderColor"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="$BorderColor"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="$BorderColor"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="$BorderColor"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="$BorderColor"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="$BorderColor"/>
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

# Page 1: basic information, current problem, and proposal.
$body.Add((New-Paragraph -Text '個人開発企画書 / PROPOSAL' -Style 'Kicker' -Align 'center'))
$body.Add((New-Paragraph -Text 'SpendOps Dashboard' -Style 'ProposalTitle' -Align 'center'))
$body.Add((New-Paragraph -Text '複数の決済CSVを月別にまとめ、自分の過去や匿名集計と比較するWebアプリ' -Style 'ProposalSubtitle' -Align 'center'))

$metadataRows = @(
  @('更新日', '2026年7月29日', '状態', '実装済み／AWS基盤停止中'),
  @('作成者', '個人開発者', '開発形態', '個人開発・学校課題')
)
$body.Add((New-Table -Rows $metadataRows -Widths @(1000, 3680, 1000, 3680) -HeaderRow $false -BorderColor 'DADFE5'))
$body.Add((New-Paragraph -Text '' -Style 'Spacer'))

$body.Add((New-Paragraph -Text '企画要旨' -Style 'Heading1'))
$body.Add((New-Paragraph -Text 'PayPay・JCB・三井住友VISAの利用明細CSVをブラウザ内で共通形式へ変換し、月別・年間・全期間の支出を一つの画面で確認する。本人の過去や条件を満たす匿名集計との比較から、次に見直す支出を見つけることを目的とする。' -Style 'Callout'))

$body.Add((New-Paragraph -Text '1. 現状・問題・課題' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text '支出履歴が決済サービスごとに分かれ、月全体の傾向を把握しにくい。' -NumId 1))
$body.Add((New-ListParagraph -Text 'CSVごとに文字コード、ヘッダー位置、列構成が異なり、そのままでは比較できない。' -NumId 1))
$body.Add((New-ListParagraph -Text '自分の支出が多いか少ないかを判断する比較軸がなく、他人の生明細を共有する方法にはプライバシー上の問題がある。' -NumId 1))
$body.Add((New-ListParagraph -Text '毎日の手入力は負担が大きいため、任意のタイミングでCSVを読み込み、その日までを振り返れる方法が必要である。' -NumId 1))

$body.Add((New-Paragraph -Text '2. 提案' -Style 'Heading1'))
$body.Add((New-RichParagraph -Style 'Normal' -Runs @(
  @{ Text = '提案内容：'; Bold = $true; Italic = $false; Color = ''; Size = 0 },
  @{ Text = '利用者がCSVを任意に選択すると、ブラウザが形式判定・正規化・集計を行う。本人には明細とレポートを表示し、他者比較には生明細ではなく、本人を除く集計値だけを用いる。'; Bold = $false; Italic = $false; Color = ''; Size = 0 }
)))
$body.Add((New-RichParagraph -Style 'Normal' -Runs @(
  @{ Text = '対象者：'; Bold = $true; Italic = $false; Color = ''; Size = 0 },
  @{ Text = 'PayPayや複数のクレジットカードを利用し、手入力を続けずに月ごとの支出を振り返りたい利用者。'; Bold = $false; Italic = $false; Color = ''; Size = 0 }
)))
$body.Add((New-RichParagraph -Style 'Normal' -Runs @(
  @{ Text = '提供価値：'; Bold = $true; Italic = $false; Color = ''; Size = 0 },
  @{ Text = '異なるCSVを一つの見方へ揃え、総額・前月比・カテゴリ・推移・明細を月別中心で確認し、分類修正を次回取込へ反映できる。'; Bold = $false; Italic = $false; Color = ''; Size = 0 }
)))

$body.Add((New-Paragraph -Text '3. 開発方針' -Style 'Heading1'))
$body.Add((New-Paragraph -Text '対象はPayPay・JCB・三井住友VISAの支出分析に限定する。銀行CSV、収入・資産推移、予算管理、AWS料金分析は今回の対象外とし、完全自動化よりも、対応した3形式を安全に読み込み月別レポートへつなげることを優先する。' -Style 'Normal'))

$body.Add((New-PageBreak))

# Page 2: implemented scope and technical decisions.
$body.Add((New-Paragraph -Text '4. 実装内容と対応範囲' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text 'PayPay・JCB・三井住友VISAのCSVをブラウザ内で解析し、共通形式へ正規化する。' -NumId 2))
$body.Add((New-ListParagraph -Text '月別、直近12か月、読み込んだ全期間の支出総額・件数・前月比・カテゴリ・推移を表示する。' -NumId 2))
$body.Add((New-ListParagraph -Text 'PayPayとカードを統合し、「全支払い」「PayPayだけ」「カードだけ」を切り替える。' -NumId 2))
$body.Add((New-ListParagraph -Text '明細を絞り込み、利用先ごとのカテゴリ修正と本人別の分類学習を行う。' -NumId 2))
$body.Add((New-ListParagraph -Text 'Cognito認証、JWT認可、DynamoDB保存、匿名比較を実装する。現在のAWS基盤は停止中である。' -NumId 2))
$body.Add((New-ListParagraph -Text '実ユーザー比較は本人を除く他5人以上の完全月だけを使い、不足時は合成参考値と明記する。' -NumId 2))

$body.Add((New-Paragraph -Text '対応CSVと取込上の違い' -Style 'Heading2'))
$csvRows = @(
  @('データソース', '文字コード', '取込上の注意'),
  @('PayPay', 'UTF-8', '1行目にヘッダーがあり、取引日・金額・取引先などを利用する。'),
  @('JCB', 'Shift_JIS', '先頭のメタ情報を読み飛ばし、明細ヘッダーから取り込む。'),
  @('三井住友VISA', 'Shift_JIS', '先頭のカード情報系メタ行を除き、明細を固定列として扱う。')
)
$body.Add((New-Table -Rows $csvRows -Widths @(1800, 1600, 5960) -HeaderRow $true))

$body.Add((New-Paragraph -Text '5. データを守るための設計' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text '端末内処理：CSV原本、ファイル名、未加工行はAWSへ送信・保存しない。' -NumId 1 -BoldLead $true))
$body.Add((New-ListParagraph -Text '本人別保存：認証後は正規化済み取引、月別集計、取込履歴、分類ルールを本人IDで分離する。' -NumId 1 -BoldLead $true))
$body.Add((New-ListParagraph -Text '比較の制限：他人の生明細を表示せず、人数条件と完全月条件を満たす集計だけを使う。' -NumId 1 -BoldLead $true))

$body.Add((New-Paragraph -Text '6. システム構成' -Style 'Heading1'))
$body.Add((New-Paragraph -Text 'CSV → ブラウザ（解析・正規化・表示）→ Cognito認証 → API Gateway → Lambda（検証・保存・比較）→ DynamoDB 4テーブル' -Style 'Callout'))
$body.Add((New-Paragraph -Text '静的Web資産は非公開S3からCloudFront OAC経由で配信する。AWSは認証、権限制御、保存、比較、監視の実行基盤として実装済みである。Terraformによる構築・再構築手順の詳細は技術補足資料に分離する。' -Style 'Normal'))

$body.Add((New-PageBreak))

# Page 3: current state, evidence, limits, and submission plan.
$body.Add((New-Paragraph -Text '7. 現在の状態と検証根拠' -Style 'Heading1'))
$statusRows = @(
  @('区分', '現在状態'),
  @('実装済み', '3種CSV解析、月別・年間・全期間レポート、認証、保存、匿名比較、分類学習'),
  @('AWS基盤', '2026年7月23日のTerraform Destroy後。公開サイト、ログイン、API、クラウド保存は停止中'),
  @('ローカル利用', '未ログインでのCSV解析と画面表示を確認可能'),
  @('自動テスト', 'フロントエンド46件、Lambda 24件、合計70件成功'),
  @('提出時予定', '分析対象本人を含まないPayPay実データ5人分を用意し、実比較条件を満たす'),
  @('データ制約', 'JCB・VISAは同数の実データ確保が難しく、実比較を保証しない')
)
$body.Add((New-Table -Rows $statusRows -Widths @(2100, 7260) -HeaderRow $true))

$body.Add((New-Paragraph -Text '8. 既知の制約' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text '銀行CSVは今回の設計・実装対象外である。' -NumId 1))
$body.Add((New-ListParagraph -Text '返金・取消の表現と、PayPayチャージなど取得元をまたぐ二重計上は追加検証が必要である。' -NumId 1))
$body.Add((New-ListParagraph -Text '取得元ごとの最終取込日・未取込警告、失敗行番号と行別理由は画面未実装である。' -NumId 1))
$body.Add((New-ListParagraph -Text '退会APIは誤操作防止のためHTTP 501で無効化している。' -NumId 1))

$body.Add((New-Paragraph -Text '9. 完成条件' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text 'PayPay・JCB・三井住友VISAを解析し、月別・年間・全期間の支出レポートを表示できる。' -NumId 1))
$body.Add((New-ListParagraph -Text '本人単位で正規化済み取引、月別集計、取込履歴、分類ルールを保存できる。' -NumId 1))
$body.Add((New-ListParagraph -Text '条件を満たす匿名比較を行い、CSV原本や他人の生明細を保存・表示しない。' -NumId 1))
$body.Add((New-ListParagraph -Text '自動テスト70件が成功し、停止中・未実装・提出時予定を資料上で誤解なく説明できる。' -NumId 1))

$body.Add((New-Paragraph -Text '参考資料：README.md（最新仕様の正本）、project-guidance/system_prompt_guardrails_v2.md、project-guidance/codex_handoff.md、project-guidance/prompts/SpendOps_Dashboard_資料作成情報整理.md' -Style 'SourceNote'))

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    $($body -join "`n")
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId5"/>
      <w:footerReference w:type="default" r:id="rId6"/>
      <w:pgSz w:w="11906" w:h="16838"/>
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
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Yu Gothic" w:cs="Calibri"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:lang w:val="ja-JP" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="270" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="100" w:line="270" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Yu Gothic"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="222222"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ProposalTitle"><w:name w:val="Proposal Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="120" w:after="60"/><w:jc w:val="center"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="0B2545"/><w:sz w:val="48"/><w:szCs w:val="48"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ProposalSubtitle"><w:name w:val="Proposal Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="220" w:line="250" w:lineRule="auto"/><w:jc w:val="center"/><w:keepNext/></w:pPr><w:rPr><w:color w:val="52606D"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Kicker"><w:name w:val="Kicker"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:spacing w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="250" w:after="130"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="180" w:after="90"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4D78"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="20" w:after="100" w:line="260" w:lineRule="auto"/><w:ind w:left="220" w:right="220"/><w:shd w:val="clear" w:color="auto" w:fill="F4F6F9"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2E74B5"/></w:pBdr></w:pPr><w:rPr><w:color w:val="1F2D3D"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="SourceNote"><w:name w:val="Source Note"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="80" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="66727D"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr><w:rPr><w:sz w:val="4"/><w:szCs w:val="4"/></w:rPr></w:style>
</w:styles>
'@

$numberingXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="500"/></w:tabs><w:spacing w:after="45" w:line="250" w:lineRule="auto"/><w:ind w:left="500" w:hanging="250"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/></w:rPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="500"/></w:tabs><w:spacing w:after="45" w:line="250" w:lineRule="auto"/><w:ind w:left="500" w:hanging="250"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>
'@

$headerXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Yu Gothic"/><w:color w:val="7A8691"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>SPENDOPS DASHBOARD  |  企画書</w:t></w:r></w:p></w:hdr>
'@

$footerXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:color w:val="7A8691"/><w:sz w:val="16"/></w:rPr><w:t>Page </w:t></w:r><w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="7A8691"/><w:sz w:val="16"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple></w:p></w:ftr>
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
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
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
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>
'@

$settingsXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>
'@

$coreXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>SpendOps Dashboard 企画書 更新版</dc:title><dc:subject>PayPay・JCB・三井住友VISA支出分析Webアプリ</dc:subject><dc:creator>SpendOps Dashboard Project</dc:creator><cp:lastModifiedBy>SpendOps Dashboard Project</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-07-29T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-07-29T00:00:00Z</dcterms:modified>
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
  Add-ZipEntry $archive 'word/header1.xml' $headerXml
  Add-ZipEntry $archive 'word/footer1.xml' $footerXml
  Add-ZipEntry $archive 'word/_rels/document.xml.rels' $documentRels
} finally {
  $archive.Dispose()
  $fileStream.Dispose()
}

Write-Output $OutputPath
