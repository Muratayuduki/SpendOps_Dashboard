$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dummyRoot = Join-Path $root "dummy"
$outputPath = Join-Path $dummyRoot "person2\dummy_normalized_transactions_person2_20260101-20260902.csv"
$existingPath = Join-Path $dummyRoot "dummy_normalized_transactions.csv"

$monthlyTotals = [ordered]@{
  "2026-01" = 16700
  "2026-02" = 14900
  "2026-03" = 18200
  "2026-04" = 15600
  "2026-05" = 17900
  "2026-06" = 16300
  "2026-07" = 19100
  "2026-08" = 17400
  "2026-09" = 14700
}

$monthlyCategoryRatios = [ordered]@{
  "2026-01" = [ordered]@{ "食費" = 6; "ネットでの購入" = 2; "日用品" = 7; "衣服費" = 8; "娯楽" = 15; "医療費" = 10; "交通費" = 17; "光熱費" = 9; "通信費" = 5; "住居費" = 19; "その他" = 2 }
  "2026-02" = [ordered]@{ "食費" = 5; "ネットでの購入" = 4; "日用品" = 9; "衣服費" = 10; "娯楽" = 11; "医療費" = 14; "交通費" = 13; "光熱費" = 12; "通信費" = 7; "住居費" = 13; "その他" = 2 }
  "2026-03" = [ordered]@{ "食費" = 4; "ネットでの購入" = 3; "日用品" = 6; "衣服費" = 12; "娯楽" = 18; "医療費" = 9; "交通費" = 15; "光熱費" = 8; "通信費" = 5; "住居費" = 18; "その他" = 2 }
  "2026-04" = [ordered]@{ "食費" = 7; "ネットでの購入" = 2; "日用品" = 10; "衣服費" = 7; "娯楽" = 12; "医療費" = 15; "交通費" = 14; "光熱費" = 11; "通信費" = 6; "住居費" = 14; "その他" = 2 }
  "2026-05" = [ordered]@{ "食費" = 5; "ネットでの購入" = 5; "日用品" = 8; "衣服費" = 9; "娯楽" = 16; "医療費" = 8; "交通費" = 12; "光熱費" = 10; "通信費" = 7; "住居費" = 18; "その他" = 2 }
  "2026-06" = [ordered]@{ "食費" = 6; "ネットでの購入" = 3; "日用品" = 7; "衣服費" = 11; "娯楽" = 10; "医療費" = 13; "交通費" = 16; "光熱費" = 9; "通信費" = 5; "住居費" = 18; "その他" = 2 }
  "2026-07" = [ordered]@{ "食費" = 4; "ネットでの購入" = 2; "日用品" = 9; "衣服費" = 8; "娯楽" = 14; "医療費" = 12; "交通費" = 18; "光熱費" = 8; "通信費" = 6; "住居費" = 17; "その他" = 2 }
  "2026-08" = [ordered]@{ "食費" = 5; "ネットでの購入" = 4; "日用品" = 8; "衣服費" = 10; "娯楽" = 13; "医療費" = 10; "交通費" = 14; "光熱費" = 12; "通信費" = 6; "住居費" = 16; "その他" = 2 }
  "2026-09" = [ordered]@{ "食費" = 8; "ネットでの購入" = 3; "日用品" = 9; "衣服費" = 7; "娯楽" = 11; "医療費" = 14; "交通費" = 15; "光熱費" = 9; "通信費" = 5; "住居費" = 17; "その他" = 2 }
}

$categoryTemplates = [ordered]@{
  "食費" = @(
    @{ Merchant = "架空ベーカリー青空店"; Source = "PayPay" },
    @{ Merchant = "サンプル食堂ひだまり"; Source = "JCB" },
    @{ Merchant = "テスト食品マーケット"; Source = "VISA" }
  )
  "ネットでの購入" = @(
    @{ Merchant = "架空ECモール Kite"; Source = "JCB" },
    @{ Merchant = "サンプル通販 Lumen"; Source = "VISA" }
  )
  "日用品" = @(
    @{ Merchant = "架空生活雑貨 Mori"; Source = "PayPay" },
    @{ Merchant = "テストホームストア"; Source = "JCB" }
  )
  "衣服費" = @(
    @{ Merchant = "サンプル衣料 Nagi"; Source = "JCB" },
    @{ Merchant = "架空ファッション Sora"; Source = "VISA" }
  )
  "娯楽" = @(
    @{ Merchant = "架空ボードゲーム工房"; Source = "PayPay" },
    @{ Merchant = "サンプル配信サービス Orbit"; Source = "JCB" },
    @{ Merchant = "テスト水族館"; Source = "VISA" }
  )
  "医療費" = @(
    @{ Merchant = "架空メディカルセンター"; Source = "PayPay" },
    @{ Merchant = "サンプル眼科"; Source = "JCB" }
  )
  "交通費" = @(
    @{ Merchant = "架空交通バス"; Source = "PayPay" },
    @{ Merchant = "サンプルタクシー"; Source = "JCB" },
    @{ Merchant = "テスト駐車場"; Source = "VISA" }
  )
  "光熱費" = @(
    @{ Merchant = "架空電気サービス"; Source = "JCB" },
    @{ Merchant = "サンプル水道"; Source = "VISA" }
  )
  "通信費" = @(
    @{ Merchant = "架空モバイル回線"; Source = "PayPay" },
    @{ Merchant = "サンプルインターネット"; Source = "VISA" }
  )
  "住居費" = @(
    @{ Merchant = "架空アパート管理費"; Source = "JCB" },
    @{ Merchant = "サンプル家賃 Residence"; Source = "VISA" }
  )
  "その他" = @(
    @{ Merchant = "架空ワークショップ Aster"; Source = "PayPay" },
    @{ Merchant = "サンプルサービス Quartz"; Source = "JCB" }
  )
}

$rows = New-Object System.Collections.Generic.List[object]
$sequence = 0

foreach ($month in $monthlyTotals.Keys) {
  $monthTotal = $monthlyTotals[$month]
  $monthNumber = [int]$month.Substring(5, 2)
  $ratios = $monthlyCategoryRatios[$month]

  if (($ratios.Values | Measure-Object -Sum).Sum -ne 100) {
    throw "$month のカテゴリ構成比が100%ではありません。"
  }

  $categoryIndex = 0
  foreach ($category in $ratios.Keys) {
    $sequence += 1
    $templates = $categoryTemplates[$category]
    $template = $templates[($monthNumber + $categoryIndex) % $templates.Count]
    $day = if ($month -eq "2026-09") {
      1 + ($categoryIndex % 2)
    }
    else {
      2 + (($monthNumber + ($categoryIndex * 2)) % 26)
    }

    $amount = [int]($monthTotal * $ratios[$category] / 100)
    $date = Get-Date -Year 2026 -Month $monthNumber -Day $day

    $rows.Add([pscustomobject]@{
      transactionId = "DUMMY2-2026-{0:d4}" -f $sequence
      userId = "presentation_demo_user_02"
      ageGroup = "40s"
      gender = "unspecified"
      date = $date.ToString("yyyy-MM-dd")
      amount = $amount
      merchant = $template.Merchant
      source = $template.Source
      paymentMethod = $template.Source
      category = $category
      type = "expense"
      importBatchId = "DUMMY2-BATCH-$($month.Replace('-', ''))"
      createdAt = "2026-09-07T00:00:00Z"
    }) | Out-Null

    $categoryIndex += 1
  }
}

$rows = @($rows | Sort-Object date, transactionId)
$expectedMonths = 1..9 | ForEach-Object { "2026-{0:d2}" -f $_ }
$actualMonths = @($rows.date.Substring(0, 7) | Sort-Object -Unique)
$total = ($rows.amount | Measure-Object -Sum).Sum
$categoryTotals = $rows | Group-Object category | ForEach-Object {
  [pscustomobject]@{
    Category = $_.Name
    Amount = ($_.Group.amount | Measure-Object -Sum).Sum
  }
}

if (Compare-Object $expectedMonths $actualMonths) {
  throw "生成結果に2026年1月から9月までの全月が含まれていません。"
}
if ($total -ne 150800) {
  throw "生成結果の総額が150,800円ではありません。"
}
if ($categoryTotals.Count -ne 11) {
  throw "生成結果に固定11カテゴリが揃っていません。"
}
if (($rows.transactionId | Sort-Object -Unique).Count -ne $rows.Count) {
  throw "取引番号が重複しています。"
}
if ($rows | Where-Object { $_.amount -le 0 }) {
  throw "0円以下の明細があります。"
}
if ($rows | Where-Object { $_.date.StartsWith("2026-09") -and [int]$_.date.Substring(8, 2) -gt 2 }) {
  throw "9月2日より後の明細があります。"
}

$largestRatio = ($categoryTotals | ForEach-Object { $_.Amount / $total * 100 } | Measure-Object -Maximum).Maximum
$smallestRatio = ($categoryTotals | ForEach-Object { $_.Amount / $total * 100 } | Measure-Object -Minimum).Minimum
if ($largestRatio -gt 20 -or $smallestRatio -lt 2) {
  throw "カテゴリ構成比が分散条件（2%から20%）を満たしていません。"
}

if (Test-Path -LiteralPath $existingPath) {
  $existingMerchants = @(Import-Csv -LiteralPath $existingPath | Select-Object -ExpandProperty merchant -Unique)
  $overlap = @($rows.merchant | Sort-Object -Unique | Where-Object { $existingMerchants -contains $_ })
  if ($overlap.Count -gt 0) {
    throw "既存ダミーと利用先が重複しています。"
  }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null
$rows | Export-Csv -LiteralPath $outputPath -NoTypeInformation -Encoding UTF8

Write-Output "output=$outputPath"
Write-Output "rows=$($rows.Count)"
Write-Output "total=$total"
Write-Output ("categoryRatioRange={0:N1}%..{1:N1}%" -f $smallestRatio, $largestRatio)
