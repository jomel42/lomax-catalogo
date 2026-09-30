BEGIN;

INSERT INTO categorias (categoria_id, nombre)
VALUES
    (1, 'Teclados'),
    (2, 'Monitores'),
    (3, 'Ratones')
ON CONFLICT (categoria_id) DO NOTHING;

INSERT INTO productos
    (codigo, nombre, descripcion, precio, categoria_id)
VALUES
    ('TEC001', 'Teclado mecanico RGB',
     'Teclado mecanico con iluminacion RGB.', 350.00, 1),

    ('TEC002', 'Teclado de oficina',
     'Teclado de membrana para trabajo diario.', 85.00, 1),

    ('TEC003', 'Teclado inalambrico',
     'Teclado compacto con conexion inalambrica.', 160.00, 1),

    ('TEC004', 'Teclado compacto 60',
     'Teclado mecanico de formato reducido.', 290.00, 1),

    ('TEC005', 'Teclado ergonomico',
     'Teclado con diseno ergonomico para oficina.', 240.00, 1),

    ('TEC006', 'Teclado retroiluminado',
     'Teclado con iluminacion blanca.', 180.00, 1),

    ('TEC007', 'Teclado Bluetooth',
     'Teclado Bluetooth para varios dispositivos.', 210.00, 1),

    ('MON001', 'Monitor Full HD 24',
     'Monitor de 24 pulgadas para uso general.', 950.00, 2),

    ('MON002', 'Monitor Full HD 27',
     'Monitor de 27 pulgadas para oficina.', 1250.00, 2),

    ('MON003', 'Monitor QHD 27',
     'Monitor de 27 pulgadas con resolucion QHD.', 1800.00, 2),

    ('MON004', 'Monitor 4K 32',
     'Monitor de 32 pulgadas con resolucion 4K.', 3200.00, 2),

    ('MON005', 'Monitor gamer 24',
     'Monitor de 24 pulgadas y alta frecuencia.', 1450.00, 2),

    ('MON006', 'Monitor ultrawide 34',
     'Monitor panoramico de 34 pulgadas.', 3600.00, 2),

    ('MON007', 'Monitor portatil 15',
     'Monitor portatil de 15.6 pulgadas.', 1100.00, 2),

    ('RAT001', 'Raton optico USB',
     'Raton optico con conexion USB.', 45.00, 3),

    ('RAT002', 'Raton inalambrico',
     'Raton con receptor USB inalambrico.', 90.00, 3),

    ('RAT003', 'Raton gamer RGB',
     'Raton gamer con sensibilidad ajustable.', 180.00, 3),

    ('RAT004', 'Raton ergonomico vertical',
     'Raton vertical para trabajo de oficina.', 150.00, 3),

    ('RAT005', 'Raton Bluetooth',
     'Raton Bluetooth para equipos portatiles.', 120.00, 3),

    ('RAT006', 'Raton gamer ligero',
     'Raton ligero con sensor de alta precision.', 250.00, 3)
ON CONFLICT (codigo) DO NOTHING;

COMMIT;
