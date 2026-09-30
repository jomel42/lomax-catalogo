BEGIN;

CREATE TABLE IF NOT EXISTS categorias (
    categoria_id INTEGER PRIMARY KEY,
    nombre VARCHAR(80) NOT NULL UNIQUE,
    CONSTRAINT ck_categoria_nombre
        CHECK (btrim(nombre) <> '')
);

CREATE TABLE IF NOT EXISTS productos (
    producto_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT NOT NULL,
    precio NUMERIC(12,2) NOT NULL,
    categoria_id INTEGER NOT NULL,
    fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado VARCHAR(15) NOT NULL DEFAULT 'PENDIENTE',

    CONSTRAINT uq_productos_codigo UNIQUE (codigo),

    CONSTRAINT ck_productos_codigo
        CHECK (btrim(codigo) <> ''),

    CONSTRAINT ck_productos_nombre
        CHECK (btrim(nombre) <> ''),

    CONSTRAINT ck_productos_descripcion
        CHECK (btrim(descripcion) <> ''),

    CONSTRAINT ck_productos_precio
        CHECK (precio >= 0 AND precio <> 'NaN'::numeric),

    CONSTRAINT fk_productos_categoria
        FOREIGN KEY (categoria_id)
        REFERENCES categorias(categoria_id),

    CONSTRAINT ck_productos_estado
        CHECK (estado IN ('PENDIENTE', 'PUBLICADO'))
);

COMMIT;
