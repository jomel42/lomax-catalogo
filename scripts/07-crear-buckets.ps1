$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "us-east-1"
$env:AWS_PAGER = ""

$salida = aws s3api list-buckets `
    --endpoint-url http://localhost:4566 `
    --region us-east-1 `
    --output json

if ($LASTEXITCODE -ne 0) {
    throw "No se pudieron consultar los buckets de FLOCI."
}

$respuesta = ($salida -join "`n") | ConvertFrom-Json
$existentes = @($respuesta.Buckets | ForEach-Object { $_.Name })

foreach ($nombre in @("lomax-originales", "lomax-miniaturas")) {

    if ($existentes -contains $nombre) {
        Write-Output "Bucket existente: $nombre. Se conserva."
    }
    else {
        aws s3api create-bucket `
            --bucket $nombre `
            --endpoint-url http://localhost:4566 `
            --region us-east-1 `
            --output json

        if ($LASTEXITCODE -ne 0) {
            throw "No se pudo crear el bucket $nombre."
        }

        Write-Output "Bucket creado: $nombre"
    }

    aws s3api head-bucket `
        --bucket $nombre `
        --endpoint-url http://localhost:4566 `
        --region us-east-1

    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo acceder al bucket $nombre."
    }

    Write-Output "Acceso verificado: $nombre"
}
