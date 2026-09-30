"""Ejecutar dentro de public.ecr.aws/lambda/python:3.12, montando lambda en /trabajo."""
import importlib.util
import pathlib
import py_compile
import shutil
import subprocess
import sys
import tempfile
import zipfile

base = pathlib.Path(__file__).resolve().parent
salida = base / 'funcion.zip'
with tempfile.TemporaryDirectory(prefix='lomax-build-') as tmp:
    destino = pathlib.Path(tmp)
    subprocess.run([
        sys.executable, '-m', 'pip', 'install',
        '--disable-pip-version-check', '--root-user-action=ignore',
        '--only-binary=:all:', '--no-compile',
        '-r', str(base / 'requirements.txt'), '--target', str(destino)
    ], check=True)
    shutil.copy2(base / 'lambda_function.py', destino / 'lambda_function.py')
    py_compile.compile(str(destino / 'lambda_function.py'), doraise=True)
    sys.path.insert(0, str(destino))
    from PIL import Image
    from lambda_function import crear_miniatura
    import io
    original = io.BytesIO()
    Image.new('RGB', (1200, 800), 'navy').save(original, format='JPEG')
    miniatura, dimensiones, tamano = crear_miniatura(original.getvalue())
    assert dimensiones == (1200, 800) and tamano == (300, 200)
    assert Image.open(io.BytesIO(miniatura)).size == (300, 200)
    print('OK: Pillow funciona en Linux y genera 1200x800 -> 300x200.', flush=True)
    with zipfile.ZipFile(salida, 'w', zipfile.ZIP_DEFLATED) as archivo:
        for ruta in sorted(destino.rglob('*')):
            if ruta.is_file() and '__pycache__' not in ruta.parts:
                archivo.write(ruta, ruta.relative_to(destino))
    with zipfile.ZipFile(salida) as archivo:
        if archivo.testzip() is not None:
            raise RuntimeError('ZIP de despliegue corrupto.')
        assert 'lambda_function.py' in archivo.namelist()
        assert any(n.startswith('PIL/') for n in archivo.namelist())
print(f'ZIP CREADO: {salida} ({salida.stat().st_size} bytes)', flush=True)
