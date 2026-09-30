import sys
import tempfile
import zipfile
from pathlib import Path

raiz = Path("/proyecto")
carpeta = raiz / "imagenes" / "catalogo"

esperados = (
    [f"TEC{i:03}" for i in range(1, 8)] +
    [f"MON{i:03}" for i in range(1, 8)] +
    [f"RAT{i:03}" for i in range(1, 7)]
)

errores = []

with tempfile.TemporaryDirectory() as dependencias:
    with zipfile.ZipFile(raiz / "lambda" / "funcion.zip") as archivo:
        archivo.extractall(dependencias)

    sys.path.insert(0, dependencias)
    from PIL import Image

    for codigo in esperados:
        ruta = carpeta / f"{codigo}.png"

        try:
            if not ruta.is_file():
                raise ValueError("Falta el archivo.")

            tamano = ruta.stat().st_size
            if not 0 < tamano <= 5_000_000:
                raise ValueError("Archivo vacío o superior a 5 MB.")

            with Image.open(ruta) as imagen:
                formato = imagen.format
                imagen.verify()

            with Image.open(ruta) as imagen:
                imagen.load()
                dimensiones = imagen.size

            if formato != "PNG":
                raise ValueError(f"El contenido es {formato}, no PNG.")

            print(
                f"OK: {codigo} | PNG | "
                f"{dimensiones[0]}x{dimensiones[1]} | {tamano} bytes"
            )

        except Exception as error:
            errores.append(codigo)
            print(f"ERROR: {codigo} | {error}")

if errores:
    raise SystemExit("Corregir archivos: " + ", ".join(errores))

print("OK: 20 imágenes válidas, listas para cargar.")
