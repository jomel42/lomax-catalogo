"use strict";

const API = "/api";
const CLAVE_REGISTRO = "lomax.registroEnCurso";
const MAX_IMAGEN = 5000000;
const $ = (id) => document.getElementById(id);

let categorias = [];
let productos = [];
let registro = null;
let ocupado = false;
let urlPreview = null;
let versionCatalogo = 0;

function elemento(tag, clase, texto) {
  const nodo = document.createElement(tag);
  if (clase) nodo.className = clase;
  if (texto !== undefined) nodo.textContent = String(texto);
  return nodo;
}

function aviso(id, mensaje = "", tipo = "") {
  const nodo = $(id);
  nodo.textContent = mensaje;
  nodo.className = `aviso ${tipo}`;
  nodo.hidden = !mensaje;
}

function guardarId(id) {
  try {
    if (id) localStorage.setItem(CLAVE_REGISTRO, id);
    else localStorage.removeItem(CLAVE_REGISTRO);
  } catch {
    // La aplicación puede continuar aunque el navegador bloquee el almacenamiento.
  }
}

function leerId() {
  try {
    const id = localStorage.getItem(CLAVE_REGISTRO);
    return /^[0-9a-f-]{36}$/i.test(id || "") ? id : null;
  } catch {
    return null;
  }
}

async function api(ruta, opciones = {}) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 180000);

  try {
    const respuesta = await fetch(`${API}${ruta}`, {
      ...opciones,
      signal: control.signal,
      cache: "no-store"
    });

    const texto = await respuesta.text();
    let datos;

    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      throw new Error(`El servidor devolvió una respuesta no válida. HTTP ${respuesta.status}.`);
    }

    console.info(
      `[LOMAX] ${opciones.method || "GET"} ${API}${ruta}`,
      { http: respuesta.status, respuesta: datos }
    );

    if (!respuesta.ok) {
      const error = new Error(datos?.error || `Error HTTP ${respuesta.status}`);
      error.http = respuesta.status;
      error.paso = datos?.paso;
      error.productoId = datos?.producto_id;
      throw error;
    }

    return { datos, http: respuesta.status };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "La solicitud superó el tiempo de espera. Consulta el estado del producto antes de reintentar."
      );
    }
    if (error instanceof TypeError) {
      throw new Error("No se pudo conectar con el servidor. Comprueba la conexión y vuelve a intentar.");
    }
    throw error;
  } finally {
    clearTimeout(temporizador);
  }
}

function mensajeError(error) {
  return [
    error.http ? `HTTP ${error.http}` : "",
    error.message,
    error.paso ? `Paso: ${error.paso}` : "",
    error.productoId ? `producto_id: ${error.productoId}` : ""
  ].filter(Boolean).join("\n");
}

function precio(valor) {
  return new Intl.NumberFormat("es-BO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(valor));
}

function nombreCategoria(id) {
  return categorias.find((categoria) =>
    Number(categoria.categoria_id) === Number(id)
  )?.nombre || `Categoría ${id}`;
}

function imagenProducto(producto, clase = "") {
  const imagen = elemento("img", clase);
  imagen.src = `${API}/productos/${encodeURIComponent(producto.producto_id)}/imagen`;
  imagen.alt = producto.nombre;
  imagen.loading = "lazy";

  imagen.addEventListener("error", () => {
    imagen.replaceWith(elemento("p", "ayuda", "Imagen no disponible"));
  }, { once: true });

  return imagen;
}

function agregarAtributo(clave = "", valor = "", tipo = "texto") {
  const fila = $("plantilla-atributo").content.firstElementChild.cloneNode(true);
  const selector = fila.querySelector(".atributo-tipo");
  const entrada = fila.querySelector(".atributo-valor");

  fila.querySelector(".atributo-clave").value = clave;
  selector.value = tipo;

  function ajustarTipo() {
    entrada.type = selector.value === "numero" ? "number" : "text";
    entrada.step = "any";
    entrada.placeholder = selector.value === "booleano" ? "true o false" : "Valor";
  }

  ajustarTipo();
  entrada.value = String(valor);

  selector.addEventListener("change", () => {
    entrada.value = "";
    ajustarTipo();
  });

  fila.querySelector(".quitar-atributo").addEventListener("click", () => fila.remove());
  $("atributos").append(fila);
}

function atributosPorCategoria() {
  if (registro) return;

  const nombre = nombreCategoria($("categoria").value).toLowerCase();
  const campos = nombre.includes("monitor")
    ? [["pulgadas", "numero"], ["resolucion", "texto"], ["frecuencia_hz", "numero"]]
    : nombre.includes("rat")
      ? [["conexion", "texto"], ["dpi", "numero"], ["botones", "numero"]]
      : [["conexion", "texto"], ["distribucion", "texto"], ["tipo", "texto"]];

  $("atributos").replaceChildren();
  campos.forEach(([clave, tipo]) => agregarAtributo(clave, "", tipo));
}

function recogerAtributos() {
  const filas = [...$("atributos").querySelectorAll(".fila-atributo")];
  if (!filas.length || filas.length > 30) {
    throw new Error("Agrega entre 1 y 30 atributos.");
  }

  const resultado = Object.create(null);

  for (const fila of filas) {
    const clave = fila.querySelector(".atributo-clave").value.trim();
    const tipo = fila.querySelector(".atributo-tipo").value;
    const texto = fila.querySelector(".atributo-valor").value.trim();

    if (!clave || !texto) throw new Error("Completa el nombre y valor de cada atributo.");
    if (Object.hasOwn(resultado, clave)) {
      throw new Error(`El atributo "${clave}" está repetido.`);
    }

    let valor = texto;

    if (tipo === "numero") {
      valor = Number(texto);
      if (!Number.isFinite(valor)) throw new Error(`"${clave}" debe ser un número.`);
    }

    if (tipo === "booleano") {
      const normalizado = texto.toLowerCase();
      if (!["true", "false", "si", "sí", "no"].includes(normalizado)) {
        throw new Error(`"${clave}" debe ser true, false, sí o no.`);
      }
      valor = ["true", "si", "sí"].includes(normalizado);
    }

    resultado[clave] = valor;
  }

  return resultado;
}

function validarArchivo(archivo) {
  if (!archivo || archivo.size === 0) throw new Error("Selecciona una fotografía.");
  if (archivo.size > MAX_IMAGEN) throw new Error("La fotografía supera el límite de 5 MB.");
  if (!["image/jpeg", "image/png"].includes(archivo.type)) {
    throw new Error("Selecciona una imagen JPEG o PNG.");
  }
}

function actualizarControles() {
  const publicado = registro?.estado === "PUBLICADO";
  $("datos-producto").disabled = ocupado || Boolean(registro);
  $("datos-imagen").disabled = ocupado || publicado;
  $("guardar-producto").disabled = ocupado || publicado;
  $("guardar-producto").textContent = ocupado
    ? "Procesando…"
    : registro ? "Cargar fotografía y publicar" : "Registrar y publicar";

  $("reintentar-registro").hidden =
    !registro?.imagen_original_key || publicado;
  $("reintentar-registro").disabled = ocupado;

  $("nuevo-registro").hidden = !registro;
  $("nuevo-registro").disabled = ocupado;

  $("registro-identificador").hidden = !registro;
  $("registro-identificador").textContent = registro
    ? `producto_id: ${registro.producto_id}\nEstado: ${registro.estado}`
    : "";

  $("ver-producto-registrado").hidden = !registro;
  if (registro) {
    $("ver-producto-registrado").href = `#/detalle/${registro.producto_id}`;
  }
}

function rellenarRegistro(producto) {
  registro = producto;
  guardarId(producto.producto_id);

  for (const campo of ["codigo", "nombre", "descripcion", "precio"]) {
    $(campo).value = producto[campo] ?? "";
  }
  $("categoria").value = String(producto.categoria_id);
  $("preview-nombre").textContent = producto.nombre;
  $("atributos").replaceChildren();

  for (const [clave, valor] of Object.entries(producto.atributos || {})) {
    const tipo = typeof valor === "number" ? "numero"
      : typeof valor === "boolean" ? "booleano" : "texto";
    agregarAtributo(clave, valor, tipo);
  }

  actualizarControles();
}

async function refrescarRegistro() {
  if (!registro?.producto_id) return;
  const respuesta = await api(`/productos/${registro.producto_id}`);
  rellenarRegistro(respuesta.datos);
}

async function restaurarRegistro() {
  const id = leerId();
  if (!id) return;

  try {
    const respuesta = await api(`/productos/${id}`);
    rellenarRegistro(respuesta.datos);
    aviso(
      "estado-registro",
      `Registro recuperado del servidor: ${registro.estado}.` +
      (registro.error_procesamiento ? `\n${registro.error_procesamiento}` : ""),
      registro.estado === "PUBLICADO" ? "exito" : ""
    );
  } catch (error) {
    if (error.http === 404) {
      guardarId(null);
      registro = null;
      actualizarControles();
    }
    aviso("estado-registro", mensajeError(error), "error");
  }
}

function nuevoRegistro() {
  if (ocupado) return;
  registro = null;
  guardarId(null);
  $("form-producto").reset();
  if (urlPreview) URL.revokeObjectURL(urlPreview);
  urlPreview = null;
  $("preview-imagen").hidden = true;
  $("preview-imagen").removeAttribute("src");
  $("preview-vacio").hidden = false;
  $("preview-vacio").textContent = "La fotografía aparecerá aquí";
  $("preview-nombre").textContent = "Tu próximo producto";
  atributosPorCategoria();
  aviso("estado-registro");
  actualizarControles();
}

async function registrarProducto(evento) {
  evento.preventDefault();
  if (ocupado) return;

  ocupado = true;
  actualizarControles();
  aviso("estado-registro", "Validando información…");

  try {
    const archivo = $("imagen").files[0];
    validarArchivo(archivo);

    if (!registro) {
      const datos = {
        codigo: $("codigo").value.trim(),
        nombre: $("nombre").value.trim(),
        descripcion: $("descripcion").value.trim(),
        precio: Number($("precio").value),
        categoria_id: Number($("categoria").value),
        atributos: recogerAtributos()
      };

      if (!datos.codigo || !datos.nombre || !datos.descripcion) {
        throw new Error("Completa código, nombre y descripción.");
      }
      if (!Number.isFinite(datos.precio) || datos.precio < 0) {
        throw new Error("El precio debe ser un número no negativo.");
      }
      if (!Number.isSafeInteger(datos.categoria_id) || datos.categoria_id <= 0) {
        throw new Error("Selecciona una categoría.");
      }

      aviso("estado-registro", "Registrando el producto…");

      const respuesta = await api("/productos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos)
      });

      rellenarRegistro({ ...datos, ...respuesta.datos });
      aviso(
        "estado-registro",
        `HTTP ${respuesta.http}: producto registrado como PENDIENTE.\nCargando y procesando la fotografía…`
      );
    } else {
      aviso("estado-registro", "Cargando la fotografía para el producto pendiente…");
    }

    const formulario = new FormData();
    formulario.append("imagen", archivo);

    const respuesta = await api(`/productos/${registro.producto_id}/imagen`, {
      method: "POST",
      body: formulario
    });

    registro = { ...registro, ...respuesta.datos };
    aviso(
      "estado-registro",
      `HTTP ${respuesta.http}: producto PUBLICADO.\nLa fotografía se procesó correctamente.`,
      "exito"
    );
    actualizarControles();

    // La respuesta de publicación ya confirma el resultado.
    // La consulta adicional recupera también la clave del original.
    try { await refrescarRegistro(); } catch (error) { console.warn(error.message); }
  } catch (error) {
    if (!registro && error.productoId) {
      registro = { producto_id: error.productoId, estado: "PENDIENTE" };
      guardarId(error.productoId);
    }

    if (registro) {
      try { await refrescarRegistro(); } catch (consultaError) {
        console.warn(consultaError.message);
      }
    }

    aviso(
      "estado-registro",
      mensajeError(error) +
      (registro ? `\nRegistro: ${registro.producto_id}\nEstado consultado: ${registro.estado}` : ""),
      "error"
    );
  } finally {
    ocupado = false;
    actualizarControles();
  }
}

async function reintentarRegistro() {
  if (ocupado || !registro) return;
  ocupado = true;
  actualizarControles();
  aviso("estado-registro", "Reintentando la imagen guardada…");

  try {
    const respuesta = await api(`/productos/${registro.producto_id}/reprocesar`, {
      method: "POST"
    });
    registro = { ...registro, ...respuesta.datos };
    aviso(
      "estado-registro",
      `HTTP ${respuesta.http}: producto PUBLICADO después del reintento.`,
      "exito"
    );
  } catch (error) {
    aviso("estado-registro", mensajeError(error), "error");
  } finally {
    try { await refrescarRegistro(); } catch (error) { console.warn(error.message); }
    ocupado = false;
    actualizarControles();
  }
}

function dibujarCatalogo() {
  const busqueda = $("buscar").value.trim().toLowerCase();
  const categoria = $("filtro-categoria").value;

  const visibles = productos.filter((producto) =>
    (!categoria || String(producto.categoria_id) === categoria) &&
    `${producto.nombre} ${producto.codigo}`.toLowerCase().includes(busqueda)
  );

  $("catalogo-grid").replaceChildren();

  for (const producto of visibles) {
    const tarjeta = elemento("a", "tarjeta");
    tarjeta.href = `#/detalle/${producto.producto_id}`;

    const foto = elemento("div", "tarjeta-imagen");
    foto.append(imagenProducto(producto));

    const cuerpo = elemento("div", "tarjeta-cuerpo");
    cuerpo.append(
      elemento("span", "categoria-texto", nombreCategoria(producto.categoria_id)),
      elemento("h2", "", producto.nombre),
      elemento("p", "precio", precio(producto.precio)),
      elemento("p", "codigo-texto", producto.codigo),
      elemento("span", "enlace", "Ver detalle")
    );

    tarjeta.append(foto, cuerpo);
    $("catalogo-grid").append(tarjeta);
  }

  $("conteo-catalogo").textContent =
    `${visibles.length} de ${productos.length} productos publicados`;
  $("catalogo-vacio").hidden = visibles.length > 0;
}

async function cargarCatalogo() {
  const version = ++versionCatalogo;
  $("conteo-catalogo").textContent = "Consultando catálogo…";
  $("actualizar-catalogo").disabled = true;
  aviso("aviso-global");

  try {
    const respuesta = await api("/productos");
    if (version !== versionCatalogo) return;

    if (!Array.isArray(respuesta.datos)) throw new Error("El catálogo tiene un formato inesperado.");
    productos = respuesta.datos.filter((producto) => producto.estado === "PUBLICADO");
    dibujarCatalogo();
  } catch (error) {
    if (version !== versionCatalogo) return;
    productos = [];
    $("catalogo-grid").replaceChildren();
    $("catalogo-vacio").hidden = true;
    $("conteo-catalogo").textContent = "No se pudo consultar el catálogo";
    aviso("aviso-global", mensajeError(error), "error");
  } finally {
    if (version === versionCatalogo) $("actualizar-catalogo").disabled = false;
  }
}

async function cargarDetalle(id) {
  const hashSolicitado = location.hash;
  $("detalle-contenido").replaceChildren(elemento("p", "ayuda", "Consultando producto…"));

  try {
    const { datos: producto } = await api(`/productos/${encodeURIComponent(id)}`);
    if (location.hash !== hashSolicitado) return;

    const panel = elemento("div", "panel");
    const grid = elemento("div", "detalle-grid");
    const foto = elemento("div", "detalle-imagen");

    if (producto.estado === "PUBLICADO" && producto.miniatura_key) {
      foto.append(imagenProducto(producto));
    } else {
      foto.append(elemento("p", "ayuda", "Fotografía pendiente de publicación"));
    }

    const informacion = elemento("div");
    informacion.append(
      elemento("p", "etiqueta", nombreCategoria(producto.categoria_id)),
      elemento("span",
        producto.estado === "PUBLICADO" ? "insignia" : "insignia pendiente",
        producto.estado),
      elemento("h1", "", producto.nombre),
      elemento("p", "codigo-texto", `Código: ${producto.codigo}`),
      elemento("p", "precio", precio(producto.precio)),
      elemento("p", "descripcion", producto.descripcion),
      elemento("div", "identificador", `producto_id: ${producto.producto_id}`)
    );

    const tabla = elemento("table", "tabla-atributos");
    const cuerpo = elemento("tbody");

    for (const [clave, valor] of Object.entries(producto.atributos || {})) {
      const fila = elemento("tr");
      const titulo = elemento("th", "", clave.replaceAll("_", " "));
      titulo.scope = "row";
      const texto = typeof valor === "boolean" ? (valor ? "Sí" : "No") : valor;
      fila.append(titulo, elemento("td", "", texto));
      cuerpo.append(fila);
    }

    tabla.append(cuerpo);
    informacion.append(elemento("h2", "", "Características"), tabla);

    if (producto.error_procesamiento) {
      informacion.append(elemento("p", "aviso error", producto.error_procesamiento));
    }

    if (producto.estado !== "PUBLICADO") {
      const completar = elemento("button", "boton primario", "Completar publicación");
      completar.type = "button";
      completar.addEventListener("click", () => {
        guardarId(producto.producto_id);
        location.hash = "#/registro";
      });
      informacion.append(completar);
    }

    grid.append(foto, informacion);
    panel.append(grid);
    $("detalle-contenido").replaceChildren(panel);
  } catch (error) {
    if (location.hash !== hashSolicitado) return;
    $("detalle-contenido").replaceChildren(
      elemento("div", "aviso error", mensajeError(error))
    );
  }
}

async function navegar() {
  aviso("aviso-global");
  const ruta = location.hash || "#/catalogo";
  const detalle = ruta.match(/^#\/detalle\/([^/]+)$/);
  const esRegistro = ruta === "#/registro";

  $("vista-catalogo").hidden = esRegistro || Boolean(detalle);
  $("vista-registro").hidden = !esRegistro;
  $("vista-detalle").hidden = !detalle;

  $("nav-catalogo").classList.toggle("activo", !esRegistro);
  $("nav-registro").classList.toggle("activo", esRegistro);

  if (detalle) await cargarDetalle(detalle[1]);
  else if (esRegistro) {
    if (!ocupado) await restaurarRegistro();
  } else {
    await cargarCatalogo();
  }
}

async function iniciar() {
  $("form-producto").addEventListener("submit", registrarProducto);
  $("agregar-atributo").addEventListener("click", () => agregarAtributo());
  $("categoria").addEventListener("change", atributosPorCategoria);
  $("nuevo-registro").addEventListener("click", nuevoRegistro);
  $("reintentar-registro").addEventListener("click", reintentarRegistro);
  $("buscar").addEventListener("input", dibujarCatalogo);
  $("filtro-categoria").addEventListener("change", dibujarCatalogo);
  $("actualizar-catalogo").addEventListener("click", cargarCatalogo);

  $("nombre").addEventListener("input", () => {
    $("preview-nombre").textContent = $("nombre").value || "Tu próximo producto";
  });

  $("imagen").addEventListener("change", () => {
    if (urlPreview) URL.revokeObjectURL(urlPreview);
    urlPreview = null;
    $("preview-imagen").hidden = true;
    $("preview-vacio").hidden = false;
    $("preview-vacio").textContent = "La fotografía aparecerá aquí";

    try {
      const archivo = $("imagen").files[0];
      if (!archivo) return;
      validarArchivo(archivo);
      urlPreview = URL.createObjectURL(archivo);

      $("preview-imagen").onload = () => {
        $("preview-imagen").hidden = false;
        $("preview-vacio").hidden = true;
      };
      $("preview-imagen").onerror = () => {
        $("preview-vacio").textContent = "No se pudo mostrar la imagen";
      };
      $("preview-imagen").src = urlPreview;
    } catch (error) {
      aviso("estado-registro", mensajeError(error), "error");
    }
  });

  atributosPorCategoria();
  actualizarControles();

  try {
    const respuesta = await api("/categorias");
    if (!Array.isArray(respuesta.datos)) throw new Error("Las categorías tienen un formato inesperado.");
    categorias = respuesta.datos;

    for (const categoria of categorias) {
      for (const id of ["categoria", "filtro-categoria"]) {
        const opcion = elemento("option", "", categoria.nombre);
        opcion.value = String(categoria.categoria_id);
        $(id).append(opcion);
      }
    }
  } catch (error) {
    aviso("aviso-global", mensajeError(error), "error");
    return;
  }

  window.addEventListener("hashchange", navegar);
  await navegar();
}

iniciar().catch((error) => aviso("aviso-global", mensajeError(error), "error"));
