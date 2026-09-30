import sharp from "sharp";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { GetFunctionConfigurationCommand } from "@aws-sdk/client-lambda";
import {
  config, pool, s3, dynamoCliente, lambda
} from "./servicios.js";

let paso = "inicio";

try {
  paso = "RDS";
  const { rows } = await pool.query(`
    SELECT
      current_database() AS base,
      (SELECT COUNT(*)::int FROM categorias) AS categorias,
      (SELECT COUNT(*)::int FROM productos) AS productos
  `);

  console.log(
    `OK RDS: base=${rows[0].base}, categorias=${rows[0].categorias}, productos=${rows[0].productos}`
  );

  paso = "DynamoDB";
  const tabla = await dynamoCliente.send(
    new DescribeTableCommand({ TableName: config.tabla })
  );

  if (tabla.Table?.TableStatus !== "ACTIVE") {
    throw new Error("La tabla no está ACTIVE.");
  }
  console.log(`OK DynamoDB: ${config.tabla} ACTIVE`);

  for (const bucket of [config.originales, config.miniaturas]) {
    paso = `S3 ${bucket}`;
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`OK S3: acceso a ${bucket}`);
  }

  paso = "Lambda";
  const funcion = await lambda.send(
    new GetFunctionConfigurationCommand({
      FunctionName: config.funcion
    })
  );

  if (funcion.State !== "Active") {
    throw new Error(`Estado de Lambda: ${funcion.State}`);
  }
  console.log(`OK Lambda: ${config.funcion} Active`);

  paso = "Sharp";
  const prueba = await sharp({
    create: {
      width: 1200,
      height: 800,
      channels: 3,
      background: "#243b53"
    }
  })
    .resize({
      width: 300,
      height: 300,
      fit: "inside",
      withoutEnlargement: true
    })
    .png()
    .toBuffer();

  const dimensiones = await sharp(prueba).metadata();

  if (dimensiones.width !== 300 || dimensiones.height !== 200) {
    throw new Error("Dimensiones inesperadas.");
  }

  console.log("OK Sharp: procesamiento 1200x800 -> 300x200");
  console.log("CONEXIONES Y DEPENDENCIAS VERIFICADAS.");
} catch (error) {
  console.error(`ERROR en ${paso}: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
  s3.destroy();
  dynamoCliente.destroy();
  lambda.destroy();
}
