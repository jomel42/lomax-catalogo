import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { config, pool, s3, dynamo } from "./servicios.js";
import {
  ErrorAPI, dependencia, obtenerProducto, obtenerDetalles
} from "./api-base.js";
import { procesarOriginal } from "./procesar-imagen.js";

export const apiImagenes = Router();

const recibirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxImagen + 1,
    files: 1,
    fields: 0,
    parts: 2
  }
}).single("imagen");

// El bloqueo en PostgreSQL funciona también entre varias instancias de la API.
async function conBloqueo(id, accion) {
  const producto = await obtenerProducto(id);
  const clave = producto.producto_id;
  const db = await dependencia("conectar_rds", () => pool.connect(), clave);
  let bloqueado = false;
  let destruir = false;

  try {
    const resultado = await dependencia(
      "bloquear_producto",
      () => db.query(
        "SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS obtenido",
        [clave]
      ),
      clave
    );

    bloqueado = resultado.rows[0].obtenido;
    if (!bloqueado) {
      throw new ErrorAPI(
        409, "El producto ya se está procesando.",
        "bloquear_producto", clave
      );
    }

    return await accion(producto, db);
  } finally {
    if (bloqueado) {
      try {
        await db.query(
          "SELECT pg_advisory_unlock(hashtext($1)::bigint)",
          [clave]
        );
      } catch {
        destruir = true;
      }
    }
    db.release(destruir);
  }
}

function recibir(req, res) {
  return new Promise((resolve, reject) => {
    recibirArchivo(req, res, (error) => {
      if (!error) return resolve();

      reject(new ErrorAPI(
        error.code === "LIMIT_FILE_SIZE" ? 413 : 400,
        error.code === "LIMIT_FILE_SIZE"
          ? "La imagen supera el límite de 5 MB."
          : "Envía un único archivo en el campo imagen.",
        "recibir_imagen"
      ));
    });
  });
}

async function registrarError(id, error) {
  await dependencia(
    "registrar_error_carga",
    () => dynamo.send(new UpdateCommand({
      TableName: config.tabla,
      Key: { producto_id: id },
      ConditionExpression: "attribute_exists(producto_id)",
      UpdateExpression:
        "SET estado_procesamiento = :estado, error_procesamiento = :error " +
        "REMOVE miniatura_key",
      ExpressionAttributeValues: {
        ":estado": "ERROR",
        ":error": `${error.paso || "cargar_imagen"}: ${error.message}`.slice(0, 1000)
      }
    })),
    id
  );
}

apiImagenes.post("/productos/:id/imagen", async (req, res) => {
  const resultado = await conBloqueo(req.params.id, async (producto, db) => {
    const id = producto.producto_id;
    let clave;

    await dependencia(
      "marcar_pendiente",
      () => db.query(
        "UPDATE productos SET estado = 'PENDIENTE' WHERE producto_id = $1",
        [id]
      ),
      id
    );

    try {
      await recibir(req, res);

      if (!req.file || req.file.size === 0) {
        throw new ErrorAPI(
          400, "Debes enviar una imagen en el campo imagen.",
          "validar_imagen", id
        );
      }

      if (req.file.size > config.maxImagen) {
        throw new ErrorAPI(
          413, "La imagen supera el límite de 5 MB.",
          "validar_tamano", id
        );
      }

      if (!["image/jpeg", "image/png"].includes(req.file.mimetype)) {
        throw new ErrorAPI(
          415, "Solo se admiten JPEG y PNG.",
          "validar_formato", id
        );
      }

      let metadatos;
      try {
        metadatos = await sharp(req.file.buffer).metadata();
      } catch {
        throw new ErrorAPI(
          400, "El archivo no es una imagen válida.",
          "validar_contenido", id
        );
      }

      if (!["jpeg", "png"].includes(metadatos.format)) {
        throw new ErrorAPI(
          415, "El contenido real debe ser JPEG o PNG.",
          "validar_formato", id
        );
      }

      const tipo = metadatos.format === "jpeg" ? "image/jpeg" : "image/png";

      if (req.file.mimetype !== tipo) {
        throw new ErrorAPI(
          415, "El Content-Type no coincide con el formato real.",
          "validar_formato", id
        );
      }

      try {
        await sharp(req.file.buffer).stats();
      } catch {
        throw new ErrorAPI(
          400, "La imagen está dañada o incompleta.",
          "validar_contenido", id
        );
      }

      const hash = createHash("sha256")
        .update(req.file.buffer)
        .digest("hex");

      const extension = metadatos.format === "jpeg" ? "jpg" : "png";
      clave = `originales/${id}/${hash}.${extension}`;

      await dependencia(
        "guardar_original_s3",
        () => s3.send(new PutObjectCommand({
          Bucket: config.originales,
          Key: clave,
          Body: req.file.buffer,
          ContentType: tipo
        })),
        id
      );

      // Conservar la referencia permite reintentar si falla Lambda.
      await dependencia(
        "guardar_referencia_original",
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
    } catch (error) {
      await registrarError(id, error);
      if (error instanceof ErrorAPI) {
        error.productoId = id;
        throw error;
      }
      throw new ErrorAPI(
        502, "No se pudo preparar la imagen.",
        "preparar_imagen", id
      );
    }

    return procesarOriginal(producto, clave, db);
  });

  res.json(resultado);
});

apiImagenes.post("/productos/:id/reprocesar", async (req, res) => {
  const resultado = await conBloqueo(req.params.id, async (producto, db) => {
    await dependencia(
      "marcar_pendiente",
      () => db.query(
        "UPDATE productos SET estado = 'PENDIENTE' WHERE producto_id = $1",
        [producto.producto_id]
      ),
      producto.producto_id
    );

    const detalles = await obtenerDetalles(producto.producto_id);

    return procesarOriginal(
      producto, detalles?.imagen_original_key, db
    );
  });

  res.json(resultado);
});

apiImagenes.get("/productos/:id/imagen", async (req, res) => {
  const producto = await obtenerProducto(req.params.id);
  const id = producto.producto_id;
  const detalles = await obtenerDetalles(id);

  if (
    producto.estado !== "PUBLICADO" ||
    detalles?.estado_procesamiento !== "LISTA" ||
    !detalles?.miniatura_key?.startsWith(`miniaturas/${id}/`)
  ) {
    throw new ErrorAPI(
      404, "La miniatura no está disponible.",
      "buscar_miniatura", id
    );
  }

  const imagen = await dependencia(
    "descargar_miniatura_s3",
    async () => {
      let objeto;
      try {
        objeto = await s3.send(new GetObjectCommand({
          Bucket: config.miniaturas,
          Key: detalles.miniatura_key
        }));
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) {
          throw new ErrorAPI(
            404, "La miniatura no existe en S3.",
            "buscar_miniatura", id
          );
        }
        throw error;
      }

      return {
        tipo: objeto.ContentType,
        bytes: Buffer.from(await objeto.Body.transformToByteArray())
      };
    },
    id
  );

  if (imagen.tipo !== "image/png") {
    throw new ErrorAPI(
      502, "El objeto tiene un Content-Type inesperado.",
      "verificar_tipo_miniatura", id
    );
  }

  res.set("Content-Type", imagen.tipo);
  res.set("Cache-Control", "no-store");
  res.send(imagen.bytes);
});
