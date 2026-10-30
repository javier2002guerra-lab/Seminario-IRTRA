param([Parameter(Mandatory=$true)][string]$WorkbookPath)
$ErrorActionPreference = 'Stop'
$resolvedWorkbook = (Resolve-Path -LiteralPath $WorkbookPath).Path
$excelApp = $null
$qaWorkbook = $null
try {
    $excelApp = New-Object -ComObject Excel.Application
    $excelApp.Visible = $false
    $excelApp.DisplayAlerts = $false
    $excelApp.AutomationSecurity = 3 # Disable all macros, including Workbook_Open.
    $excelApp.AskToUpdateLinks = $false
    $qaWorkbook = $excelApp.Workbooks.Open($resolvedWorkbook, 0, $true)
    $excelApp.CalculateFullRebuild()
    $errors = @()
    foreach ($sheet in $qaWorkbook.Worksheets) {
        $errorCells = $null
        try { $errorCells = $sheet.UsedRange.SpecialCells(-4123, 16) } catch {}
        if ($null -ne $errorCells) {
            foreach ($cell in $errorCells.Cells) {
                $errors += @{ sheet=$sheet.Name; cell=$cell.Address($false,$false); error=$cell.Text }
            }
        }
    }
    $checks = @(
        @{sheet='Preguntas directas'; cell='E4'; expected=1},
        @{sheet='Comentarios Negativos en Rest'; cell='S3'; expected=1},
        @{sheet='Comentarios Negativos en Hotele'; cell='R4'; expected=1},
        @{sheet='QUEJAS ACUMULADAS POR AREA'; cell='G4'; expected=1},
        @{sheet='sugerencias mas Frecuentes'; cell='B22'; expected=2}
    )
    $results = foreach ($check in $checks) {
        $value = $qaWorkbook.Worksheets.Item($check.sheet).Range($check.cell).Value2
        @{sheet=$check.sheet; cell=$check.cell; expected=$check.expected; actual=$value; pass=($value -eq $check.expected)}
    }
    @{excelVersion=$excelApp.Version; macrosDisabled=$true; readOnly=$true; formulaErrors=$errors; checks=@($results)} | ConvertTo-Json -Depth 8
    if ($errors.Count -gt 0 -or @($results | Where-Object { -not $_.pass }).Count -gt 0) { exit 1 }
} finally {
    if ($null -ne $qaWorkbook) { $qaWorkbook.Close($false); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($qaWorkbook) }
    if ($null -ne $excelApp) { $excelApp.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excelApp) }
}
