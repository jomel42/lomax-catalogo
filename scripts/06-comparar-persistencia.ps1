$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$archivos = @(
    "categorias.csv",
    "productos.csv",
    "dynamodb.json"
)

$resultados = foreach ($archivo in $archivos) {
    $antes = Join-Path $PWD.Path "evidencias\E2\antes\$archivo"
    $despues = Join-Path $PWD.Path "evidencias\E2\despues\$archivo"

    if (-not (Test-Path $antes) -or -not (Test-Path $despues)) {
        throw "Falta una captura para comparar $archivo."
    }

    $hashAntes = (Get-FileHash -LiteralPath $antes -Algorithm SHA256).Hash
    $hashDespues = (Get-FileHash -LiteralPath $despues -Algorithm SHA256).Hash

    [PSCustomObject]@{
        Archivo = $archivo
        DatosIdenticos = ($hashAntes -eq $hashDespues)
        HashAntes = $hashAntes
        HashDespues = $hashDespues
    }
}

$resultados |
    Export-Csv .\evidencias\E2\comparacion-persistencia.csv `
        -NoTypeInformation -Encoding UTF8

$resultados |
    Select-Object Archivo, DatosIdenticos |
    Format-Table -AutoSize

$diferencias = @($resultados | Where-Object { -not $_.DatosIdenticos })

if ($diferencias.Count -gt 0) {
    throw "Hay diferencias entre las capturas. Revisarlas antes de continuar."
}

Write-Output "PERSISTENCIA VERIFICADA: todos los identificadores y valores permanecen iguales."
