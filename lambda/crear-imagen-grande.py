import os
import sys
import tempfile
import zipfile
from pathlib import Path

raiz = Path("/proyecto")

with tempfile.TemporaryDirectory() as dependencias:
    with zipfile.ZipFile(raiz / "lambda" / "funcion.zip") as archivo:
        archivo.extractall(dependencias)

    sys.path.insert(0, dependencias)
    from PIL import Image

    destino = raiz / "imagenes" / "MON003-excede-limite.png"
    imagen = Image.frombytes("RGB", (2000, 1000), os.urandom(2000 * 1000 * 3))
    imagen.save(destino, "PNG", compress_level=0)

    with Image.open(destino) as comprobacion:
        comprobacion.verify()

    tamaño = destino.stat().st_size
    if tamaño <= 5_000_000:
        raise RuntimeError("El archivo no supera el límite.")

    print("Formato: PNG válido")
    print("Dimensiones: 2000 x 1000")
    print(f"Tamaño: {tamaño} bytes")
    print("Límite configurado: 5000000 bytes")
    print("OK: imagen válida que supera el límite.")
