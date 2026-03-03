# Guía de Inicio Rápido - Maia Records

¡Bienvenido! Aquí está todo lo que necesitas para comenzar a trabajar con el proyecto de Maia Records.

## 🚀 Primeros Pasos

### 1. Instalar Dependencias
```bash
npm install
```

### 2. Iniciar Servidor de Desarrollo
```bash
npm run dev
```

Esto abrirá automáticamente la página en `http://localhost:3000`

### 3. Editar Contenido
Los componentes están organizados en `src/components/`:
- **Header.tsx** - Encabezado y navegación
- **Hero.tsx** - Sección principal
- **About.tsx** - Acerca de Maia Records
- **VisionMission.tsx** - Visión y Misión
- **Services.tsx** - Servicios ofrecidos
- **Contact.tsx** - Formulario de contacto
- **Footer.tsx** - Pie de página

### 4. Agregar Imágenes
Coloca tus imágenes en la carpeta `assets/` y luego importalas en los componentes:
```tsx
import heroImage from '../assets/tu-imagen.jpg';
```

## 🎨 Personalizar Estilos

Los colores principales se definen en `src/index.css`:
```css
:root {
  --primary-dark: #0f1419;      /* Color oscuro principal */
  --accent-purple: #9333ea;      /* Color púrpura */
  --accent-light: #a855f7;       /* Color púrpura claro */
  --text-light: #e5e7eb;         /* Texto claro */
  --text-muted: #9ca3af;         /* Texto apagado */
}
```

## 📝 Cambios Comunes

### Cambiar el Tagline
En `src/components/Hero.tsx`, busca la línea del tagline:
```tsx
<p className="tagline">Desde el universo hasta tus oídos ✨</p>
```

### Agregar Redes Sociales
En `src/components/Footer.tsx`, actualiza los enlaces sociales:
```tsx
<a href="https://instagram.com/tuusuario">📱 Instagram</a>
```

### Configurar Datos de Contacto
En `src/components/Contact.tsx`, actualiza el email y teléfono:
```tsx
<a href="mailto:contacto@maiarecords.com">contacto@maiarecords.com</a>
<a href="tel:+34123456789">+34 123 456 789</a>
```

## 🚢 Preparar para Producción

### Crear Build de Producción
```bash
npm run build
```

### Vista Previa del Build
```bash
npm run preview
```

## 📁 Estructura Completa del Proyecto

```
maia-records-frontend-web/
├── src/
│   ├── components/
│   │   ├── Header.tsx + Header.css
│   │   ├── Hero.tsx + Hero.css
│   │   ├── About.tsx + About.css
│   │   ├── VisionMission.tsx + VisionMission.css
│   │   ├── Services.tsx + Services.css
│   │   ├── Contact.tsx + Contact.css
│   │   └── Footer.tsx + Footer.css
│   ├── App.tsx + App.css
│   ├── main.tsx
│   └── index.css (estilos globales)
├── assets/ (tus imágenes aquí)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## 🔧 Troubleshooting

### El servidor no inicia
Asegúrate de que el puerto 3000 no está en uso:
```bash
npm run dev -- --port 3001
```

### Los estilos no se aplican
Asegúrate de que los archivos CSS están importados correctamente en los componentes.

### Las imágenes no cargan
Verifica que:
1. La ruta relativa sea correcta
2. El archivo existe en `assets/`
3. La extensión es correcta (.jpg, .png, etc.)

## 📚 Recursos Útiles

- [Documentación de React](https://react.dev)
- [Documentación de TypeScript](https://www.typescriptlang.org/docs/)
- [Documentación de Vite](https://vitejs.dev/)
- [CSS Variables](https://developer.mozilla.org/es/docs/Web/CSS/--*)

## ✨ ¡Que disfrutes creando!

Si tienes preguntas, revisa el código comentado o consulta la documentación oficial de cada tecnología.

---

**Maia Records**: Desde el universo hasta tus oídos ✨
