import "dotenv/config";
import pg from "pg";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { LambdaClient } from "@aws-sdk/client-lambda";

const obligatorias = [
  "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
  "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY",
  "FLOCI_ENDPOINT", "TABLA_PRODUCTOS",
  "BUCKET_ORIGINALES", "BUCKET_MINIATURAS", "FUNCION_MINIATURAS"
];

for (const nombre of obligatorias) {
  if (!process.env[nombre]) {
    throw new Error(`Falta configurar ${nombre}`);
  }
}

export const config = {
  puerto: Number(process.env.PORT || 3000),
  tabla: process.env.TABLA_PRODUCTOS,
  originales: process.env.BUCKET_ORIGINALES,
  miniaturas: process.env.BUCKET_MINIATURAS,
  funcion: process.env.FUNCION_MINIATURAS,
  maxImagen: Number(process.env.MAX_IMAGE_BYTES || 5000000)
};

export const pool = new pg.Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

pool.on("error", (error) => {
  console.error("Error de conexión inactiva con RDS:", error.message);
});

const opcionesAWS = {
  region: process.env.AWS_REGION,
  endpoint: process.env.FLOCI_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  },
  maxAttempts: 2
};

export const s3 = new S3Client({
  ...opcionesAWS,
  forcePathStyle: true
});

export const dynamoCliente = new DynamoDBClient(opcionesAWS);

export const dynamo = DynamoDBDocumentClient.from(dynamoCliente, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

export const lambda = new LambdaClient(opcionesAWS);
