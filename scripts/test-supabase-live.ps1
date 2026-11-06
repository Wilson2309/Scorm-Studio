param([switch]$Workspace)
$ErrorActionPreference = 'Stop'
# Run only with two dedicated, confirmed TEACHER test accounts. No transcript or verbose logging.
# Test passwords are transported to Node via stdin; never argv, environment, logs or files.
$credentialA = $null
$credentialB = $null
$pointerA = [IntPtr]::Zero
$pointerB = [IntPtr]::Zero
$privatePayload = $null
$previousOutputEncoding = $OutputEncoding
try {
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    if ($Workspace) { Write-Host 'Prueba REAL workspace 03.2: crea y elimina solo recursos de prueba. No llama a Ollama.' }
    Write-Host 'Usa dos cuentas TEACHER dedicadas y confirmadas. No compartas contraseñas ni tokens.'
    $emailA = Read-Host 'Correo de prueba A'
    $credentialA = Read-Host 'Contraseña de prueba A' -AsSecureString
    $emailB = Read-Host 'Correo de prueba B'
    $credentialB = Read-Host 'Contraseña de prueba B' -AsSecureString
    $pointerA = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credentialA)
    $pointerB = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credentialB)
    $privatePayload = @{
        a = @{email = $emailA; password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerA)}
        b = @{email = $emailB; password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerB)}
    } | ConvertTo-Json -Compress
    $scriptName = if ($Workspace) { 'test-workspace-live.cjs' } else { 'test-supabase-live.cjs' }
    $privatePayload | & node (Join-Path $PSScriptRoot $scriptName) --run-live
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
