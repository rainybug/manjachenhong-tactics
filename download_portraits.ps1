$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$manifest=Get-Content -LiteralPath (Join-Path $root 'portrait-sources.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$out=Join-Path $root 'assets\portraits'
New-Item -ItemType Directory -Path $out -Force | Out-Null
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$ok=0; $failed=@()
foreach($entry in $manifest.portraits){
  $path=Join-Path $out ([string]$entry.image_file)
  if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt 2000){
    Write-Host ('SKIP '+$entry.name)
    $ok++
    continue
  }
  $success=$false
  for($i=0;$i -lt 3;$i++){
    try{
      Invoke-WebRequest -Uri $entry.url -OutFile $path -UseBasicParsing -TimeoutSec 25 -Headers @{'User-Agent'='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36'; 'Referer'='https://game8.jp/'; 'Accept'='image/webp,image/png,image/*'} | Out-Null
      if ((Get-Item -LiteralPath $path).Length -lt 2000){ throw 'Image too small' }
      $success=$true
      break
    }catch{
      Remove-Item -LiteralPath $path -Force -ErrorAction SilentlyContinue
      Start-Sleep -Milliseconds (300*($i+1))
    }
  }
  if($success){$ok++;Write-Host ('OK   '+$entry.name)}
  else{$failed+=($entry.name+' ['+$entry.id+']');Write-Host ('FAIL '+$entry.name)}
}
Write-Host ('Installed: '+$ok+'/'+$manifest.portraits.Count)
if($failed.Count -gt 0){Write-Host ('Missing portraits: '+($failed -join ', '));Write-Host 'Run this program again or provide images manually as the required .webp filenames.'}
else{Write-Host 'Offline portraits are ready. Open index.html.'}
