# Lambda de miniaturas de Lomax

Este paquete contiene el código fuente y el constructor del ZIP de despliegue. No crea ni invoca la función en FLOCI. Extraerlo dentro de `C:\Users\jomel\lomax`, conservando la carpeta `lambda`.

## Construcción en PowerShell

```powershell
Set-Location "$HOME\lomax"
Test-Path .\lambda\lambda_function.py

docker run --rm --entrypoint python --mount "type=bind,source=$($PWD.Path)\lambda,target=/trabajo" public.ecr.aws/lambda/python:3.12 /trabajo/construir.py
if ($LASTEXITCODE -ne 0) { throw 'Fallo la construccion. No desplegar el ZIP.' }

Get-Item .\lambda\funcion.zip | Select-Object Name, Length
```

El constructor instala Pillow 12.3.0 en una carpeta temporal del contenedor, comprueba que funciona, y empaqueta `lambda_function.py`, `PIL` y sus dependencias nativas en `lambda/funcion.zip`. Se utiliza la imagen Linux del mismo runtime que ejecutará Lambda; las bibliotecas nativas de Windows no son intercambiables con las de Linux. Boto3 y Botocore proceden del runtime oficial de AWS Lambda, ya comprobado mediante `comprobar_conexion.py`.

El archivo de código fuente descargado no es el ZIP de despliegue: se subirá posteriormente `lambda/funcion.zip`.

## Contrato para el despliegue posterior

- Runtime: `python3.12`.
- Handler: `lambda_function.lambda_handler`.
- Memoria propuesta: 512 MB.
- Tiempo máximo propuesto: 60 segundos.
- Invocación directa y síncrona mediante CLI o API; sin notificación automática de S3.
- Variables: `FLOCI_ENDPOINT=http://floci:4566`, `BUCKET_ORIGINALES=lomax-originales`, `BUCKET_MINIATURAS=lomax-miniaturas`, `TABLA_PRODUCTOS=ProductoDetalles`.
- Conectividad: contenedor Lambda y FLOCI deben compartir la red `rrhh-documentos_default`, o una ruta equivalente que resuelva el nombre `floci`.
- Permisos que necesitará el rol: leer objetos originales, escribir y eliminar miniaturas, y consultar/actualizar ProductoDetalles. La función no necesita acceso a RDS.

Evento de ejemplo para el producto existente TEC001:

```json
{
  "producto_id": "b2bf5297-b48d-4563-8808-998307041fdc",
  "bucket": "lomax-originales",
  "clave": "originales/b2bf5297-b48d-4563-8808-998307041fdc/prueba.jpg"
}
```

El evento requiere un UUID existente en DynamoDB. La clave del original debe comenzar con `originales/{producto_id}/`. No se crean registros de DynamoDB para identificadores desconocidos.

## Validación y salida

Se comprueba el tamaño y el contenido real del archivo. Se admiten JPEG y PNG hasta 5 000 000 bytes. Pillow verifica y decodifica la imagen; no se confía únicamente en su extensión o Content-Type. La salida es PNG, proporcional, de hasta 300 por 300 píxeles y sin ampliar imágenes menores. También se respeta la orientación EXIF.

Clave de salida: `miniaturas/{producto_id}/{SHA256(bucket/clave)}.png`. Repetir el mismo evento sobrescribe la misma clave y no crea objetos con otros nombres. Esta identidad se basa en el objeto original (bucket y clave).

En éxito se guarda `miniatura_key` y `estado_procesamiento=LISTA`. Se devuelve `ok=true`, las claves, los buckets y las dimensiones original y final. En un error de procesamiento se retira la miniatura de esa misma clave si existe, se elimina su referencia y se guarda `estado_procesamiento=ERROR`, conservando el original para reintentar. Si falla la limpieza o no se puede registrar el estado en DynamoDB, se propaga una excepción para no ocultar el fallo.

Un evento mal formado o un producto inexistente devuelve error funcional sin crear registros nuevos. Un fallo de servicio que impida incluso obtener la tabla puede producir FunctionError.

## Publicación y comprobación E3

Esta función no modifica RDS ni cambia productos a PUBLICADO. Los productos de la Etapa 2 permanecen PENDIENTES. En la Etapa 4, la API deberá establecer o mantener PENDIENTE durante el procesamiento y publicar únicamente tras comprobar atributos y miniatura disponibles.

No basta con `StatusCode: 200` en `lambda invoke`. Se debe comprobar que no exista FunctionError, que el resultado tenga `ok=true` y `estado=LISTA`, que S3 contenga la clave esperada y que DynamoDB guarde esa misma referencia. Para el archivo inválido, comprobar `ok=false`, estado ERROR en DynamoDB y ausencia de la miniatura correspondiente.

Las pruebas con FLOCI, descargas reales, repetición y archivos de evidencia se realizarán después del despliegue. La comprobación incluida en el constructor valida únicamente la generación local de la miniatura.
