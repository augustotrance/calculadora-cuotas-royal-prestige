# Calculadora de cuotas de Royal Prestige

Calculadora mínima para el teléfono con dos modos:

- **Solo saldo** (seleccionado al abrir): ingresá el saldo a financiar y elegí entre 2 y 24 cuotas.
- **Completo**: ingresá el precio total y el adelanto; se muestra automáticamente el saldo pendiente y se calcula la cuota sobre ese saldo. Un adelanto vacío cuenta como cero. No se permite un adelanto mayor al precio total. Si el adelanto cubre todo el precio, se muestra que no queda saldo para financiar.

Los dos modos conservan sus importes mientras cambiás de uno a otro y comparten la cantidad de cuotas elegida, los porcentajes oficiales y el redondeo al peso.

Se publica con acceso libre en Cloudflare Workers; no requiere iniciar sesión en ChatGPT, GitHub ni Google para usarla. El repositorio puede seguir privado.

## Publicar desde GitHub

1. Entrá a [Cloudflare](https://dash.cloudflare.com/) y creá una cuenta o iniciá sesión como administrador.
2. Abrí **Workers & Pages → Create application → GitHub**.
3. Autorizá la integración para este repositorio y seleccioná **augustotrance/calculadora-cuotas-royal-prestige**.
4. Usá estos valores:

   | Campo | Valor |
   | --- | --- |
   | Nombre del Worker / proyecto | `calculadora-cuotas-royal-prestige` |
   | Rama de producción | `main` |
   | Directorio raíz | `/` (raíz del repositorio) |
   | Build command | `npm run check` |
   | Deploy command | `npx wrangler deploy` |

5. Seleccioná **Save and Deploy**. La configuración de `wrangler.jsonc` incluye los archivos de la pantalla y el endpoint que lee Google Sheets. No hay que crear bases de datos ni configurar secretos.
6. Cloudflare mostrará el enlace público `workers.dev`. Ese es el enlace para usar desde el teléfono y compartir con los clientes. No habilites Cloudflare Access en ese dominio si querés mantener el acceso libre.

La conexión con GitHub vuelve a publicar los cambios del código automáticamente. Los cambios de porcentajes en la planilla **no requieren una nueva publicación**.

Documentación: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) y [configuración de compilación](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

## Única fuente autorizada

[Planilla oficial de Drive](https://docs.google.com/spreadsheets/d/12OZfGSeKwJu0jwaCznipZB7mSBGBx7-A6b87kWlrsPs/edit?usp=drive_link).

El servidor consulta la pestaña **Table 2**, columnas **Cuotas** y **Porcentaje**. La planilla debe conservar lectura para cualquier persona con el enlace, sin iniciar sesión. Para actualizar los coeficientes, modificá esos valores dentro de esta misma planilla y conservá una fila para cada cantidad de cuotas de 2 a 24, sin duplicados. Mantené la escala actual: por ejemplo, `8.00` representa `8,00 %`.

La aplicación consulta al abrir, al volver a la pantalla y cada 60 segundos mientras está visible. Google puede demorar en reflejar cambios en su exportación. Las respuestas de la aplicación no se guardan en caché. Si la lectura falla o la tabla está incompleta, se oculta el resultado hasta recuperar los datos oficiales: no hay otra fuente ni tabla de respaldo.

## Cálculo

`Valor de cada cuota = saldo a financiar × coeficiente oficial / 100`.

El coeficiente ya corresponde a **cada cuota**, incluyendo la financiación. No se vuelve a dividir por la cantidad de cuotas ni se suma como recargo. El resultado se redondea al peso más cercano, con medio peso hacia arriba, como en la planilla original. El cálculo usa centavos enteros y `BigInt` para evitar errores de punto flotante.

`tests/fixtures/september-reference.json` conserva una referencia histórica exclusivamente para pruebas. No se incluye dentro de los archivos públicos ni se utiliza para cotizar.

## Desarrollo y verificación

Requiere Node.js 22.13 o superior.

```sh
npm ci
npm run check
npm run dev
```

`npm run build` valida el paquete del Worker sin publicarlo. Para publicar manualmente desde tu computadora podés usar `npx wrangler login` y `npm run deploy`; no hace falta usar la terminal si conectás GitHub desde Cloudflare.

La aplicación no necesita claves de API ni variables de entorno. La fuente autorizada está fijada en `src/official-source.js`.

## Acceso desde el móvil

Abrí el enlace público de Cloudflare en el navegador. Podés guardarlo con **Agregar a pantalla de inicio** desde el menú del navegador (Android) o **Compartir → Agregar a Inicio** en Safari (iPhone). Necesita conexión a Internet para leer la planilla oficial.
