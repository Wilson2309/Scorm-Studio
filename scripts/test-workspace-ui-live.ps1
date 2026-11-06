$ErrorActionPreference = 'Stop'
$pointerA = [IntPtr]::Zero
$pointerB = [IntPtr]::Zero
$credentialA = $null
$credentialB = $null
$previousOutputEncoding = $OutputEncoding
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
    if (-not $env:SCORM_CDP_MODULE) { throw 'Configure SCORM_CDP_MODULE with a local CDP driver.' }
    & node (Join-Path $PSScriptRoot '../tests/workspace-ui-live.mjs') --preflight
    if ($LASTEXITCODE -ne 0) { throw 'Browser preflight failed before requesting credentials.' }
    Write-Host 'QA REAL de navegador: Supabase + una generacion Ollama. Manten Next.js y el tunel abiertos.'
    Write-Host 'Usa dos cuentas TEACHER dedicadas. No se guardan credenciales. Deja esta terminal abierta hasta completar el historial.'
    $emailA = Read-Host 'Correo de prueba A'
    $credentialA = Read-Host 'Contrasena A' -AsSecureString
    $emailB = Read-Host 'Correo de prueba B'
    $credentialB = Read-Host 'Contrasena B' -AsSecureString
    $pointerA = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credentialA)
    $pointerB = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credentialB)
    $privatePayload = @{
        a = @{email = $emailA; password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerA)}
        b = @{email = $emailB; password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerB)}
    } | ConvertTo-Json -Compress
    $privatePayload | & node (Join-Path $PSScriptRoot '../tests/workspace-ui-live.mjs') --run-live
    $checkExit = $LASTEXITCODE
} finally {
    $OutputEncoding = $previousOutputEncoding
    if ($pointerA -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointerA) }
    if ($pointerB -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointerB) }
    if ($credentialA) { $credentialA.Dispose() }
    if ($credentialB) { $credentialB.Dispose() }
    Remove-Variable privatePayload,emailA,emailB,credentialA,credentialB -ErrorAction SilentlyContinue
}
exit $checkExit
