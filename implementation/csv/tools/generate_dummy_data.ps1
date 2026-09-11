$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dummyRoot = Join-Path $root "dummy"
$normalizedPath = Join-Path $dummyRoot "dummy_normalized_transactions.csv"
$paypayPath = Join-Path $dummyRoot "paypay\Transactions_dummy_20260101-20260902.csv"
$jcbPath = Join-Path $dummyRoot "jcb\20260101-20260902_meisai_dummy.csv"
$visaPath = Join-Path $dummyRoot "visa\smbc_visa_dummy_20260101-20260902.csv"

New-Item -ItemType Directory -Force -Path (Split-Path $paypayPath), (Split-Path $jcbPath), (Split-Path $visaPath) | Out-Null

# 「その他」を20%まで下げ、その他以外のカテゴリの金額感と大小関係を維持する。
$categoryRatios = [ordered]@{
  "その他" = 20.0
  "食費" = 35.1
  "ネットでの購入" = 18.2
  "日用品" = 10.8
  "衣服費" = 6.5
  "娯楽" = 2.0
  "医療費" = 2.0
  "交通費" = 0.9
  "光熱費" = 1.8
  "通信費" = 1.6
  "住居費" = 1.1
}

$categoryTemplates = [ordered]@{
  "その他" = @(
    @{ Merchant = "サンプルサービスA"; Source = "PayPay" },
    @{ Merchant = "サンプルサービスB"; Source = "JCB" },
    @{ Merchant = "サンプルサービスC"; Source = "VISA" },
    @{ Merchant = "サンプルサービスD"; Source = "PayPay" },
    @{ Merchant = "サンプルサービスE"; Source = "JCB" },
    @{ Merchant = "サンプルサービスF"; Source = "VISA" },
    @{ Merchant = "サンプルサービスG"; Source = "PayPay" },
    @{ Merchant = "サンプルサービスH"; Source = "JCB" }
  )
  "食費" = @(
    @{ Merchant = "イオン サンプル店"; Source = "PayPay" },
    @{ Merchant = "セブンイレブン サンプル店"; Source = "PayPay" },
    @{ Merchant = "スターバックス サンプル店"; Source = "JCB" },
    @{ Merchant = "サイゼリヤ サンプル店"; Source = "VISA" }
  )
  "ネットでの購入" = @(
    @{ Merchant = "Amazon サンプル購入"; Source = "JCB" },
    @{ Merchant = "楽天市場 サンプル購入"; Source = "VISA" }
  )
  "日用品" = @(
    @{ Merchant = "マツモトキヨシ サンプル店"; Source = "PayPay" },
    @{ Merchant = "ニトリ サンプル店"; Source = "JCB" }
  )
  "衣服費" = @(
    @{ Merchant = "ユニクロ サンプル店"; Source = "JCB" },
    @{ Merchant = "ABC-MART サンプル店"; Source = "VISA" }
  )
  "娯楽" = @(
    @{ Merchant = "TOHOシネマズ サンプル"; Source = "JCB" },
    @{ Merchant = "Netflix サンプル"; Source = "VISA" }
  )
  "医療費" = @(
    @{ Merchant = "さくら歯科 サンプル"; Source = "PayPay" },
    @{ Merchant = "みどりクリニック サンプル"; Source = "JCB" }
  )
  "交通費" = @(
    @{ Merchant = "JR東日本 サンプル"; Source = "PayPay" },
    @{ Merchant = "ENEOS サンプル店"; Source = "VISA" }
  )
  "光熱費" = @(
    @{ Merchant = "東京電力 サンプル"; Source = "JCB" },
    @{ Merchant = "東京ガス サンプル"; Source = "VISA" }
  )
  "通信費" = @(
    @{ Merchant = "docomo サンプル"; Source = "JCB" },
    @{ Merchant = "NTT サンプル"; Source = "VISA" }
  )
  "住居費" = @(
    @{ Merchant = "サンプル家賃"; Source = "JCB" },
    @{ Merchant = "サンプル住宅ローン"; Source = "VISA" }
  )
}

# 9月は9月2日までの暫定月。全期間の総額は151,000円になる。
$monthlyTotals = [ordered]@{
  "2026-01" = 16000
  "2026-02" = 16000
  "2026-03" = 16000
  "2026-04" = 17000
  "2026-05" = 17000
  "2026-06" = 18000
  "2026-07" = 18000
  "2026-08" = 19000
  "2026-09" = 14000
}

$normalizedRows = New-Object System.Collections.Generic.List[object]
$paypayRows = New-Object System.Collections.Generic.List[object]
$jcbRows = New-Object System.Collections.Generic.List[object]
$visaRows = New-Object System.Collections.Generic.List[object]
$sequence = 0

foreach ($month in $monthlyTotals.Keys) {
  $monthTotal = $monthlyTotals[$month]
  $monthNumber = [int]$month.Substring(5, 2)
  $categoryIndex = 0

  foreach ($category in $categoryRatios.Keys) {
    $categoryTotal = [int][Math]::Round($monthTotal * $categoryRatios[$category] / 100)
    $templates = $categoryTemplates[$category]
    $baseAmount = [Math]::Floor($categoryTotal / $templates.Count)
    $remainder = $categoryTotal - ($baseAmount * $templates.Count)

    for ($templateIndex = 0; $templateIndex -lt $templates.Count; $templateIndex++) {
      $sequence += 1
      $template = $templates[$templateIndex]
      $amount = [int]$baseAmount + $(if ($templateIndex -lt $remainder) { 1 } else { 0 })
      $day = if ($month -eq "2026-09") {
        1 + (($categoryIndex + $templateIndex) % 2)
      }
      else {
        2 + (($categoryIndex * 3 + $templateIndex * 5) % 26)
      }
      $date = Get-Date -Year 2026 -Month $monthNumber -Day $day
      $transactionId = "DUMMY-2026-{0:d4}" -f $sequence
      $source = $template.Source

      $normalizedRows.Add([pscustomobject]@{
        transactionId = $transactionId
        userId = "presentation_demo_user"
        ageGroup = "30s"
        gender = "unspecified"
        date = $date.ToString("yyyy-MM-dd")
        amount = $amount
        merchant = $template.Merchant
        source = $source
        paymentMethod = $source
        category = $category
        type = "expense"
        importBatchId = "DUMMY-BATCH-$($month.Replace('-', ''))"
        createdAt = "2026-09-02T12:00:00Z"
      }) | Out-Null

      if ($source -eq "PayPay") {
        $paypayRows.Add([pscustomobject]@{
          "取引日" = $date.ToString("yyyy/MM/dd")
          "出金金額（円）" = $amount
          "入金金額（円）" = ""
          "海外出金金額" = ""
          "通貨" = ""
          "変換レート（円）" = ""
          "利用国" = "日本"
          "取引内容" = "支払い"
          "取引先" = $template.Merchant
          "取引方法" = "PayPay残高"
          "支払い区分" = "通常"
          "利用者" = "発表用ダミー"
          "取引番号" = "PP-$transactionId"
        }) | Out-Null
      }
      elseif ($source -eq "JCB") {
        $jcbRows.Add([pscustomobject]@{
          Date = $date.ToString("yyyy/MM/dd")
          Merchant = $template.Merchant
          Amount = $amount
          TransactionId = $transactionId
        }) | Out-Null
      }
      else {
        $visaRows.Add([pscustomobject]@{
          Date = $date.ToString("yyyy/MM/dd")
          Merchant = $template.Merchant
          Amount = $amount
          TransactionId = $transactionId
        }) | Out-Null
      }
    }
    $categoryIndex += 1
  }
}

$normalizedRows = @($normalizedRows | Sort-Object date, transactionId)
$paypayRows = @($paypayRows | Sort-Object "取引日", "取引番号")
$jcbRows = @($jcbRows | Sort-Object Date, TransactionId)
$visaRows = @($visaRows | Sort-Object Date, TransactionId)

$expectedMonths = 1..9 | ForEach-Object { "2026-{0:d2}" -f $_ }
$actualMonths = @($normalizedRows.date.Substring(0, 7) | Sort-Object -Unique)
if (Compare-Object $expectedMonths $actualMonths) {
  throw "生成結果に2026年1月から9月までの全月が含まれていません。"
}
if (($normalizedRows.amount | Measure-Object -Sum).Sum -ne 151000) {
  throw "生成結果の総額が151,000円ではありません。"
}
foreach ($category in $categoryRatios.Keys) {
  if (-not ($normalizedRows.category -contains $category)) {
    throw "生成結果にカテゴリ「$category」がありません。"
  }
}

$normalizedRows | Export-Csv -LiteralPath $normalizedPath -NoTypeInformation -Encoding UTF8
$paypayRows | Export-Csv -LiteralPath $paypayPath -NoTypeInformation -Encoding UTF8

$jcbTotal = ($jcbRows | Measure-Object -Property Amount -Sum).Sum
$jcbLines = New-Object System.Collections.Generic.List[string]
$jcbLines.Add('"","","今回のお支払日","2026/10/10"') | Out-Null
$jcbLines.Add('"","","今回のお支払金額合計(￥)","' + $jcbTotal + '"') | Out-Null
$jcbLines.Add('"",""," うち国内ご利用金額合計(￥)","' + $jcbTotal + '"') | Out-Null
$jcbLines.Add('"",""," うち海外ご利用金額合計(￥)","0"') | Out-Null
$jcbLines.Add('"【ご利用明細】"') | Out-Null
$jcbLines.Add('"ご利用者","カテゴリ","ご利用日","ご利用先など","ご利用金額(￥)","支払区分","今回回数","訂正サイン","お支払い金額(￥)","国内／海外","摘要","備考"') | Out-Null
foreach ($row in $jcbRows) {
  $fields = @("発表用ダミー", "≪ショッピング取組（国内）≫", $row.Date, $row.Merchant, [string]$row.Amount, "1回", "", "", [string]$row.Amount, "国内", "", $row.TransactionId)
  $jcbLines.Add((($fields | ForEach-Object { '"' + ($_ -replace '"', '""') + '"' }) -join ",")) | Out-Null
}
[System.IO.File]::WriteAllLines($jcbPath, $jcbLines, [System.Text.Encoding]::GetEncoding(932))

$visaLines = New-Object System.Collections.Generic.List[string]
$visaLines.Add("presentation_demo_user,0000-0000-0000-0000,三井住友カードＶＩＳＡ（ＮＬ）") | Out-Null
foreach ($row in $visaRows) {
  $visaLines.Add((@($row.Date, $row.Merchant, [string]$row.Amount, "1回", [string]$row.Amount, "国内", $row.TransactionId) -join ",")) | Out-Null
}
[System.IO.File]::WriteAllLines($visaPath, $visaLines, [System.Text.Encoding]::GetEncoding(932))

Write-Output "normalized=$($normalizedRows.Count)"
Write-Output "paypay=$($paypayRows.Count)"
Write-Output "jcb=$($jcbRows.Count)"
Write-Output "visa=$($visaRows.Count)"
