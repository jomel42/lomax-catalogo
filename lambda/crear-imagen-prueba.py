import sys
import tempfile
import zipfile
from pathlib import Path

raiz = Path("/proyecto")

with tempfile.TemporaryDirectory() as dependencias:
    with zipfile.ZipFile(raiz / "lambda" / "funcion.zip") as archivo:
        archivo.extractall(dependencias)

    sys.path.insert(0, dependencias)

    from PIL import Image, ImageDraw

    imagen = Image.new("RGB", (1200, 800), "#e8eef5")
    dibujo = ImageDraw.Draw(imagen)
    dibujo.rectangle((100, 200, 1100, 600), fill="#243b53")
    dibujo.text((450, 380), "LOMAX - PRUEBA E3", fill="white")

    destino = raiz / "imagenes" / "TEC001-prueba.jpg"
    imagen.save(destino, "JPEG", quality=90)

    with Image.open(destino) as comprobacion:
        print(f"Archivo: {destino.name}")
        print(f"Formato: {comprobacion.format}")
        print(f"Dimensiones: {comprobacion.width} x {comprobacion.height}")
        print(f"Bytes: {destino.stat().st_size}")
