import { Router } from "express";
import { randomUUID } from "node:crypto";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { pool, dynamo, config } from "./servicios.js";

export const apiBase = Router();

export class ErrorAPI extends Error {
  constructor(status, mensaje, paso, productoId) {
    super(mensaje);
    this.status = status;
    this.paso = paso;
    this.productoId = productoId;
  }
}

export async function dependencia(paso, accion, productoId) {
  try {
    return await accion();
  } catch (error) {
    if (error instanceof ErrorAPI) throw error;
    console.error(`[${paso}]`, error.message);
    throw new ErrorAPI(
      503, "No se pudo completar la operación con el servicio.",
      paso, productoId
    );
  }
}

export function validarId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ErrorAPI(400, "producto_id debe ser un UUID.", "validar_id");
  }
}

export function atributosValidos(atributos) {
  if (
    !atributos ||
    typeof atributos !== "object" ||
    Array.isArray(atributos)
  ) return false;

  const entradas = Object.entries(atributos);
  return entradas.length >= 1 && entradas.length <= 30 &&
    entradas.every(([clave, valor]) => {
      if (!clave.trim() || clave.length > 80) return false;
      if (typeof valor === "string") {
        return valor.trim().length > 0 && valor.length <= 500;
      }
      if (typeof valor === "number") return Number.isFinite(valor);
      return typeof valor === "boolean";
    });
}

export async function obtenerProducto(id) {
  validarId(id);
  const resultado = await dependencia(
    "consultar_rds",
    () => pool.query("SELECT * FROM productos WHERE producto_id = $1", [id]),
    id
  );

  if (!resultado.rows.length) {
    throw new ErrorAPI(404, "Producto no encontrado.", "consultar_producto", id);
  }
  return resultado.rows[0];
}

export async function obtenerDetalles(id) {
  const respuesta = await dependencia(
    "consultar_dynamodb",
    () => dynamo.send(new GetCommand({
      TableName: config.tabla,
      Key: { producto_id: id },
      ConsistentRead: true
    })),
    id
  );
  return respuesta.Item;
}

function combinar(producto, detalles) {
  return {
    ...producto,
    precio: Number(producto.precio),
    atributos: detalles?.atributos ?? null,
    imagen_original_key: detalles?.imagen_original_key ?? null,
    miniatura_key: detalles?.miniatura_key ?? null,
    estado_procesamiento: detalles?.estado_procesamiento ?? "PENDIENTE",
    error_procesamiento: detalles?.error_procesamiento ?? null,
    imagen_url: detalles?.miniatura_key
      ? `/productos/${producto.producto_id}/imagen`
      : null
  };
}

apiBase.get("/categorias", async (req, res) => {
  const resultado = await dependencia(
    "consultar_categorias",
    () => pool.query(
      "SELECT categoria_id, nombre FROM categorias ORDER BY categoria_id"
    )
  );
  res.json(resultado.rows);
});

apiBase.post("/productos", async (req, res) => {
  const datos = req.body;

  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new ErrorAPI(400, "Se requiere un objeto JSON.", "validar_registro");
  }

  const { codigo, nombre, descripcion, precio, categoria_id, atributos } = datos;

  for (const [campo, valor, limite] of [
    ["codigo", codigo, 50],
    ["nombre", nombre, 150],
    ["descripcion", descripcion, 5000]
  ]) {
    if (
      typeof valor !== "string" ||
      !valor.trim() ||
      valor.trim().length > limite
    ) {
      throw new ErrorAPI(
        400, `${campo} es obligatorio y admite hasta ${limite} caracteres.`,
        "validar_registro"
      );
    }
  }

  if (
    typeof precio !== "number" ||
    !Number.isFinite(precio) ||
    precio < 0 ||
    precio > 9999999999.99 ||
    !/^\d+(\.\d{1,2})?$/.test(String(precio))
  ) {
    throw new ErrorAPI(
      400, "precio debe ser un número no negativo con máximo dos decimales.",
      "validar_registro"
    );
  }

  if (!Number.isSafeInteger(categoria_id) || categoria_id <= 0) {
    throw new ErrorAPI(400, "categoria_id debe ser un entero positivo.", "validar_registro");
  }

  if (!atributosValidos(atributos)) {
    throw new ErrorAPI(
      400,
      "atributos debe contener entre 1 y 30 campos con texto, números o booleanos.",
      "validar_registro"
    );
  }

  const id = randomUUID();

  try {
    await pool.query(`
      INSERT INTO productos
        (producto_id, codigo, nombre, descripcion, precio, categoria_id, estado)
      VALUES ($1, $2, $3, $4, $5, $6, 'PENDIENTE')
    `, [id, codigo.trim(), nombre.trim(), descripcion.trim(), precio, categoria_id]);
  } catch (error) {
    if (error.code === "23505" && error.constraint === "uq_productos_codigo") {
      throw new ErrorAPI(409, "El código del producto ya existe.", "registrar_rds");
    }
    if (error.code === "23503") {
      throw new ErrorAPI(400, "La categoría no existe.", "registrar_rds");
    }
    if (error.code === "23514" || error.code === "22003") {
      throw new ErrorAPI(400, "Los valores incumplen las restricciones.", "registrar_rds");
    }
    console.error("[registrar_rds]", error.message);
    throw new ErrorAPI(503, "No se pudo confirmar el registro en RDS.", "registrar_rds", id);
  }

  await dependencia(
    "registrar_dynamodb",
    () => dynamo.send(new PutCommand({
      TableName: config.tabla,
      Item: {
        producto_id: id,
        codigo: codigo.trim(),
        atributos,
        imagen_original_key: null,
        miniatura_key: null,
        estado_procesamiento: "PENDIENTE"
      },
      ConditionExpression: "attribute_not_exists(producto_id)"
    })),
    id
  );

  res.status(201).json({
    producto_id: id,
    codigo: codigo.trim(),
    estado: "PENDIENTE"
  });
});

apiBase.get("/productos", async (req, res) => {
  const resultado = await dependencia(
    "listar_productos_rds",
    () => pool.query(
      "SELECT * FROM productos WHERE estado = 'PUBLICADO' ORDER BY codigo"
    )
  );

  const productos = [];
  for (const producto of resultado.rows) {
    const detalles = await obtenerDetalles(producto.producto_id);
    if (
      !detalles ||
      detalles.codigo !== producto.codigo ||
      !atributosValidos(detalles.atributos) ||
      detalles.estado_procesamiento !== "LISTA" ||
      !detalles.miniatura_key
    ) {
      throw new ErrorAPI(
        503, "Un producto publicado tiene detalles incompletos.",
        "combinar_catalogo", producto.producto_id
      );
    }
    productos.push(combinar(producto, detalles));
  }
  res.json(productos);
});

apiBase.get("/productos/:id", async (req, res) => {
  const producto = await obtenerProducto(req.params.id);
  const detalles = await obtenerDetalles(producto.producto_id);
  res.json(combinar(producto, detalles));
});
