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

Vite muestra la dirección local. Los cambios de interfaz aparecen al guardar archivos. Verifica con:

```bash
npm run build
```

GitHub Actions compila y publica los cambios que llegan a `main`.

## Datos y Apps Script

El proyecto conserva la hoja de cálculo y el despliegue de Apps Script existentes. **No vuelvas a ejecutar `setupMigration` ni crees otra hoja.** La URL del servicio está en `public/config.js`; no agregues contraseñas, PIN del maestro ni datos de estudiantes al repositorio.

Para activar plantillas nuevas después de integrar cambios que modifican `apps-script/Code.gs`, copia ese archivo al proyecto de Apps Script existente y crea una nueva versión desde **Implementar → Administrar implementaciones → Editar → Nueva versión → Implementar**. Conserva la URL `/exec`. El catálogo consulta las capacidades del servicio y oculta los juegos que todavía no puede guardar.

Las eliminaciones del panel archivan las actividades. Los resultados históricos permanecen en la hoja.

## Plantillas conectadas al Apps Script de esta etapa

- **Diagrama con etiquetas**: imagen, chinchetas, hasta diez etiquetas, tiempo, intentos y calificación.
- **Une su pareja**: texto e imágenes, arrastrar o tocar para unir parejas.
- **Cuestionario**: preguntas, opciones e imágenes opcionales.
- **Clasificar en grupos**: elementos con texto o imágenes asignados a grupos.
- **Ordenar secuencias**: reordenar pasos, con controles aptos para celular.
- **Completar oraciones**: respuestas de texto e imágenes opcionales.
- **Ordenar palabras**: reorganizar palabras para construir oraciones.
- **Tarjetas**: dos caras de texto o imagen.
- **Memorama**: encontrar parejas con tarjetas.
- **Ruleta**: seleccionar retos de forma aleatoria; registra los retos marcados como completados.
- **Sopa de letras**: cuadrícula aleatoria con palabras horizontales, verticales y diagonales.

Las plantillas comparten la hoja de actividades/resultados, autenticación de alumnos, intentos y configuración de tiempo. Una actividad de parejas puede crear una copia como tarjetas o memorama cuando su contenido encaja; se conserva la actividad original.

## Publicación y datos

GitHub Pages aloja la interfaz estática. Sheets y Drive permanecen privados/configurados en el proyecto Apps Script existente. No publiques hojas de resultados, contraseñas ni datos personales.
