param(
    [string]$Endpoint = "http://localhost:4566",
    [string]$Region = "us-east-1"
)

$ErrorActionPreference = "Stop"

function Invoke-AwsJson {
    param([string[]]$Argumentos)

    $salida = & aws @Argumentos `
      --endpoint-url $Endpoint `
      --region $Region `
      --output json `
      --no-cli-pager

    if ($LASTEXITCODE -ne 0) {
        throw "Fallo AWS CLI: $($Argumentos[0]) $($Argumentos[1])."
    }

    if ($salida) {
        return (($salida -join "`n") | ConvertFrom-Json)
    }
}

# RDS: consultar antes de crear.
$instancias = Invoke-AwsJson -Argumentos @(
    "rds", "describe-db-instances"
)

$existentes = @(
    $instancias.DBInstances | Where-Object {
        $_.DBInstanceIdentifier -eq "lomax-rds"
    }
)

if ($existentes.Count -gt 0) {
    $db = $existentes[0]

    if ($db.Engine -ne "postgres" -or $db.DBName -ne "lomax") {
        throw "lomax-rds existe con una configuracion diferente."
    }

    Write-Output "RDS: lomax-rds ya existe."
} else {
    $claveSegura = Read-Host `
      "Contraseña nueva para lomaxadmin; usarla tambien en backend/.env" `
      -AsSecureString

    $credencial = [System.Management.Automation.PSCredential]::new(
        "lomaxadmin", $claveSegura
    )

    try {
        $clave = $credencial.GetNetworkCredential().Password

        if ([string]::IsNullOrWhiteSpace($clave)) {
            throw "La contraseña no puede estar vacia."
        }

        $null = Invoke-AwsJson -Argumentos @(
            "rds", "create-db-instance",
            "--db-instance-identifier", "lomax-rds",
            "--db-instance-class", "db.t3.micro",
            "--engine", "postgres",
            "--engine-version", "16",
            "--allocated-storage", "20",
            "--storage-type", "gp2",
            "--master-username", "lomaxadmin",
            "--master-user-password", $clave,
            "--db-name", "lomax",
            "--publicly-accessible"
        )
    } finally {
        $clave = $null
        $credencial = $null
        $claveSegura = $null
    }

    Write-Output "RDS: solicitud de creacion enviada."
}

# DynamoDB: consultar antes de crear.
$tablas = Invoke-AwsJson -Argumentos @(
    "dynamodb", "list-tables"
)

if (@($tablas.TableNames) -contains "ProductoDetalles") {
    Write-Output "DynamoDB: ProductoDetalles ya existe."
} else {
    $null = Invoke-AwsJson -Argumentos @(
        "dynamodb", "create-table",
        "--table-name", "ProductoDetalles",
        "--attribute-definitions", "AttributeName=producto_id,AttributeType=S",
        "--key-schema", "AttributeName=producto_id,KeyType=HASH",
        "--billing-mode", "PAY_PER_REQUEST"
    )

    Write-Output "DynamoDB: solicitud de creacion enviada."
}

# Esperar disponibilidad.
$null = Invoke-AwsJson -Argumentos @(
    "rds", "wait", "db-instance-available",
    "--db-instance-identifier", "lomax-rds"
)

$null = Invoke-AwsJson -Argumentos @(
    "dynamodb", "wait", "table-exists",
    "--table-name", "ProductoDetalles"
)

$estadoRds = Invoke-AwsJson -Argumentos @(
    "rds", "describe-db-instances",
    "--db-instance-identifier", "lomax-rds"
)

$estadoTabla = Invoke-AwsJson -Argumentos @(
    "dynamodb", "describe-table",
    "--table-name", "ProductoDetalles"
)

$tabla = $estadoTabla.Table

if (
    @($tabla.KeySchema).Count -ne 1 -or
    $tabla.KeySchema[0].AttributeName -ne "producto_id" -or
    $tabla.KeySchema[0].KeyType -ne "HASH"
) {
    throw "La clave de ProductoDetalles no coincide con el modelo."
}

$tipoClave = @(
    $tabla.AttributeDefinitions | Where-Object {
        $_.AttributeName -eq "producto_id" -and $_.AttributeType -eq "S"
    }
)

if ($tipoClave.Count -ne 1) {
    throw "producto_id debe ser de tipo String."
}

$db = $estadoRds.DBInstances[0]

Write-Output "RDS: $($db.DBInstanceIdentifier) | $($db.DBInstanceStatus)"
Write-Output "Base: $($db.DBName)"
Write-Output "Endpoint PostgreSQL: $($db.Endpoint.Address):$($db.Endpoint.Port)"
Write-Output "DynamoDB: $($tabla.TableName) | $($tabla.TableStatus)"
Write-Output "OK: recursos disponibles. Este script no carga ni modifica productos."
