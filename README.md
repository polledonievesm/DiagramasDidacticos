# Aula en juego

Plataforma educativa publicada en GitHub Pages. Las actividades, imágenes y resultados usan la hoja privada de Google y el proyecto de Apps Script existentes.

- Sitio: https://polledonievesm.github.io/DiagramasDidacticos/
- Repositorio: https://github.com/polledonievesm/DiagramasDidacticos

## Desarrollo local

Requiere Node.js 22 o posterior.

```bash
npm install
npm run dev
```

Vite muestra la dirección local. Los cambios de interfaz aparecen al guardar archivos. Para verificar antes de publicar:

```bash
npm run build
```

GitHub Actions ejecuta la compilación y publica los cambios que llegan a `main`.

## Datos y Apps Script

El proyecto conserva la hoja de cálculo y el despliegue de Apps Script ya conectados. **No vuelvas a ejecutar `setupMigration` ni crees otra hoja.** La URL del servicio se configura en `public/config.js`; no agregues contraseñas, PIN del maestro ni datos de estudiantes al repositorio.

Cuando un cambio de la plataforma incluya `apps-script/Code.gs`, copia su contenido al proyecto de Apps Script existente y crea una nueva versión desde **Implementar → Administrar implementaciones → Editar → Nueva versión → Implementar**. La URL `/exec` debe seguir siendo la misma. Los cambios de interfaz por sí solos no requieren actualizar Apps Script.

Las eliminaciones del panel son archivos lógicos: ocultan una actividad y bloquean su enlace, pero conservan sus participaciones en la hoja de resultados.

## Estado de plantillas

Operativas y conectadas al guardado actual:

- **Diagrama con etiquetas**: imagen, puntos, hasta diez etiquetas, tiempo, intentos, clasificación y resultados.
- **Une su pareja**: texto e imágenes en cada lado, contenido de parejas, opciones de juego y resultados.

En preparación; aún no deben usarse con alumnos:

- Cuestionario
- Clasificar en grupos
- Ordenar secuencias
- Completar oraciones
- Ordenar palabras
- Tarjetas
- Ruleta
- Memorama
- Sopa de letras

El registro compartido de plantillas describe qué contenido y opciones admite cada juego. La conversión automática solo se ofrecerá cuando el juego de destino ya pueda editar, jugar y guardar ese contenido.

## Almacenamiento

Apps Script conserva las actividades y los resultados en la hoja existente, además de cuentas y resultados históricos. Drive guarda las imágenes que suba el maestro. No publiques la hoja ni exportes datos personales al repositorio.
