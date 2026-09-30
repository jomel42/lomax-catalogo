$ErrorActionPreference = "Stop"

Set-Location (Split-Path $PSScriptRoot -Parent)

$productos = @(Import-Csv .\datos\productos-rds.csv)
$utf8 = New-Object System.Text.UTF8Encoding($false)

$definiciones = @{
    TEC001 = @{ conexion="USB"; distribucion="ES"; tipo="Mecanico" }
    TEC002 = @{ conexion="USB"; distribucion="ES"; tipo="Membrana" }
    TEC003 = @{ conexion="Inalambrica 2.4 GHz"; distribucion="ES"; tipo="Membrana" }
    TEC004 = @{ conexion="USB"; distribucion="US"; tipo="Mecanico 60%" }
    TEC005 = @{ conexion="USB"; distribucion="ES"; tipo="Ergonomico" }
    TEC006 = @{ conexion="USB"; distribucion="ES"; tipo="Membrana retroiluminado" }
    TEC007 = @{ conexion="Bluetooth"; distribucion="ES"; tipo="Membrana" }

    MON001 = @{ pulgadas=24; resolucion="1920x1080"; frecuencia_hz=75 }
    MON002 = @{ pulgadas=27; resolucion="1920x1080"; frecuencia_hz=75 }
    MON003 = @{ pulgadas=27; resolucion="2560x1440"; frecuencia_hz=144 }
    MON004 = @{ pulgadas=32; resolucion="3840x2160"; frecuencia_hz=60 }
    MON005 = @{ pulgadas=24; resolucion="1920x1080"; frecuencia_hz=165 }
    MON006 = @{ pulgadas=34; resolucion="3440x1440"; frecuencia_hz=144 }
    MON007 = @{ pulgadas=15.6; resolucion="1920x1080"; frecuencia_hz=60 }

    RAT001 = @{ conexion="USB"; dpi=1200; botones=3 }
    RAT002 = @{ conexion="Inalambrica 2.4 GHz"; dpi=1600; botones=3 }
    RAT003 = @{ conexion="USB"; dpi=12000; botones=6 }
    RAT004 = @{ conexion="Inalambrica 2.4 GHz"; dpi=2400; botones=6 }
    RAT005 = @{ conexion="Bluetooth"; dpi=1600; botones=3 }
    RAT006 = @{ conexion="USB"; dpi=16000; botones=6 }
}

# Validar los datos antes de iniciar la carga.
foreach ($codigo in $definiciones.Keys) {
    $coincidencias = @($productos | Where-Object { $_.codigo -eq $codigo })

    if ($coincidencias.Count -ne 1) {
        throw "El CSV debe contener exactamente un producto con codigo $codigo."
    }

    [void][guid]::Parse($coincidencias[0].producto_id)
}

$procesados = 0

foreach ($p in $productos) {
    if (-not $definiciones.ContainsKey($p.codigo)) {
        continue
    }

    $atributos = @{}

    foreach ($campo in $definiciones[$p.codigo].Keys) {
        $valor = $definiciones[$p.codigo][$campo]

        if ($valor -is [string]) {
            $atributos[$campo] = @{ S = $valor }
        }
        else {
            $numero = [Convert]::ToString(
                $valor,
                [Globalization.CultureInfo]::InvariantCulture
            )
            $atributos[$campo] = @{ N = $numero }
        }
    }

    $solicitud = @{
        TableName = "ProductoDetalles"

        Key = @{
            producto_id = @{ S = $p.producto_id }
        }

        UpdateExpression = "SET codigo = if_not_exists(codigo, :c), atributos = if_not_exists(atributos, :a), imagen_original_key = if_not_exists(imagen_original_key, :n), miniatura_key = if_not_exists(miniatura_key, :n), estado_procesamiento = if_not_exists(estado_procesamiento, :e)"

        ConditionExpression = "attribute_not_exists(producto_id) OR codigo = :c"

        ExpressionAttributeValues = @{
            ":c" = @{ S = $p.codigo }
            ":a" = @{ M = $atributos }
            ":n" = @{ NULL = $true }
            ":e" = @{ S = "PENDIENTE" }
        }

        ReturnValues = "ALL_NEW"
    }

    $archivo = Join-Path $PWD.Path "datos\ddb-$($p.codigo).json"
    $json = $solicitud | ConvertTo-Json -Depth 12

    [System.IO.File]::WriteAllText($archivo, $json, $utf8)

    $salida = aws dynamodb update-item `
        --cli-input-json "file://$archivo" `
        --endpoint-url http://localhost:4566 `
        --region us-east-1 `
        --output json

    if ($LASTEXITCODE -ne 0) {
        throw "Fallo la carga del producto $($p.codigo)."
    }

    $resultado = ($salida -join "`n") | ConvertFrom-Json

    if (
        $resultado.Attributes.producto_id.S -ne $p.producto_id -or
        $resultado.Attributes.codigo.S -ne $p.codigo
    ) {
        throw "La respuesta no coincide con el producto $($p.codigo)."
    }

    $procesados++
    Write-Output "OK: $($p.codigo) | producto_id: $($p.producto_id)"
}

Write-Output "Total de productos procesados: $procesados"
