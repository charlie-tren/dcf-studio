<#
    Opens every exported workbook in Excel, forces a full recalculation, and
    compares what Excel computes against the result DCF Studio cached in the
    file. Any cell where the two disagree is a place where the sheet's formula
    says something different from the engine.

    This is the only check that can see that class of fault, and it has caught it
    twice: the FX conversion cell held the bare rate with no sub-unit multiply,
    and the terminal reinvestment charge was unfloored. Both times the cached
    result was correct, so every test that read the cache passed - and
    fullCalcOnLoad meant Excel replaced the right number with the wrong one the
    moment a reader opened the file.

    It needs Excel, so it cannot live in the vitest suite. Run it after touching
    lib/workbook.ts, alongside the diagnostics in the README.

        npx next dev -p 3120
        pwsh -File scripts/recalc-check.ps1 -Port 3120

    Verified discriminating on 27/08/2026: injecting a "*0.5" into the quoted
    value-per-share formula produced exactly two mismatches, that cell and the
    upside that depends on it.
#>
param(
  [int]$Port = 3120,
  [string[]]$Tickers = @('MSFT','SHEL.L','CBA.AX','MSB.AX','SGP.AX','RY.TO','7203.T','ARB.AX','BHP.AX','NPN.JO'),
  # The engine branches on these and the sheet has to branch with it. Sweeping
  # tickers alone missed three divergences: the steady-state toggle off, a
  # negative terminal growth, and a WACC override, which the sheet used to
  # recalculate straight back out of the file.
  [string[]]$States = @(
    'horizon=10', 'scenario=bear', 'scenario=consensus', 'mid=0', 'tcx=0',
    'wacc=0.07&tg=0.03', 'tg=-0.005', 'wacc=0.14', 'tcx=0&tg=-0.005',
    'horizon=10&tcx=0&mid=0&scenario=bear'
  ),
  [string]$StateTicker = 'MSFT',
  [double]$Tolerance = 1e-6
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 does not load this by default, and the failure is a
# TypeNotFound at the first zip, well after the exports have been fetched.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dcf-recalc-" + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $dir | Out-Null

# `powershell -File` hands every argument over as a string, so -Tickers MSFT,SHEL.L
# arrives as ONE element and the fetch asks for a ticker called "MSFT,SHEL.L".
$Tickers = $Tickers | ForEach-Object { $_ -split ',' } | Where-Object { $_ }

foreach($t in $Tickers){
  $safe = $t -replace '\.',''
  Invoke-WebRequest -Uri "http://localhost:$Port/api/export?ticker=$t" -OutFile (Join-Path $dir "$safe.xlsx") -UseBasicParsing | Out-Null
}

$stateIndex = 0
foreach($q in $States){
  $stateIndex++
  Invoke-WebRequest -Uri "http://localhost:$Port/api/export?ticker=$StateTicker&$q" -OutFile (Join-Path $dir "state$stateIndex.xlsx") -UseBasicParsing | Out-Null
}

# The cached results, read WITHOUT Excel - opening in Excel recalculates them away.
$cached = @{}
foreach($f in (Get-ChildItem $dir -Filter *.xlsx)){
  $zip = [System.IO.Compression.ZipFile]::OpenRead($f.FullName)
  try {
    foreach($e in $zip.Entries | Where-Object { $_.FullName -like 'xl/worksheets/sheet*.xml' }){
      $sr = New-Object System.IO.StreamReader($e.Open())
      $xml = $sr.ReadToEnd(); $sr.Close()
      foreach($m in [regex]::Matches($xml, '<c r="([A-Z]+\d+)"[^>]*>(?:(?!</c>).)*?<v>([^<]+)</v>')){
        $v = 0.0
        if([double]::TryParse($m.Groups[2].Value, [ref]$v)){
          $cached["$($f.Name)|$($e.FullName)|$($m.Groups[1].Value)"] = $v
        }
      }
    }
  } finally { $zip.Dispose() }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false; $excel.DisplayAlerts = $false
$mismatches = @(); $compared = 0
try {
  foreach($f in (Get-ChildItem $dir -Filter *.xlsx)){
    $wb = $excel.Workbooks.Open($f.FullName)
    $excel.CalculateFullRebuild()
    $sheetIndex = 0
    foreach($sh in $wb.Worksheets){
      $sheetIndex++
      $part = "xl/worksheets/sheet$sheetIndex.xml"
      $used = $sh.UsedRange
      for($r=1; $r -le $used.Rows.Count; $r++){
        for($c=1; $c -le $used.Columns.Count; $c++){
          $cell = $used.Cells.Item($r,$c)
          $v = $cell.Value2
          if($v -isnot [double]){ continue }
          $key = "$($f.Name)|$part|$($cell.Address($false,$false))"
          if(-not $cached.ContainsKey($key)){ continue }
          $compared++
          $cv = $cached[$key]
          $denom = [Math]::Max([Math]::Max([Math]::Abs($cv), [Math]::Abs($v)), 1e-9)
          if([Math]::Abs($cv - $v) / $denom -gt $Tolerance){
            $mismatches += [pscustomobject]@{ File=$f.Name; Cell=$key.Split('|')[-1]; Cached=$cv; Recalculated=$v }
          }
        }
      }
    }
    $wb.Close($false)
  }
} finally {
  $excel.Quit(); [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
}

# Report the denominator, not a bare count: "0 mismatches" and "nothing was
# examined" produce the same headline otherwise.
"workbooks $($Tickers.Count) tickers + $($States.Count) states, cells compared $compared, mismatches $($mismatches.Count)"
if($compared -lt 100){ throw "Only $compared cells compared - the check found nothing to check." }
if($mismatches.Count -gt 0){ $mismatches | Format-Table -AutoSize | Out-String | Write-Host; exit 1 }
