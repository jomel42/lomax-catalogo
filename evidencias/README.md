# Portafolio de evidencias técnicas — LOMAX

## E1 — Arquitectura
Diagrama con iconos oficiales AWS, componentes locales, redes,
protocolos, puertos y ubicación de los componentes en Kubernetes.
Explicación del flujo y comparación con los recursos desplegados.

## E2 — Persistencia
RDS PostgreSQL y DynamoDB creados y cargados.
Pruebas de restricciones, correspondencia de identificadores,
carga repetible y comparación de datos después de reiniciar persistencia.

## E3 — S3 y Lambda
Creación de buckets, invocaciones y resultados funcionales.
Original 1200 x 800 convertido en miniatura 300 x 200.
Referencias de DynamoDB y descarga de objetos desde S3.
Repetición sin duplicados, archivo inválido, límite de tamaño y reintento.

## E4 — Backend
Reporte-E4.txt reúne las pruebas de los endpoints.
Incluye respuestas HTTP, consultas a los servicios, errores,
reprocesamiento y comparación SHA256 entre API y S3.

## E5 — Frontend
Registro desde el formulario, catálogo y detalle.
Validaciones de código duplicado e imagen inválida.
Verificación en RDS, DynamoDB y S3.
Publicación de los productos del catálogo.

## E6 — ECR
Repositorios, autenticación, construcción, push y pull.
Digest y commit de las imágenes.
Ejecución de las imágenes descargadas y conectividad del registro.

## E7 — EKS
Clúster, Pods, servicios y conexiones desde Kubernetes.
Imágenes ejecutadas comparadas con los digest de ECR.
Escalamiento de una a tres réplicas y solicitudes por Pod.
Eliminación de un Pod y reemplazo con otro UID.
Registro de TEC-EKS-001 desde la aplicación en EKS.
Persistencia en RDS, DynamoDB y S3 después de recrear los Pods.

### Evidencias principales de E7
- conexiones-desde-pod.txt
- verificacion-tres-pods.txt
- logs-solicitudes-tres-pods.txt
- verificacion-autorecuperacion.txt
- verificacion-producto-eks-antes.txt
- verificacion-recreacion.txt
- catalogo-tras-recrear.txt
- persistencia-tras-recrear.txt
- comparacion-imagenes-ecr-pods.txt

## Lectura de los resultados
Las evidencias corresponden a momentos distintos del desarrollo.
El catálogo pasó de 22 a 23 productos publicados al registrar
TEC-EKS-001. Esta diferencia es esperada.

Conservar las evidencias originales y adjuntar las capturas del navegador
en la carpeta de la etapa correspondiente.
