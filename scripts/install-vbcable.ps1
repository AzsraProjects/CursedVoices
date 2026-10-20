# Checks for the VB-CABLE virtual audio cable and, if it is missing, downloads the
# official package from vb-audio.com and opens its own installer (visible, with its own
# licence: VB-CABLE is donationware by VB-Audio, www.vb-cable.com).
#
# Used by the Windows installer (build/installer.nsh) and by Settings > OBS in the app.
# Exit codes: 0 cable present, 1 missing (with -Check), 2 install failed, 3 cancelled.
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$PackUrl = 'https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip'

function Test-Cable {
    $hit = Get-PnpDevice -ErrorAction SilentlyContinue |
        Where-Object { $_.FriendlyName -match 'VB-Audio Virtual Cable|CABLE Input' -and $_.Status -ne 'Unknown' }
    return [bool]$hit
}

if (Test-Cable) { exit 0 }
if ($Check) { exit 1 }

$work = Join-Path $env:TEMP 'CursedVoices-vbcable'
try {
    if (Test-Path $work) { Remove-Item $work -Recurse -Force }
    New-Item -ItemType Directory -Force $work | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zip = Join-Path $work 'vbcable.zip'
    Invoke-WebRequest -Uri $PackUrl -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath $work -Force
    $setup = if ([Environment]::Is64BitOperatingSystem) { 'VBCABLE_Setup_x64.exe' } else { 'VBCABLE_Setup.exe' }
    $exe = Join-Path $work $setup
    if (-not (Test-Path $exe)) { exit 2 }
    $sig = Get-AuthenticodeSignature $exe
    # Only ever run the genuine VB-Audio setup.
    if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'BUREL VINCENT') { exit 2 }
    try {
        Start-Process -FilePath $exe -WorkingDirectory $work -Verb RunAs -Wait
    } catch {
        exit 3 # the Windows admin prompt was declined
    }
    Start-Sleep -Seconds 2
    if (Test-Cable) { exit 0 } else { exit 2 }
} catch {
    exit 2
}
