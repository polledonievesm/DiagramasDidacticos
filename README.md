# Migración de «Diagrama con etiquetas»

Esta carpeta prepara la aplicación para ejecutarse localmente con recarga instantánea y publicarse en GitHub Pages. Las actividades, las imágenes que suba el maestro y los resultados se guardan en una hoja privada de Google mediante Apps Script.

## 1. Configurar Google Sheets y Apps Script

1. En [script.google.com](https://script.google.com/) crea un proyecto y reemplaza el contenido de `Code.gs` por `apps-script/Code.gs`.
2. En el editor, ejecuta `setupMigration` una sola vez y acepta los permisos. En el registro de ejecución aparecerán el enlace privado de la hoja y la clave inicial del maestro. Guarda la clave.
3. En **Implementar → Nueva implementación → Aplicación web**, selecciona **Ejecutar como: yo** y el acceso que permita a tus alumnos abrir el juego. Implementa y copia la URL que termina en `/exec`.
4. Pega esa URL en `public/config.js`, en `window.GAS_WEB_APP_URL`. Ese archivo contiene sólo la dirección pública del servicio; no agregues contraseñas ni datos de alumnos.

La hoja de cálculo sigue siendo privada. Las imágenes que el maestro agregue se guardan en una carpeta de Drive y se habilita su visualización mediante enlace para que aparezcan en el juego.

## 2. Ver el sitio mientras se programa

Desde esta carpeta ejecuta:

```bash
npm install
npm run dev
```

Abre la dirección local que indique Vite (normalmente `http://localhost:5173`). Los cambios en la interfaz aparecen al guardar los archivos; no hace falta actualizar Apps Script para cada ajuste visual.

## 3. Publicar

Sube **el contenido de esta carpeta** a un repositorio de GitHub, en la rama `main`. En ese repositorio abre **Settings → Pages** y elige **GitHub Actions** como origen. El flujo incluido compila y publica cada vez que se actualiza `main`. La URL de alumnos tendrá el formato `https://USUARIO.github.io/REPOSITORIO/`.

No subas la hoja de resultados, contraseñas ni datos personales al repositorio. El PIN del maestro se configura en las propiedades privadas del proyecto de Apps Script.

## Funciones incluidas

- El juego se llama **Diagrama con etiquetas** y mantiene la instrucción: “Arrastra y suelta las chinchetas en su lugar correcto de la imagen.”
- El maestro puede subir primero la imagen, agregar hasta diez etiquetas de colores, arrastrar cada control de ubicación sobre la imagen y guardar los cambios cuando vuelva al panel.
- Puede configurar cuenta regresiva o cronómetro, y permitir de 1 a 10 intentos o intentos ilimitados.
- El alumno captura apellido paterno, apellido materno y nombre(s). Al terminar ve sus aciertos, calificación, tiempo, intentos restantes y la opción de volver a jugar cuando aún tenga intentos.
- Hay una tabla de posiciones para un máximo de 35 alumnos, ordenada por aciertos y luego por menor tiempo. Muestra el nombre y apellido paterno; los primeros siete lugares tienen distintivos y los siguientes muestran su número.
- Incluye sonidos, aleatorización de etiquetas, líneas sobre la imagen, registro de resultados en Sheets y descarga CSV para el maestro.
- Las actividades se guardan en Sheets y las imágenes en Drive; el sitio estático se publica en GitHub Pages.

## Nota para probar

Este ZIP contiene los cambios recientes de la aplicación, pero todavía debes configurar e implementar Apps Script y publicar el proyecto en tu cuenta de GitHub antes de compartir un nuevo enlace. La configuración `public/config.js` requiere la URL `/exec` de tu implementación. Conserva publicada la versión de ChatGPT Sites mientras pruebas la migración.

Los intentos y la tabla de posiciones se guardan en la hoja privada. La tabla pública muestra el nombre y apellido paterno solicitados. No publiques la hoja ni agregues datos personales al repositorio.
