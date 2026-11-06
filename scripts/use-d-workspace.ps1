# Dot-source in the current shell: . .\scripts\use-d-workspace.ps1
$scormWorkspaceRoot = [IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
if (-not $scormWorkspaceRoot.StartsWith('D:\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'SCORM Studio must run from its workspace on D: on this machine.'
}
$scormWorkspaceTemp = Join-Path $scormWorkspaceRoot '.cache\tmp'
$scormWorkspaceNpm = Join-Path $scormWorkspaceRoot '.cache\npm'
New-Item -ItemType Directory -Force -Path $scormWorkspaceTemp,$scormWorkspaceNpm | Out-Null
$env:TEMP = $scormWorkspaceTemp
$env:TMP = $scormWorkspaceTemp
$env:TASTE_SKILL_TMP = $scormWorkspaceTemp
$env:npm_config_cache = $scormWorkspaceNpm
