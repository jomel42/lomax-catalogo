import { apiImagenes } from "./api-imagenes.js";
import express from "express";
import { config } from "./servicios.js";
import { apiBase, ErrorAPI } from "./api-base.js";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "128kb" }));
app.use(apiBase);
app.use(apiImagenes);

app.use((req, res) => {
  res.status(404).json({
    error: "Ruta no encontrada.",
    paso: "enrutamiento"
  });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  let status = 500;
  let mensaje = "Error interno del servidor.";
  let paso = "interno";

  if (error instanceof ErrorAPI) {
    status = error.status;
    mensaje = error.message;
    paso = error.paso;
  } else if (error.type === "entity.parse.failed") {
    status = 400;
    mensaje = "El cuerpo no contiene JSON válido.";
    paso = "leer_json";
  } else if (error.type === "entity.too.large") {
    status = 413;
    mensaje = "El cuerpo de la solicitud supera el límite permitido.";
    paso = "leer_solicitud";
  } else {
    console.error(error);
  }

  res.status(status).json({
    error: mensaje,
    paso,
    ...(error.productoId ? { producto_id: error.productoId } : {})
  });
});

app.listen(config.puerto, "0.0.0.0", () => {
  console.log(`API Lomax disponible en http://localhost:${config.puerto}`);
});
