# LOMAX — Catálogo de productos

Aplicación de catálogo desarrollada con Node.js, Express y un frontend
HTML, CSS y JavaScript. Integra servicios AWS emulados localmente con
FLOCI y se despliega mediante Docker Compose y Kubernetes.

## Funcionalidades

- Registro de productos con atributos variables.
- Carga de fotografías JPEG o PNG de hasta 5 000 000 bytes.
- Generación de miniaturas proporcionales de máximo 300 x 300 píxeles.
- Publicación únicamente después de verificar atributos y miniatura.
- Catálogo de productos publicados y vista de detalle.
- Manejo de errores y reprocesamiento de imágenes.
- Identificación del Pod que atiende cada solicitud mediante X-Pod-Name.

## Arquitectura

Usuario -> proxy Nginx -> frontend / backend.

El backend utiliza:
- RDS PostgreSQL: categorías y datos principales de productos.
- DynamoDB: atributos variables, referencias de imágenes y procesamiento.
- S3: imágenes originales y miniaturas.
- Lambda: validación y generación de miniaturas.
- ECR: almacenamiento de las imágenes del frontend y backend.

FLOCI proporciona los servicios AWS locales. Su implementación de EKS
ejecuta Kubernetes mediante k3s dentro de Docker.

La persistencia permanece fuera de los Pods de la aplicación.

## Estructura

- backend/: API, dependencias y Dockerfile.
- frontend/: interfaz y Dockerfile.
- proxy/: configuración de Nginx y Dockerfile.
- lambda/: función, dependencias y herramientas de construcción.
- sql/: esquema, carga inicial y pruebas de restricciones.
- scripts/: carga de datos y verificaciones.
- kubernetes/: manifiestos de despliegue y configuración.
- docs/diagramas/: arquitectura y modelo de datos.
- evidencias/E1/ a evidencias/E7/: resultados y capturas por etapa.
- compose.yaml: despliegue local mediante Docker Compose.
- compose.ecr.yaml: selección de las imágenes publicadas para Compose.
- compose.env: variables de Compose.

## Requisitos

- Windows PowerShell.
- Docker Desktop con contenedores Linux.
- AWS CLI v2.
- Git.
- kubectl.
- Node.js 22 y npm para desarrollo local.
- FLOCI en ejecución con almacenamiento persistente.

## Recursos utilizados

| Recurso | Nombre |
|---|---|
| RDS | lomax-rds |
| Base PostgreSQL | lomax |
| Tabla DynamoDB | ProductoDetalles |
| Bucket de originales | lomax-originales |
| Bucket de miniaturas | lomax-miniaturas |
| Lambda | lomax-miniaturas |
| Repositorio ECR frontend | lomax-frontend |
| Repositorio ECR backend | lomax-backend |
| Clúster EKS local | lomax-eks |
| Namespace Kubernetes | lomax |

## Direcciones del entorno verificado

| Uso | Dirección |
|---|---|
| Servicios AWS locales | http://localhost:4566 |
| Aplicación en Docker Compose | http://localhost:8080 |
| Aplicación en Kubernetes mediante port-forward | http://localhost:8081 |
| API de Kubernetes | https://localhost:6501 |
| PostgreSQL desde Windows | localhost:7002 |
| FLOCI desde los Pods | http://172.25.0.2:4566 |
| PostgreSQL desde los Pods | 172.25.0.2:7002 |

Red Docker utilizada: rrhh-documentos_default.

Las direcciones IP y los puertos corresponden al entorno de entrega.
En otro equipo deben comprobarse y ajustarse.

## Configuración del backend

Crear backend/.env a partir de backend/.env.example y completar los valores:

    Copy-Item .\backend\.env.example .\backend\.env

No ejecutar esta copia sobre un archivo .env ya configurado.

Las credenciales de kubectl corresponden al usuario IAM local
lomax-kubernetes y se configuran por separado en la terminal.

## Ejecución mediante Docker Compose

Con los recursos de FLOCI ya creados y cargados:

    docker compose --env-file .\compose.env up -d --build

Abrir http://localhost:8080.

Para usar las imágenes de ECR de la etapa 6, primero descargarlas
y después ejecutar:

    docker compose --env-file .\compose.env -f .\compose.yaml -f .\compose.ecr.yaml up -d --no-build

El archivo compose.ecr.yaml conserva las versiones verificadas en E6.
El backend de Kubernetes utiliza la versión posterior con logs de E7.

## Despliegue de la aplicación en Kubernetes

Requiere el clúster lomax-eks activo, kubeconfig configurado,
acceso del nodo a FLOCI y el espejo de ECR operativo.

    kubectl apply -f .\kubernetes\00-namespace.yaml

Crear el Secret a partir del archivo local del backend:

    kubectl -n lomax create secret generic backend-env --from-env-file=.\backend\.env

Aplicar los manifiestos:

    kubectl apply -f .\kubernetes\01-backend.yaml
    kubectl apply -f .\kubernetes\02-frontend.yaml
    kubectl apply -f .\kubernetes\03-proxy-config.yaml
    kubectl apply -f .\kubernetes\04-proxy.yaml

Los valores PGHOST, PGPORT y FLOCI_ENDPOINT del Deployment
adaptan la conexión al entorno Kubernetes.

Comprobar disponibilidad:

    kubectl -n lomax get deployments
    kubectl -n lomax get pods -o wide

Abrir el acceso mediante el proxy:

    kubectl -n lomax port-forward service/proxy 8081:80

Mantener esa terminal abierta y entrar a http://localhost:8081.

## Versiones desplegadas en EKS

Frontend:
- Etiqueta: entrega-b6d8f2e
- Commit: b6d8f2eaf3886f20bab3f22ab6fd86b389706a35
- Digest: sha256:eb4c16da43e67d3bde1dbcfd499f079ec5d629c1015c0c268d28fb64c354ca79

Backend:
- Etiqueta: entrega-fed44f0
- Commit: fed44f02aa0cfae740487e98e281d3e5fe473330
- Digest: sha256:1becee91d2366e8508e31ec958b7050b2c51849e3926ad24b273e617c62dbb23

Los manifiestos fijan las imágenes mediante digest.

FLOCI informa versión 1.35 para el clúster, mientras que el nodo
observado ejecuta v1.34.1+k3s1. Se documenta esta diferencia del emulador.

## Endpoints

Las rutas del backend se publican a través del proxy con prefijo /api.

| Método | Ruta del backend | Función |
|---|---|---|
| GET | /categorias | Consultar categorías |
| POST | /productos | Registrar producto pendiente |
| POST | /productos/{id}/imagen | Cargar imagen y publicar |
| POST | /productos/{id}/reprocesar | Reintentar procesamiento |
| GET | /productos | Consultar productos publicados |
| GET | /productos/{id} | Consultar detalle y estado |
| GET | /productos/{id}/imagen | Descargar miniatura |

El registro recibe JSON con codigo, nombre, descripcion, precio,
categoria_id y atributos.

La carga de imagen recibe multipart/form-data con el campo imagen.

Errores: 400 entrada inválida, 404 recurso inexistente, 409 conflicto,
413 tamaño excesivo, 415 formato no permitido y 502/503 fallo
de procesamiento o dependencia. Las respuestas indican el paso fallido.

## Validaciones realizadas

- Restricciones SQL e inserciones inválidas sin registros parciales.
- Carga inicial repetible sin duplicar productos.
- Correspondencia de identificadores entre RDS y DynamoDB.
- Persistencia después de reiniciar los componentes de almacenamiento.
- Miniaturas proporcionales e invocaciones repetidas sin objetos extra.
- Rechazo de archivos inválidos y mayores al límite.
- Recuperación mediante reprocesamiento.
- Comparación SHA256 de archivos obtenidos desde API y S3.
- Registro y consultas desde el frontend.
- Publicación y descarga de imágenes en ECR.
- Escalamiento del backend de una a tres réplicas.
- Solicitudes atendidas por los tres Pods.
- Sustitución de un Pod eliminado y comparación de UID.
- Persistencia del producto registrado desde EKS al recrear los Pods.

Al finalizar E7 se observaron 23 productos publicados en el catálogo.

Producto de persistencia E7:
- Código: TEC-EKS-001
- ID: e3b95f7c-037e-4bfc-8f62-df80c0909f3b

## Evidencias

- E1: arquitectura y explicación de componentes.
- E2: RDS, DynamoDB, restricciones y persistencia.
- E3: S3, Lambda, miniaturas, errores y reintentos.
- E4: API, respuestas HTTP y pruebas.
- E5: frontend, registro, catálogo y validaciones.
- E6: autenticación, push, pull y verificación de imágenes.
- E7: Pods, imágenes ECR, escalamiento, recuperación y persistencia.

## Información excluida del repositorio

No publicar archivos .env con credenciales, claves IAM, kubeconfig,
node_modules ni paquetes de construcción regenerables.

El portafolio incluye configuraciones de ejemplo; los valores reales
deben configurarse en el entorno local.
