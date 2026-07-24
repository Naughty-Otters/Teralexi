$ErrorActionPreference = 'Stop'
$toolsDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$version = '0.0.5'
$url = "https://github.com/Naughty-Otters/Teralexi/releases/download/v$version/teralexi-windows-x64.zip"
$zip = Join-Path $toolsDir 'teralexi.zip'
$checksum = '0aa239f10a8cbc17c3e3f6484ff32bddf7e9d78d24d5ec489ff03dbd1b3df7d6'

Get-ChocolateyWebFile -PackageName 'teralexi' -FileFullPath $zip -Url $url -Checksum $checksum -ChecksumType 'sha256'
Get-ChocolateyUnzip -FileFullPath $zip -Destination $toolsDir
Install-ChocolateyPath -PathToInstall $toolsDir -PathType 'Machine'
