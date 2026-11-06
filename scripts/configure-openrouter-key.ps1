$ErrorActionPreference = 'Stop'
$envPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.env.local'))
$secureKey = $null
$plainKey = $null
$pointer = [IntPtr]::Zero
$envLines = $null
try {
    $Host.UI.RawUI.WindowTitle = 'SCORM Studio - OpenRouter (entrada privada)'
    $envLines = if ([IO.File]::Exists($envPath)) { @([IO.File]::ReadAllLines($envPath)) } else { @() }
    foreach ($entry in $envLines) {
        if ($entry -match '^\s*(?:export\s+)?AI_API_KEY\s*=\s*(.*)$') {
            $existing = $Matches[1].Trim().Trim('"').Trim("'")
            if ($existing -and -not $existing.StartsWith('#')) {
                Write-Host 'AI_API_KEY ya está configurada.'
                exit 0
            }
        }
    }
    $secureKey = Read-Host 'Pega tu API key de OpenRouter' -AsSecureString
    if ($secureKey.Length -eq 0) { Write-Host 'AI_API_KEY configured: false'; exit 1 }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plainKey -notmatch '^[A-Za-z0-9._-]+$') { throw 'Invalid input' }
    # Re-read after private input so unrelated edits made while waiting are preserved.
    $envLines = if ([IO.File]::Exists($envPath)) { @([IO.File]::ReadAllLines($envPath)) } else { @() }
    $found = $false
    for ($i = 0; $i -lt $envLines.Count; $i++) {
        if ($envLines[$i] -match '^\s*(?:export\s+)?AI_API_KEY\s*=') {
            $envLines[$i] = 'AI_API_KEY=' + $plainKey
            $found = $true
        }
    }
    if (-not $found) { $envLines += 'AI_API_KEY=' + $plainKey }
    [IO.File]::WriteAllLines($envPath, [string[]]$envLines, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'API key guardada de forma local en .env.local.'
} catch {
    Write-Host 'No se pudo guardar la API key. No se ha mostrado su contenido.'
    exit 1
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($secureKey) { $secureKey.Dispose() }
    Remove-Variable plainKey,secureKey,envLines,entry,existing,Matches -ErrorAction SilentlyContinue
}
