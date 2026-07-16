param(
  [string]$OutputPath = (Join-Path (Get-Location) 'docs\SpendOps_Dashboard_企画書.docx')
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
$body.Add((New-Paragraph -Text '複数人の支出CSVを匿名化・正規化し、全体平均との差を比較するWebアプリ' -Style 'ProposalSubtitle' -Align 'center'))

$metadataRows = @(
  @('作成日', '2026年7月15日', '状態', '企画・設計／UIプロトタイプ'),
  @('作成者', '個人開発者', '開発形態', '個人開発・学校課題')
)
$body.Add((New-Table -Rows $metadataRows -Widths @(1000, 3680, 1000, 3680) -HeaderRow $false -BorderColor 'DADFE5'))
$body.Add((New-Paragraph -Text '' -Style 'Spacer'))

$body.Add((New-Paragraph -Text '企画要旨' -Style 'Heading1'))
$body.Add((New-Paragraph -Text 'PayPay・JCB・三井住友VISAのCSVを共通形式へ変換し、本人の月次支出を匿名化された全体平均と比較できるサービスを企画する。目的は他人の明細を見ることではなく、自分の支出傾向を客観的に把握できるようにすることである。' -Style 'Callout'))

$body.Add((New-Paragraph -Text '1. 現状・問題・課題' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text '支出履歴が決済サービスごとに分かれ、月全体の傾向を把握しにくい。' -NumId 1))
$body.Add((New-ListParagraph -Text 'CSVごとに文字コード、ヘッダー位置、列構成が異なり、そのままでは比較できない。' -NumId 1))
$body.Add((New-ListParagraph -Text '自分の支出が多いか少ないかを判断する比較軸がなく、明細共有にはプライバシー上の問題がある。' -NumId 1))

$body.Add((New-Paragraph -Text '2. 提案' -Style 'Heading1'))
$body.Add((New-RichParagraph -Style 'Normal' -Runs @(
  @{ Text = '提案内容：'; Bold = $true; Italic = $false; Color = ''; Size = 0 },
  @{ Text = '利用者がCSVを任意にアップロードし、システムが形式判定・正規化・月次集計を行う。本人には自分の明細と集計を表示し、比較には個人を特定できない全体集計だけを用いる。'; Bold = $false; Italic = $false; Color = ''; Size = 0 }
)))
$body.Add((New-RichParagraph -Style 'Normal' -Runs @(
  @{ Text = '対象者：'; Bold = $true; Italic = $false; Color = ''; Size = 0 },
  @{ Text = '複数の決済サービスを利用し、自分の支出を集団平均との差で把握したい利用者。'; Bold = $false; Italic = $false; Color = ''; Size = 0 }
)))
$body.Add((New-RichParagraph -Style 'Normal' -Runs @(
  @{ Text = '提供価値：'; Bold = $true; Italic = $false; Color = ''; Size = 0 },
  @{ Text = '「異なるCSVを揃える」「明細を見せずに比べる」「一部エラーでも分析を止めない」の3点を重視する。'; Bold = $false; Italic = $false; Color = ''; Size = 0 }
)))

$body.Add((New-Paragraph -Text '3. 開発方針' -Style 'Heading1'))
$body.Add((New-Paragraph -Text '最初から機能を広げず、PayPay・JCB・三井住友VISAの取込、月次集計、匿名比較、取込エラー確認までをMVPとする。完全自動化よりも、CSVから正確なデータを取得できることを優先する。' -Style 'Normal'))

$body.Add((New-PageBreak))

# Page 2: minimum viable scope and technical decisions.
$body.Add((New-Paragraph -Text '4. 企画内容（MVPで実装する最低限）' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text 'Cognitoでログインし、一般ユーザーと管理者を分ける。' -NumId 2))
$body.Add((New-ListParagraph -Text 'PayPay・JCB・三井住友VISAのCSVをアップロードする。' -NumId 2))
$body.Add((New-ListParagraph -Text 'CSV形式を判定し、日付・金額・支出先・カテゴリなどを共通形式へ正規化する。' -NumId 2))
$body.Add((New-ListParagraph -Text '本人の月間支出、カテゴリ別支出、支払い方法別支出、取引件数、前月比を集計する。' -NumId 2))
$body.Add((New-ListParagraph -Text '本人の集計結果と、匿名化された全体平均との差を表示する。' -NumId 2))
$body.Add((New-ListParagraph -Text '管理者には全体集計、取込状況、エラー件数・失敗行だけを表示する。' -NumId 2))

$body.Add((New-Paragraph -Text '対応CSVと取込上の違い' -Style 'Heading2'))
$csvRows = @(
  @('データソース', '文字コード', '取込上の注意'),
  @('PayPay', 'UTF-8', '1行目にヘッダーがあり、取引日・金額・取引先などを利用する。'),
  @('JCB', 'Shift_JIS', '先頭のメタ情報を読み飛ばし、明細ヘッダーから取り込む。'),
  @('三井住友VISA', 'Shift_JIS', '先頭のカード情報系メタ行を除き、明細を固定列として扱う。')
)
$body.Add((New-Table -Rows $csvRows -Widths @(1800, 1600, 5960) -HeaderRow $true))

$body.Add((New-Paragraph -Text '5. 工夫した点' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text 'CSV正規化：文字コードやヘッダー位置の違いを吸収し、同じ項目で集計する。' -NumId 1 -BoldLead $true))
$body.Add((New-ListParagraph -Text 'プライバシー設計：原本CSVを保存せず、氏名やカード番号を除外する。比較には匿名集計だけを使い、管理者にも生明細を見せない。' -NumId 1 -BoldLead $true))
$body.Add((New-ListParagraph -Text '部分取込：問題のある行だけを除外し、失敗行番号と理由を示したうえで残りを集計する。' -NumId 1 -BoldLead $true))

$body.Add((New-Paragraph -Text '6. システム構成' -Style 'Heading1'))
$body.Add((New-Paragraph -Text 'Web画面 → Cognito認証 → API Gateway → Lambda（検証・正規化・集計）→ DynamoDB（正規化済み取引・個人集計・匿名集計）→ 月別比較レポート' -Style 'Callout'))
$body.Add((New-Paragraph -Text 'AWSは認証、権限制御、保存、集計、監視、暗号化の実行基盤として利用する。CloudWatch LogsにはCSV全文や個人情報を出力しない。' -Style 'Normal'))

$body.Add((New-Paragraph -Text '7. できたら追加する内容' -Style 'Heading1'))
$body.Add((New-Paragraph -Text '銀行CSVへの対応、全支出を統合した比較、中央値・分位表示、分析コメントの高度化は、MVP完成後に余裕がある場合のみ行う。AWS Cost Explorer連携とTerraformは初期版の対象外とする。' -Style 'Normal'))

$body.Add((New-Paragraph -Text '8. 完成条件' -Style 'Heading1'))
$body.Add((New-ListParagraph -Text '3種類のCSVを取り込み、正規化済みデータを保存できる。' -NumId 1))
$body.Add((New-ListParagraph -Text '本人の月別レポートと匿名化された全体平均との差を表示できる。' -NumId 1))
$body.Add((New-ListParagraph -Text '他人の生明細、CSV原本、氏名、カード番号を保存・表示しない。' -NumId 1))

$body.Add((New-Paragraph -Text '参考資料：welog「Word・Excelの企画書テンプレート！書き方のポイントも解説」https://welog.jp/blogs/management/free-word-excel-proposal-template/、README.md、docs/codex_handoff.md' -Style 'SourceNote'))

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    $($body -join "`n")
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId5"/>
      <w:footerReference w:type="default" r:id="rId6"/>
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
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Yu Gothic" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ja-JP" w:eastAsia="ja-JP"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="320" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="160" w:line="320" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Yu Gothic"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="222222"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ProposalTitle"><w:name w:val="Proposal Title"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="160" w:after="80"/><w:jc w:val="center"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="0B2545"/><w:sz w:val="56"/><w:szCs w:val="56"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="ProposalSubtitle"><w:name w:val="Proposal Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="300" w:line="280" w:lineRule="auto"/><w:jc w:val="center"/><w:keepNext/></w:pPr><w:rPr><w:color w:val="52606D"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Kicker"><w:name w:val="Kicker"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="0" w:after="80"/><w:jc w:val="center"/><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="18"/><w:szCs w:val="18"/><w:spacing w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="200"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="32"/><w:szCs w:val="32"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4D78"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="40" w:after="160" w:line="300" w:lineRule="auto"/><w:ind w:left="240" w:right="240"/><w:shd w:val="clear" w:color="auto" w:fill="F4F6F9"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2E74B5"/></w:pBdr></w:pPr><w:rPr><w:color w:val="1F2D3D"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="0" w:line="280" w:lineRule="auto"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="SourceNote"><w:name w:val="Source Note"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="80" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="66727D"/><w:sz w:val="17"/><w:szCs w:val="17"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Spacer"><w:name w:val="Spacer"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="0" w:after="80"/></w:pPr><w:rPr><w:sz w:val="4"/><w:szCs w:val="4"/></w:rPr></w:style>
</w:styles>
'@

$numberingXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="540"/></w:tabs><w:spacing w:after="80" w:line="290" w:lineRule="auto"/><w:ind w:left="540" w:hanging="279"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/></w:rPr></w:lvl>
  </w:abstractNum>
  <w:abstractNum w:abstractNumId="1">
    <w:multiLevelType w:val="singleLevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="540"/></w:tabs><w:spacing w:after="80" w:line="290" w:lineRule="auto"/><w:ind w:left="540" w:hanging="279"/></w:pPr></w:lvl>
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
  <dc:title>SpendOps Dashboard 企画書</dc:title><dc:subject>複数人CSV比較分析Webアプリ</dc:subject><dc:creator>SpendOps Dashboard Project</dc:creator><cp:lastModifiedBy>SpendOps Dashboard Project</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">2026-07-15T00:00:00Z</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">2026-07-15T00:00:00Z</dcterms:modified>
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
