$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "us-east-1"
$env:AWS_PAGER = ""

# Primero obtener la lista; después recorrer sus productos.
$catalogo = Invoke-RestMethod `
    -Uri "http://localhost:8080/api/productos" `
    -Method Get

$encontrados = @(
    foreach ($producto in $catalogo) {
        if ($producto.codigo -eq "TEC-WEB-001") {
            $producto
        }
    }
)

if ($encontrados.Count -ne 1) {
    $catalogo |
        Select-Object producto_id, codigo, nombre, estado |
        Format-Table -AutoSize

    throw "No se encontró un único TEC-WEB-001. Revisar el código mostrado en la tabla."
}

$productoWeb = $encontrados[0]
$idWeb = ([guid]$productoWeb.producto_id).ToString()

if ($idWeb -eq [guid]::Empty.ToString()) {
    throw "El identificador no es válido."
}

Write-Output "Producto encontrado: $($productoWeb.codigo)"
Write-Output "producto_id: $idWeb"

$productoWeb |
    ConvertTo-Json -Depth 20 |
    Set-Content -Encoding UTF8 .\evidencias\E5\producto-formulario.json

# Verificación directa en RDS.
docker run --rm `
    -e PGPASSWORD='LomaxLocal2026!' `
    postgres:16-alpine `
    psql -h host.docker.internal -p 7002 `
    -U lomaxadmin -d lomax `
    -v ON_ERROR_STOP=1 `
    -c "SELECT producto_id, codigo, nombre, precio, categoria_id, estado FROM productos WHERE producto_id = '$idWeb';" |
    Tee-Object -FilePath .\evidencias\E5\registro-formulario-rds.txt

if ($LASTEXITCODE -ne 0) {
    throw "Falló la consulta directa de RDS."
}

# Regenerar la clave de DynamoDB con el identificador correcto.
$claveWeb = @{
    producto_id = @{ S = $idWeb }
} | ConvertTo-Json -Depth 5

[System.IO.File]::WriteAllText(
    (Join-Path $PWD.Path "datos\clave-producto-web.json"),
    $claveWeb,
    [System.Text.UTF8Encoding]::new($false)
)

$salidaDynamo = aws dynamodb get-item `
    --table-name ProductoDetalles `
    --key file://datos/clave-producto-web.json `
    --consistent-read `
    --endpoint-url http://localhost:4566 `
    --region us-east-1 `
    --output json

if ($LASTEXITCODE -ne 0) {
    throw "Falló la consulta directa de DynamoDB."
}

$salidaDynamo |
    Set-Content -Encoding UTF8 .\evidencias\E5\registro-formulario-dynamodb.json

$detalleWeb = ($salidaDynamo -join "`n") | ConvertFrom-Json
$claveMiniatura = $detalleWeb.Item.miniatura_key.S

if (
    $productoWeb.estado -ne "PUBLICADO" -or
    $detalleWeb.Item.producto_id.S -ne $idWeb -or
    $detalleWeb.Item.codigo.S -ne "TEC-WEB-001" -or
    $detalleWeb.Item.estado_procesamiento.S -ne "LISTA" -or
    [string]::IsNullOrWhiteSpace($claveMiniatura) -or
    $claveMiniatura -cne $productoWeb.miniatura_key
) {
    throw "Los datos de la API y DynamoDB no coinciden."
}

Write-Output "DynamoDB: producto correcto, estado LISTA y referencia coincidente."
Write-Output "Atributos:"
$detalleWeb.Item.atributos.M | ConvertTo-Json -Depth 10

# Descargar exactamente la clave registrada en DynamoDB.
aws s3api get-object `
    --bucket lomax-miniaturas `
    --key $claveMiniatura `
    --endpoint-url http://localhost:4566 `
    --region us-east-1 `
    .\descargas\TEC-WEB-001-miniatura.png |
    Tee-Object -FilePath .\evidencias\E5\descarga-formulario-s3.json

if ($LASTEXITCODE -ne 0) {
    throw "Falló la descarga de S3."
}

Write-Output "OK: consultas completadas y miniatura descargada."
Invoke-Item .\descargas\TEC-WEB-001-miniatura.png
