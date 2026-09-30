$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$carpetaEvidencias = ".\evidencias\E5\publicacion-catalogo"
New-Item -ItemType Directory -Force $carpetaEvidencias | Out-Null

# Obtener los identificadores actuales directamente de RDS.
$salidaSql = docker run --rm `
    -e PGPASSWORD='LomaxLocal2026!' `
    postgres:16-alpine `
    psql -h host.docker.internal -p 7002 `
    -U lomaxadmin -d lomax `
    -v ON_ERROR_STOP=1 `
    -c "COPY (SELECT producto_id, codigo FROM productos WHERE codigo ~ '^(TEC00[1-7]|MON00[1-7]|RAT00[1-6])$' ORDER BY codigo) TO STDOUT WITH CSV HEADER;"

if ($LASTEXITCODE -ne 0) {
    throw "No se pudieron recuperar los productos de RDS."
}

$productos = @($salidaSql | ConvertFrom-Csv)

if ($productos.Count -ne 20) {
    throw "Se esperaban 20 productos iniciales y se encontraron $($productos.Count)."
}

$productos |
    Export-Csv "$carpetaEvidencias\productos-rds.csv" `
    -NoTypeInformation -Encoding UTF8

# Revisar todos los archivos antes de comenzar las cargas.
foreach ($producto in $productos) {
    $archivo = ".\imagenes\catalogo\$($producto.codigo).png"

    if (-not (Test-Path $archivo)) {
        throw "Falta la imagen de $($producto.codigo)."
    }

    $tamano = (Get-Item $archivo).Length
    if ($tamano -le 0 -or $tamano -gt 5000000) {
        throw "Tamaño inválido para $($producto.codigo)."
    }

    [void][guid]::Parse($producto.producto_id)
}

$resultados = @()

foreach ($producto in $productos) {
    $codigo = $producto.codigo
    $id = $producto.producto_id
    $archivo = "imagenes/catalogo/$codigo.png"
    $respuestaArchivo = "$carpetaEvidencias\$codigo-respuesta.json"
    $cabecerasArchivo = "$carpetaEvidencias\$codigo-cabeceras.txt"

    Write-Output "Procesando $codigo..."

    $http = curl.exe -sS `
        --max-time 180 `
        -D $cabecerasArchivo `
        -o $respuestaArchivo `
        -w "%{http_code}" `
        -X POST "http://localhost:8080/api/productos/$id/imagen" `
        -F "imagen=@$archivo;type=image/png"

    if ($LASTEXITCODE -ne 0) {
        throw "Falló la conexión al cargar $codigo. Puedes repetir el script."
    }

    $respuesta = Get-Content -Raw -Encoding UTF8 $respuestaArchivo |
        ConvertFrom-Json

    if (
        $http -ne "200" -or
        $respuesta.producto_id -ne $id -or
        $respuesta.estado -ne "PUBLICADO" -or
        $respuesta.estado_procesamiento -ne "LISTA" -or
        [string]::IsNullOrWhiteSpace($respuesta.miniatura_key)
    ) {
        Get-Content -Raw -Encoding UTF8 $respuestaArchivo
        throw "No se confirmó la publicación de $codigo. HTTP: $http"
    }

    $resultados += [PSCustomObject]@{
        Codigo = $codigo
        Producto_ID = $id
        HTTP = $http
        Estado = $respuesta.estado
        Miniatura = $respuesta.miniatura_key
    }

    $resultados |
        Export-Csv "$carpetaEvidencias\resultado-publicacion.csv" `
        -NoTypeInformation -Encoding UTF8

    Write-Output "OK: $codigo | HTTP $http | PUBLICADO"
}

Write-Output ""
Write-Output "Productos iniciales publicados: $($resultados.Count)"
Write-Output "OK: carga completada mediante la API."
