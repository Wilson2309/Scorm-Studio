$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
. .\scripts\use-d-workspace.ps1
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$secretA=$null; $secretB=$null; $pointerA=[IntPtr]::Zero; $pointerB=[IntPtr]::Zero
try {
    & node .\tests\roulette-live.mjs --preflight
    if ($LASTEXITCODE -ne 0) { throw 'Preflight failed before requesting credentials.' }
    Write-Host 'Aceptacion real de ruleta: dos cuentas independientes. Solo recursos sinteticos; sin Ollama ni cambios de roles.'
    $emailA=Read-Host 'Correo de la cuenta docente A'
    $secretA=Read-Host 'Contrasena A' -AsSecureString
    $emailB=Read-Host 'Correo de la segunda cuenta B (TEACHER o ADMIN existente)'
    $secretB=Read-Host 'Contrasena B' -AsSecureString
    $pointerA=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretA)
    $pointerB=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretB)
    $privatePayload=@{a=@{email=$emailA;password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerA)};b=@{email=$emailB;password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerB)}} | ConvertTo-Json -Compress
    $privatePayload | & node .\tests\roulette-live.mjs --run-live
    $result=$LASTEXITCODE
} finally {
    if($pointerA -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointerA)}
    if($pointerB -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointerB)}
    if($secretA){$secretA.Dispose()};if($secretB){$secretB.Dispose()}
    Remove-Variable privatePayload,emailA,emailB,secretA,secretB -ErrorAction SilentlyContinue
}
exit $result
