import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  HeadObjectCommand, GetObjectCommand
} from "@aws-sdk/client-s3";
import { InvokeCommand } from "@aws-sdk/client-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config, s3, lambda, dynamo } from "./servicios.js";
import {
  ErrorAPI, dependencia, obtenerDetalles, atributosValidos
} from "./api-base.js";

function errorProceso(status, mensaje, paso, id) {
  return new ErrorAPI(status, mensaje, paso, id);
}

export async function procesarOriginal(producto, clave, db) {
  const id = producto.producto_id;

  // La conexión db pertenece al bloqueo de este producto.
  // Esta actualización se confirma antes de consultar servicios externos.
  await dependencia(
    "marcar_pendiente",
    () => db.query(
      "UPDATE productos SET estado = 'PENDIENTE' WHERE producto_id = $1",
      [id]
    ),
    id
  );

  try {
    if (!clave) {
      throw errorProceso(
        409, "El producto no tiene una imagen original guardada.",
        "buscar_original", id
      );
    }

    if (!clave.startsWith(`originales/${id}/`)) {
      throw errorProceso(
        409, "La clave del original no corresponde al producto.",
        "validar_original", id
      );
    }

    const detalles = await obtenerDetalles(id);

    if (
      !detalles ||
      detalles.codigo !== producto.codigo ||
      !atributosValidos(detalles.atributos)
    ) {
      throw errorProceso(
        409, "El producto no tiene atributos válidos en DynamoDB.",
        "verificar_atributos", id
      );
    }

    const original = await dependencia(
      "consultar_original_s3",
      async () => {
        try {
          return await s3.send(new HeadObjectCommand({
            Bucket: config.originales,
            Key: clave
          }));
        } catch (error) {
          if (error.$metadata?.httpStatusCode === 404) {
            throw errorProceso(
              409, "El original no existe en S3.",
              "buscar_original", id
            );
          }
          throw error;
        }
      },
      id
    );

    if (!original.ContentLength) {
      throw errorProceso(400, "El original está vacío.", "validar_tamano", id);
    }

    if (original.ContentLength > config.maxImagen) {
      throw errorProceso(
        413, "La imagen supera el límite de 5 MB.",
        "validar_tamano", id
      );
    }

    await dependencia(
      "registrar_original_dynamodb",
      () => dynamo.send(new UpdateCommand({
        TableName: config.tabla,
        Key: { producto_id: id },
        ConditionExpression: "attribute_exists(producto_id)",
        UpdateExpression:
          "SET imagen_original_key = :clave, estado_procesamiento = :estado " +
          "REMOVE miniatura_key, error_procesamiento",
        ExpressionAttributeValues: {
          ":clave": clave,
          ":estado": "PENDIENTE"
        }
      })),
      id
    );

    const invocacion = await dependencia(
      "invocar_lambda",
      () => lambda.send(new InvokeCommand({
        FunctionName: config.funcion,
        InvocationType: "RequestResponse",
        Payload: Buffer.from(JSON.stringify({
          producto_id: id,
          bucket: config.originales,
          clave
        }))
      })),
      id
    );

    if (invocacion.StatusCode !== 200 || invocacion.FunctionError) {
      throw errorProceso(
        502, "Lambda reportó un error de ejecución.",
        "ejecutar_lambda", id
      );
    }

    let resultado;
    try {
      resultado = JSON.parse(
        Buffer.from(invocacion.Payload ?? []).toString("utf8")
      );
    } catch {
      throw errorProceso(
        502, "Lambda devolvió una respuesta que no es JSON válido.",
        "leer_respuesta_lambda", id
      );
    }

    if (resultado.ok !== true || resultado.estado !== "LISTA") {
      throw errorProceso(
        resultado.paso === "validar_y_generar" ? 400 : 502,
        resultado.error || "Lambda no confirmó el procesamiento.",
        `lambda:${resultado.paso || "procesamiento"}`,
        id
      );
    }

    const hash = createHash("sha256")
      .update(`${config.originales}/${clave}`)
      .digest("hex");

    const claveEsperada = `miniaturas/${id}/${hash}.png`;

    if (
      resultado.producto_id !== id ||
      resultado.imagen_original_key !== clave ||
      resultado.miniatura_bucket !== config.miniaturas ||
      resultado.miniatura_key !== claveEsperada
    ) {
      throw errorProceso(
        502, "La respuesta de Lambda no corresponde al original solicitado.",
        "verificar_respuesta_lambda", id
      );
    }

    const actualizado = await obtenerDetalles(id);

    if (
      !actualizado ||
      actualizado.codigo !== producto.codigo ||
      !atributosValidos(actualizado.atributos) ||
      actualizado.estado_procesamiento !== "LISTA" ||
      actualizado.imagen_original_key !== clave ||
      actualizado.miniatura_key !== claveEsperada
    ) {
      throw errorProceso(
        502, "DynamoDB no confirma los atributos y la miniatura esperados.",
        "verificar_dynamodb", id
      );
    }

    const miniatura = await dependencia(
      "recuperar_miniatura_s3",
      async () => {
        const objeto = await s3.send(new GetObjectCommand({
          Bucket: config.miniaturas,
          Key: claveEsperada
        }));

        return {
          contenido: objeto.ContentType,
          bytes: Buffer.from(await objeto.Body.transformToByteArray())
        };
      },
      id
    );

    let dimensiones;
    try {
      dimensiones = await sharp(miniatura.bytes).metadata();
      await sharp(miniatura.bytes).stats();
    } catch {
      throw errorProceso(
        502, "El objeto generado no es una imagen válida.",
        "verificar_miniatura", id
      );
    }

    if (
      miniatura.contenido !== "image/png" ||
      dimensiones.format !== "png" ||
      !dimensiones.width || !dimensiones.height ||
      dimensiones.width > 300 || dimensiones.height > 300
    ) {
      throw errorProceso(
        502, "La miniatura incumple el formato o las dimensiones.",
        "verificar_miniatura", id
      );
    }

    await dependencia(
      "publicar_rds",
      () => db.query(
        "UPDATE productos SET estado = 'PUBLICADO' WHERE producto_id = $1",
        [id]
      ),
      id
    );

    return {
      producto_id: id,
      estado: "PUBLICADO",
      estado_procesamiento: "LISTA",
      miniatura_key: claveEsperada,
      imagen_url: `/productos/${id}/imagen`,
      dimensiones: {
        ancho: dimensiones.width,
        alto: dimensiones.height
      }
    };
  } catch (error) {
    // También cubre un fallo al confirmar la publicación en RDS.
    await dependencia(
      "conservar_pendiente",
      () => db.query(
        "UPDATE productos SET estado = 'PENDIENTE' WHERE producto_id = $1",
        [id]
      ),
      id
    );

    await dependencia(
      "registrar_error_dynamodb",
      () => dynamo.send(new UpdateCommand({
        TableName: config.tabla,
        Key: { producto_id: id },
        ConditionExpression: "attribute_exists(producto_id)",
        UpdateExpression:
          "SET estado_procesamiento = :estado, error_procesamiento = :error " +
          "REMOVE miniatura_key",
        ExpressionAttributeValues: {
          ":estado": "ERROR",
          ":error": `${error.paso || "procesamiento"}: ${error.message}`.slice(0, 1000)
        }
      })),
      id
    );

    if (error instanceof ErrorAPI) throw error;
    console.error("[procesar_original]", error);
    throw errorProceso(
      502, "No se pudo completar el procesamiento.",
      "procesar_original", id
    );
  }
}
