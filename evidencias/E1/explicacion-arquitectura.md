# Arquitectura final y contraste con el despliegue

## Entorno local

Docker Desktop ejecuta FLOCI y el nodo Kubernetes de lomax-eks.
Los servicios AWS utilizados son emulados localmente por FLOCI.

FLOCI:
- API HTTP en localhost:4566.
- Red Docker rrhh-documentos_default.
- IP observada: 172.25.0.2.
- Almacenamiento hybrid en /app/data.
- Directorio persistente del equipo:
  C:\Users\jomel\rrhh-documentos\floci-data.

El nodo floci-eks-lomax-eks se conectó a esa red y se verificó
su acceso a FLOCI y al puerto de PostgreSQL.

## Componentes en Kubernetes

Namespace: lomax.

- Deployment frontend: una réplica, Nginx, puerto 80.
- Deployment backend: tres réplicas, Node.js/Express, puerto 3000.
- Deployment proxy: una réplica, Nginx, puerto 80.
- Services frontend, backend y proxy de tipo ClusterIP.
- ConfigMap proxy-config: configuración de Nginx.
- Secret backend-env: configuración local del backend.

El acceso de usuarios se realiza mediante:
localhost:8081 -> port-forward -> Service proxy:80.

El proxy envía:
- /api/ al Service backend:3000, retirando el prefijo /api.
- Las demás rutas al Service frontend:80.

La comunicación de la aplicación utiliza HTTP sobre TCP.
La API de Kubernetes utiliza HTTPS en localhost:6501.

## Persistencia externa a los Pods de aplicación

RDS lomax-rds:
- PostgreSQL 16, base lomax.
- Endpoint observado: 172.25.0.2:7002.
- Protocolo PostgreSQL sobre TCP.
- Tablas categorias y productos.

DynamoDB ProductoDetalles:
- Clave producto_id de tipo String.
- Atributos variables, referencias y estado de procesamiento.

S3:
- lomax-originales, prefijo originales/.
- lomax-miniaturas, prefijo miniaturas/.

Lambda lomax-miniaturas:
- Python 3.12.
- Genera miniaturas proporcionales de máximo 300 x 300.
- Registra referencia y estado en DynamoDB.

DynamoDB, S3 y Lambda se consumen mediante las API HTTP
de FLOCI en 172.25.0.2:4566.

## Flujo de registro

1. El frontend envía los datos al backend a través del proxy.
2. El backend registra el producto PENDIENTE en RDS y sus atributos
   en DynamoDB.
3. La fotografía se carga en S3 y el backend invoca Lambda
   de forma síncrona.
4. Lambda procesa la imagen y registra la referencia de la miniatura.
5. El backend verifica atributos y miniatura antes de publicar.
6. El catálogo muestra únicamente productos PUBLICADO.

## Imágenes de contenedores

ECR contiene las imágenes propias del frontend y backend.
Los manifiestos fijan sus digest.

El nodo utiliza un espejo de registro para que localhost:4566
en las referencias de imagen apunte a http://172.25.0.2:4566.

El proxy utiliza nginx:stable-alpine con la configuración montada
desde un ConfigMap.

## Contraste con las pruebas

- Se verificaron las conexiones a los servicios desde un Pod.
- Se compararon imageID de los Pods con los digest de ECR.
- Tres Pods del backend atendieron solicitudes mediante el proxy.
- Un Pod eliminado fue reemplazado por otro con un UID diferente.
- Al recrear backend y frontend, el producto TEC-EKS-001 permaneció
  publicado con los mismos datos y la misma miniatura.
- El catálogo final mostró 23 productos publicados.

FLOCI anuncia Kubernetes 1.35 para el clúster; el nodo observado
ejecuta v1.34.1+k3s1. Se conserva esta diferencia en la documentación.

Las direcciones y versiones indicadas corresponden al entorno probado.

## Comparación con el diagrama de la etapa 1

La imagen arquitectura-propuesta.png conserva el diseño inicial.
La siguiente tabla documenta los valores finales verificados.

| Elemento | Diseño inicial | Despliegue final |
|---|---|---|
| Acceso a EKS | 8080 mediante NodePort 30080 | 8081 mediante port-forward al Service proxy:80 |
| Acceso a Compose | localhost:8080 | localhost:8080 |
| PostgreSQL | Puerto 7101 | Puerto 7002 |
| Registro ECR utilizado | Puerto 5000 propuesto | localhost:4566 mediante FLOCI |
| Redes Docker | lomax-app y lomax-infra | lomax_aplicacion y rrhh-documentos_default |
| Backend | Escalamiento de una a tres réplicas | Tres réplicas Ready verificadas |
| Persistencia | Fuera de los Pods de aplicación | Datos conservados tras recrear backend y frontend |

Se mantuvo el flujo funcional: registro pendiente, atributos en DynamoDB,
original en S3, procesamiento síncrono con Lambda y publicación después
de verificar la miniatura.

Las evidencias E7 demuestran el funcionamiento del despliegue final.
