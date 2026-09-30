param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("antes", "despues")]
    [string]$Momento
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$utf8 = New-Object System.Text.UTF8Encoding($false)
$carpeta = Join-Path $PWD.Path "evidencias\E2\$Momento"

New-Item -ItemType Directory -Force -Path $carpeta | Out-Null

$consultas = @{
    categorias = "COPY (SELECT categoria_id, nombre FROM categorias ORDER BY categoria_id) TO STDOUT WITH CSV HEADER;"
    productos = "COPY (SELECT producto_id, codigo, nombre, descripcion, precio, categoria_id, fecha AT TIME ZONE 'UTC' AS fecha_utc, estado FROM productos ORDER BY producto_id) TO STDOUT WITH CSV HEADER;"
}

foreach ($tabla in @("categorias", "productos")) {
    $salida = docker run --rm `
        -e PGPASSWORD='LomaxLocal2026!' `
        postgres:16-alpine `
        psql -h host.docker.internal -p 7002 `
        -U lomaxadmin -d lomax `
        -v ON_ERROR_STOP=1 `
        -c $consultas[$tabla]

    if ($LASTEXITCODE -ne 0) {
        throw "No se pudo capturar la tabla $tabla."
    }

    $contenido = ($salida -join "`n") + "`n"
    $archivo = Join-Path $carpeta "$tabla.csv"

    [System.IO.File]::WriteAllText($archivo, $contenido, $utf8)

    $filas = @($salida | ConvertFrom-Csv)
    Write-Output "${tabla}: $($filas.Count) registros guardados."
}

$salidaDynamo = aws dynamodb scan `
    --table-name ProductoDetalles `
    --consistent-read `
    --endpoint-url http://localhost:4566 `
    --region us-east-1 `
    --output json

if ($LASTEXITCODE -ne 0) {
    throw "No se pudieron capturar los datos de DynamoDB."
}

$respuesta = ($salidaDynamo -join "`n") | ConvertFrom-Json

function Ordenar-Contenido {
    param($Valor)

    if ($null -eq $Valor) {
        return $null
    }

    if ($Valor -is [System.Management.Automation.PSCustomObject]) {
        $ordenado = [ordered]@{}

        foreach ($propiedad in ($Valor.PSObject.Properties | Sort-Object Name)) {
            $ordenado[$propiedad.Name] = Ordenar-Contenido $propiedad.Value
        }

        return $ordenado
    }

    if ($Valor -is [System.Array]) {
        $elementos = @(
            foreach ($elemento in $Valor) {
                Ordenar-Contenido $elemento
            }
        )

        return ,$elementos
    }

    return $Valor
}

$items = @($respuesta.Items | Sort-Object { $_.producto_id.S })
$contenidoOrdenado = Ordenar-Contenido $items
$json = ConvertTo-Json -InputObject $contenidoOrdenado -Depth 30

$archivoDynamo = Join-Path $carpeta "dynamodb.json"
[System.IO.File]::WriteAllText($archivoDynamo, $json, $utf8)

Write-Output "DynamoDB: $($items.Count) registros guardados."
Write-Output "Captura '$Momento' completada."
