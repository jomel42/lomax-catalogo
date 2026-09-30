# Organización y seguimiento del trabajo

## Integrante

- Nombre: Jomel Dario Siñani Orellana.
- GitHub: https://github.com/jomel42
- Repositorio: https://github.com/jomel42/lomax-catalogo
- Modalidad: trabajo individual.

Todas las etapas fueron realizadas por el mismo integrante, quien
asumió las funciones de análisis, diseño, desarrollo, pruebas,
despliegue y documentación.

## Tablero de seguimiento por etapa

| Etapa | Rol asumido | Trabajo realizado | Entregable | Estado | Evidencia |
|---|---|---|---|---|---|
| 1. Arquitectura | Analista y diseñador | Diseñar los componentes y flujos; contrastar el diseño con el despliegue final. | P2: diagrama de arquitectura | Terminado y verificado | evidencias/E1 y docs/arquitectura-final.md |
| 2. Persistencia | Responsable de bases de datos | Crear RDS y DynamoDB, cargar productos, probar restricciones, correspondencia de identificadores y persistencia. | P3: RDS y DynamoDB | Terminado y verificado | sql/, scripts/ y evidencias/E2 |
| 3. S3 y Lambda | Desarrollador de procesamiento de imágenes | Implementar miniaturas, validar formatos y tamaño, comprobar referencias, repetición y reintentos. | P4: S3 y Lambda | Terminado y verificado | lambda/ y evidencias/E3 |
| 4. Backend | Desarrollador de API | Implementar endpoints, validaciones, publicación, reprocesamiento y Dockerfile; comprobar respuestas y servicios. | P5: API y endpoints | Terminado y verificado | backend/ y evidencias/E4 |
| 5. Frontend | Desarrollador de interfaz | Implementar registro, catálogo y detalle; integrar proxy y Compose; verificar publicación y errores. | P6: frontend | Terminado y verificado | frontend/, proxy/, compose.yaml y evidencias/E5 |
| 6. ECR | Responsable de imágenes | Construir, etiquetar, publicar, descargar y ejecutar imágenes vinculadas con commits. | P7: imágenes en ECR | Terminado y verificado | compose.ecr.yaml y evidencias/E6 |
| 7. EKS | Responsable de despliegue y pruebas | Desplegar la aplicación, escalar a tres réplicas, verificar solicitudes por Pod, autorrecuperación y persistencia. | P8: EKS | Terminado y verificado | kubernetes/ y evidencias/E7 |
| Portafolio | Responsable de documentación | Organizar README, código, scripts, configuración de ejemplo, diagramas y evidencias. | P9: portafolio técnico | Terminado y publicado | README.md, docs/ y evidencias/ |

Responsable de todas las filas: Jomel Dario Siñani Orellana (@jomel42).

Este tablero consolida el estado final del trabajo individual.
Los estados verificados se respaldan en las evidencias del repositorio;
no representan una calificación o aprobación del docente.

## Aportes verificables mediante commits

### Implementación de la aplicación

Commit: b6d8f2eaf3886f20bab3f22ab6fd86b389706a35

https://github.com/jomel42/lomax-catalogo/commit/b6d8f2eaf3886f20bab3f22ab6fd86b389706a35

Contenido: backend, frontend, proxy, Dockerfiles e integración mediante
Docker Compose. Relacionado principalmente con las etapas 4 y 5
y utilizado para las imágenes publicadas en la etapa 6.

### Identificación de réplicas y logs HTTP

Commit: fed44f02aa0cfae740487e98e281d3e5fe473330

https://github.com/jomel42/lomax-catalogo/commit/fed44f02aa0cfae740487e98e281d3e5fe473330

Contenido: cabecera X-Pod-Name y logs de solicitudes en el backend.
Permitió comprobar que las tres réplicas atendían solicitudes
durante la etapa 7.

### Integración del portafolio técnico

Commit: 619faaa2d58ae3f8e0b9a4d1c16236c408d578cf

https://github.com/jomel42/lomax-catalogo/commit/619faaa2d58ae3f8e0b9a4d1c16236c408d578cf

Contenido: documentación, scripts, SQL, función Lambda, manifiestos,
diagramas y evidencias organizadas por etapas E1 a E7.

Este commit reúne archivos elaborados durante varias etapas;
no corresponde a una única tarea de implementación.

## Resultados comprobados

- Restricciones SQL y carga inicial sin duplicados.
- Relación de productos entre RDS y DynamoDB.
- Procesamiento de JPEG y PNG, límite de tamaño y miniaturas proporcionales.
- Manejo de errores y recuperación mediante reintentos.
- Registro y publicación desde la interfaz.
- Imágenes ejecutadas en Kubernetes coincidentes con los digest de ECR.
- Tres réplicas del backend atendiendo solicitudes.
- Reemplazo de un Pod eliminado por otro con diferente UID.
- Persistencia de datos y miniatura después de recrear los Pods.
- Catálogo final con 23 productos publicados.

## Flujo completo de la solución

El usuario accede al frontend mediante el proxy. Al registrar un
producto, el backend guarda los datos principales en RDS y los
atributos en DynamoDB, manteniendo el estado PENDIENTE.

La fotografía se almacena en S3 y Lambda genera su miniatura.
El backend verifica el procesamiento, los atributos y el objeto
generado antes de cambiar el producto a PUBLICADO.

El catálogo combina datos de RDS y DynamoDB. La imagen se recupera
desde S3 mediante la API. Kubernetes mantiene las réplicas de la
aplicación y la persistencia permanece fuera de sus Pods.

## Entregable P10

Repositorio de GitHub:

https://github.com/jomel42/lomax-catalogo

Para la defensa se pueden revisar los commits, archivos y evidencias
indicados, y demostrar el funcionamiento de la aplicación.
