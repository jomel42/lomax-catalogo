$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$utf8 = New-Object System.Text.UTF8Encoding($false)

# Consultar directamente los productos actuales de RDS.
$csv = docker run --rm `
    -e PGPASSWORD='LomaxLocal2026!' `
    postgres:16-alpine `
    psql -h host.docker.internal -p 7002 `
    -U lomaxadmin -d lomax `
    -v ON_ERROR_STOP=1 `
    -c "COPY (SELECT producto_id, codigo, nombre, categoria_id FROM productos ORDER BY codigo) TO STDOUT WITH CSV HEADER;"

if ($LASTEXITCODE -ne 0) {
    throw "No se pudo consultar RDS."
}

$productos = @($csv | ConvertFrom-Csv)

if ($productos.Count -ne 20) {
    throw "Se esperaban 20 productos en esta verificacion inicial."
}

$resultados = foreach ($p in $productos) {

    $clave = @{
        producto_id = @{ S = $p.producto_id }
    } | ConvertTo-Json -Depth 4

    $archivoClave = Join-Path $PWD.Path "datos\clave-$($p.codigo).json"
    [System.IO.File]::WriteAllText($archivoClave, $clave, $utf8)

    $salida = aws dynamodb get-item `
        --table-name ProductoDetalles `
        --key "file://$archivoClave" `
        --consistent-read `
        --endpoint-url http://localhost:4566 `
        --region us-east-1 `
        --output json

    if ($LASTEXITCODE -ne 0) {
        throw "Fallo get-item para $($p.codigo)."
    }

    $json = $salida -join "`n"
    $respuesta = $json | ConvertFrom-Json
    $item = $respuesta.Item

    $archivoEvidencia = Join-Path $PWD.Path "evidencias\E2\get-$($p.codigo).json"
    [System.IO.File]::WriteAllText($archivoEvidencia, $json, $utf8)

    if (
        $null -eq $item -or
        $item.producto_id.S -ne $p.producto_id -or
        $item.codigo.S -ne $p.codigo
    ) {
        throw "El identificador o codigo no coincide para $($p.codigo)."
    }

    $campos = switch ($p.categoria_id) {
        "1" { @("conexion", "distribucion", "tipo") }
        "2" { @("pulgadas", "resolucion", "frecuencia_hz") }
        "3" { @("conexion", "dpi", "botones") }
        default { throw "Categoria inesperada para $($p.codigo)." }
    }

    foreach ($campo in $campos) {
        if ($null -eq $item.atributos.M.PSObject.Properties[$campo]) {
            throw "Falta el atributo $campo en $($p.codigo)."
        }
    }

    [PSCustomObject]@{
        Codigo      = $p.codigo
        Producto_ID = $p.producto_id
        Coincidencia = "OK"
        Atributos   = ($campos -join ", ")
    }
}

$resultados |
    Export-Csv .\evidencias\E2\comparacion-rds-dynamodb.csv `
        -NoTypeInformation -Encoding UTF8

$resultados | Format-Table -AutoSize
Write-Output "Productos verificados correctamente: $($resultados.Count)"
