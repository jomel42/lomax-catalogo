BEGIN;

SELECT COUNT(*) AS productos_antes FROM productos;

CREATE TEMP TABLE resultados_pruebas (
    prueba TEXT,
    resultado TEXT,
    detalle TEXT
) ON COMMIT DROP;

-- Prueba 1: datos validos.
INSERT INTO productos
    (codigo, nombre, descripcion, precio, categoria_id)
VALUES
    ('PRUEBA-VALIDA', 'Producto de prueba',
     'Registro temporal para comprobar las restricciones.', 100.00, 1);

INSERT INTO resultados_pruebas
VALUES (
    'Insercion valida',
    'OK',
    'Producto aceptado dentro de la transaccion.'
);

DO $$
DECLARE
    cantidad_antes INTEGER;
    restriccion TEXT;
BEGIN
    SELECT COUNT(*) INTO cantidad_antes FROM productos;

    -- Prueba 2: codigo duplicado.
    BEGIN
        INSERT INTO productos
            (codigo, nombre, descripcion, precio, categoria_id)
        VALUES
            ('TEC001', 'Duplicado', 'Prueba de codigo repetido.', 100.00, 1);

        RAISE EXCEPTION 'FALLO: se acepto un codigo duplicado.';

    EXCEPTION WHEN unique_violation THEN
        GET STACKED DIAGNOSTICS restriccion = CONSTRAINT_NAME;

        IF restriccion <> 'uq_productos_codigo' THEN
            RAISE;
        END IF;

        INSERT INTO resultados_pruebas
        VALUES ('Codigo duplicado', 'OK: rechazado', SQLSTATE || ' | ' || SQLERRM);
    END;

    -- Prueba 3: precio negativo.
    BEGIN
        INSERT INTO productos
            (codigo, nombre, descripcion, precio, categoria_id)
        VALUES
            ('PRUEBA-NEGATIVO', 'Precio invalido',
             'Prueba de precio negativo.', -10.00, 1);

        RAISE EXCEPTION 'FALLO: se acepto un precio negativo.';

    EXCEPTION WHEN check_violation THEN
        GET STACKED DIAGNOSTICS restriccion = CONSTRAINT_NAME;

        IF restriccion <> 'ck_productos_precio' THEN
            RAISE;
        END IF;

        INSERT INTO resultados_pruebas
        VALUES ('Precio negativo', 'OK: rechazado', SQLSTATE || ' | ' || SQLERRM);
    END;

    -- Prueba 4: categoria inexistente.
    BEGIN
        INSERT INTO productos
            (codigo, nombre, descripcion, precio, categoria_id)
        VALUES
            ('PRUEBA-CATEGORIA', 'Categoria invalida',
             'Prueba de categoria inexistente.', 100.00, 999999);

        RAISE EXCEPTION 'FALLO: se acepto una categoria inexistente.';

    EXCEPTION WHEN foreign_key_violation THEN
        GET STACKED DIAGNOSTICS restriccion = CONSTRAINT_NAME;

        IF restriccion <> 'fk_productos_categoria' THEN
            RAISE;
        END IF;

        INSERT INTO resultados_pruebas
        VALUES ('Categoria inexistente', 'OK: rechazada', SQLSTATE || ' | ' || SQLERRM);
    END;

    -- Ninguna insercion rechazada debe aumentar la cantidad.
    IF (SELECT COUNT(*) FROM productos) <> cantidad_antes THEN
        RAISE EXCEPTION 'FALLO: las pruebas invalidas dejaron registros.';
    END IF;

    IF EXISTS (
        SELECT 1 FROM productos
        WHERE codigo IN ('PRUEBA-NEGATIVO', 'PRUEBA-CATEGORIA')
    ) THEN
        RAISE EXCEPTION 'FALLO: quedaron productos invalidos.';
    END IF;

    INSERT INTO resultados_pruebas
    VALUES (
        'Ausencia de registros parciales',
        'OK',
        'Las inserciones rechazadas no agregaron productos.'
    );
END $$;

SELECT * FROM resultados_pruebas;

SELECT codigo, estado
FROM productos
WHERE codigo = 'PRUEBA-VALIDA';

-- Retirar el registro valido de prueba.
ROLLBACK;

SELECT COUNT(*) AS productos_despues FROM productos;

SELECT COUNT(*) AS registros_de_prueba_restantes
FROM productos
WHERE codigo IN (
    'PRUEBA-VALIDA',
    'PRUEBA-NEGATIVO',
    'PRUEBA-CATEGORIA'
);
