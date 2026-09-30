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

    pruebas = [
        ("TEC001-original.jpg", (1200, 800)),
        ("TEC001-miniatura.png", (300, 200)),
    ]

    for nombre, esperado in pruebas:
        with Image.open(raiz / "descargas" / nombre) as imagen:
            imagen.load()
            print(f"{nombre}: {imagen.format}, {imagen.width} x {imagen.height}")
            if imagen.size != esperado:
                raise RuntimeError(f"Dimensiones incorrectas: se esperaba {esperado}")

    print("OK: original 1200 x 800 y miniatura proporcional 300 x 200.")
