import hashlib
import io
import os
import uuid
import warnings

from PIL import Image, ImageOps

MAX_BYTES = 5_000_000
BUCKET_ORIGINALES = os.getenv('BUCKET_ORIGINALES', 'lomax-originales')
BUCKET_MINIATURAS = os.getenv('BUCKET_MINIATURAS', 'lomax-miniaturas')
TABLA = os.getenv('TABLA_PRODUCTOS', 'ProductoDetalles')


def crear_miniatura(datos):
    if not datos or len(datos) > MAX_BYTES:
        raise ValueError('La imagen debe tener entre 1 byte y 5 MB (5000000 bytes).')
    with warnings.catch_warnings():
        warnings.simplefilter('error', Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(datos)) as prueba:
            if prueba.format not in ('JPEG', 'PNG'):
                raise ValueError('Formato no permitido. Solo JPEG o PNG.')
            prueba.verify()
        with Image.open(io.BytesIO(datos)) as original:
            original.load()
            imagen = ImageOps.exif_transpose(original)
            dimensiones_original = imagen.size
            imagen = imagen.convert('RGBA' if 'A' in imagen.getbands() or 'transparency' in imagen.info else 'RGB')
            imagen.thumbnail((300, 300), Image.Resampling.LANCZOS)
            salida = io.BytesIO()
            imagen.save(salida, format='PNG')
            return salida.getvalue(), dimensiones_original, imagen.size


def servicios():
    import boto3
    from botocore.config import Config
    endpoint = os.getenv('FLOCI_ENDPOINT', 'http://floci:4566')
    region = os.getenv('AWS_REGION', 'us-east-1')
    config = Config(connect_timeout=5, read_timeout=15, retries={'max_attempts': 1}, s3={'addressing_style': 'path'})
    s3 = boto3.client('s3', endpoint_url=endpoint, region_name=region, config=config)
    tabla = boto3.resource('dynamodb', endpoint_url=endpoint, region_name=region, config=config).Table(TABLA)
    return s3, tabla


def lambda_handler(event, context):
    # El evento es una solicitud directa; no es una notificacion automatica de S3.
    try:
        producto_id = str(uuid.UUID(event['producto_id']))
        bucket = event['bucket']
        clave = event['clave']
        if bucket != BUCKET_ORIGINALES:
            raise ValueError('Bucket de originales no permitido.')
        if not isinstance(clave, str) or not clave.startswith(f'originales/{producto_id}/'):
            raise ValueError('La clave debe comenzar con originales/{producto_id}/.')
    except (KeyError, ValueError, TypeError, AttributeError) as exc:
        return {'ok': False, 'estado': 'ERROR', 'paso': 'validar_evento', 'error': str(exc)}

    identificador_imagen = hashlib.sha256(f'{bucket}/{clave}'.encode('utf-8')).hexdigest()
    miniatura_key = f'miniaturas/{producto_id}/{identificador_imagen}.png'
    s3, tabla = servicios()
    producto_confirmado = False
    paso = 'consultar_producto'

    try:
        respuesta = tabla.get_item(Key={'producto_id': producto_id}, ConsistentRead=True)
        if 'Item' not in respuesta:
            raise ValueError('El producto no existe en DynamoDB.')
        producto_confirmado = True
        paso = 'registrar_original'
        tabla.update_item(
            Key={'producto_id': producto_id},
            ConditionExpression='attribute_exists(producto_id)',
            UpdateExpression='SET imagen_original_key = :o, estado_procesamiento = :p REMOVE miniatura_key, error_procesamiento',
            ExpressionAttributeValues={':o': clave, ':p': 'PENDIENTE'}
        )
        paso = 'descargar_original'
        meta = s3.head_object(Bucket=bucket, Key=clave)
        if meta['ContentLength'] > MAX_BYTES:
            raise ValueError('El archivo supera el limite de 5 MB (5000000 bytes).')
        objeto = s3.get_object(Bucket=bucket, Key=clave)
        try:
            datos = objeto['Body'].read(MAX_BYTES + 1)
        finally:
            objeto['Body'].close()
        paso = 'validar_y_generar'
        miniatura, original_size, miniatura_size = crear_miniatura(datos)
        paso = 'guardar_miniatura'
        s3.put_object(Bucket=BUCKET_MINIATURAS, Key=miniatura_key, Body=miniatura, ContentType='image/png')
        s3.head_object(Bucket=BUCKET_MINIATURAS, Key=miniatura_key)
        paso = 'actualizar_dynamodb'
        tabla.update_item(
            Key={'producto_id': producto_id},
            ConditionExpression='attribute_exists(producto_id)',
            UpdateExpression='SET miniatura_key = :m, estado_procesamiento = :e REMOVE error_procesamiento',
            ExpressionAttributeValues={':m': miniatura_key, ':e': 'LISTA'}
        )
        return {
            'ok': True, 'producto_id': producto_id, 'estado': 'LISTA',
            'imagen_original_key': clave, 'miniatura_bucket': BUCKET_MINIATURAS,
            'miniatura_key': miniatura_key, 'tipo_contenido': 'image/png',
            'original': {'ancho': original_size[0], 'alto': original_size[1]},
            'miniatura': {'ancho': miniatura_size[0], 'alto': miniatura_size[1]}
        }
    except Exception as exc:
        detalle = f'{type(exc).__name__}: {exc}'[:1000]
        limpieza_error = None
        if producto_confirmado:
            # Retira incluso una miniatura previa de esta misma clave si el reintento falla.
            try:
                s3.delete_object(Bucket=BUCKET_MINIATURAS, Key=miniatura_key)
            except Exception as limpieza:
                limpieza_error = str(limpieza)
            try:
                tabla.update_item(
                    Key={'producto_id': producto_id},
                    ConditionExpression='attribute_exists(producto_id)',
                    UpdateExpression='SET estado_procesamiento = :e, error_procesamiento = :d REMOVE miniatura_key',
                    ExpressionAttributeValues={':e': 'ERROR', ':d': f'{paso}: {detalle}'}
                )
            except Exception as registro:
                raise RuntimeError(f'{paso}: {detalle}. No se pudo guardar ERROR en DynamoDB: {registro}') from registro
        if limpieza_error:
            raise RuntimeError(f'{paso}: {detalle}. No se pudo retirar la miniatura: {limpieza_error}') from exc
        return {'ok': False, 'producto_id': producto_id, 'estado': 'ERROR', 'paso': paso, 'error': detalle}
