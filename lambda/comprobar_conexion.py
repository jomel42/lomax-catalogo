import boto3
from botocore.config import Config

endpoint = "http://floci:4566"

config = Config(
    connect_timeout=5,
    read_timeout=10,
    retries={"max_attempts": 1},
    s3={"addressing_style": "path"}
)

s3 = boto3.client(
    "s3",
    endpoint_url=endpoint,
    region_name="us-east-1",
    config=config
)

dynamodb = boto3.client(
    "dynamodb",
    endpoint_url=endpoint,
    region_name="us-east-1",
    config=config
)

for bucket in ("lomax-originales", "lomax-miniaturas"):
    s3.head_bucket(Bucket=bucket)
    print(f"OK: acceso al bucket {bucket}", flush=True)

respuesta = dynamodb.describe_table(TableName="ProductoDetalles")
estado = respuesta["Table"]["TableStatus"]

if estado != "ACTIVE":
    raise RuntimeError(f"ProductoDetalles no esta activa: {estado}")

print("OK: tabla ProductoDetalles ACTIVE", flush=True)
print("CONEXION CORRECTA con S3 y DynamoDB.", flush=True)
