$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
node scripts/qa.mjs setup
if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar PostgreSQL y las dependencias locales.' }
if (-not (Test-Path -LiteralPath '.qa/ACCESO_LOCAL.txt')) {
    node scripts/qa.mjs demo
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la demostración.' }
}
node -e "require('https').get('https://localhost:3444/api/health',{rejectUnauthorized:false},r=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{process.exit(r.statusCode===200&&JSON.parse(b).status==='healthy'?0:1)}catch{process.exit(1)}})}).on('error',()=>process.exit(1))"
if ($LASTEXITCODE -eq 0) {
    Write-Host 'La presentación ya está disponible en https://localhost:3444'
    Write-Host 'Acceso privado: .qa/ACCESO_LOCAL.txt'
    exit 0
}
if (-not (Test-Path -LiteralPath '.next/BUILD_ID')) {
    node scripts/qa.mjs build
    if ($LASTEXITCODE -ne 0) { throw 'La compilación falló.' }
}
Write-Host 'Presentación local: https://localhost:3444'
Write-Host 'Datos sintéticos. Consulte .qa/ACCESO_LOCAL.txt para entrar.'
node scripts/qa.mjs serve
