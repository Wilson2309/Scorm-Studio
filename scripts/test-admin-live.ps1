param([switch]$TeacherResources)
$ErrorActionPreference = 'Stop'
$pointerAdmin = [IntPtr]::Zero
$pointerTeacher = [IntPtr]::Zero
$secretAdmin = $null
$secretTeacher = $null
$priorEncoding = $OutputEncoding
try {
    Set-Location -LiteralPath (Split-Path $PSScriptRoot -Parent)
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    if ($TeacherResources) { Write-Host 'Prueba temporal ADMIN->TEACHER: crea y elimina solo PDF/quiz/ZIP sinteticos. Sin Ollama ni cambios de rol.' }
    else { Write-Host 'Prueba real API y navegador ADMIN/TEACHER. Manten Next.js abierto en localhost:3000.' }
    Write-Host 'No cambia roles ni llama a Ollama. Intentos administrativos invalidos deben ser rechazados.'
    $emailAdmin = Read-Host 'Correo ADMIN confirmado'
    $secretAdmin = Read-Host 'Contrasena ADMIN' -AsSecureString
    $emailTeacher = Read-Host 'Correo TEACHER confirmado'
    $secretTeacher = Read-Host 'Contrasena TEACHER' -AsSecureString
    $pointerAdmin = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretAdmin)
    $pointerTeacher = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secretTeacher)
    $privatePayload = @{
        admin = @{email=$emailAdmin; password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerAdmin)}
        teacher = @{email=$emailTeacher; password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointerTeacher)}
    } | ConvertTo-Json -Compress
    $probeScript = if ($TeacherResources) { 'test-admin-resources-live.cjs' } else { 'test-admin-live.cjs' }
    $privatePayload | & node (Join-Path $PSScriptRoot $probeScript) --run-live
    $checkExit = $LASTEXITCODE
} finally {
    $OutputEncoding = $priorEncoding
    if ($pointerAdmin -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointerAdmin) }
    if ($pointerTeacher -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointerTeacher) }
    if ($secretAdmin) { $secretAdmin.Dispose() }
    if ($secretTeacher) { $secretTeacher.Dispose() }
    Remove-Variable privatePayload,emailAdmin,emailTeacher,secretAdmin,secretTeacher -ErrorAction SilentlyContinue
}
exit $checkExit
