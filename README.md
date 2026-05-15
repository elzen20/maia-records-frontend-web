# 🎧 Maia Records - Web Frontend

Página web profesional para Maia Records, un estudio de grabación especializado en autenticidad sonora y calidad profesional.

## 🚀 Características

- **Diseño Moderno**: Interfaz atractiva y responsive con gradientes y animaciones suaves
- **Componentes React**: Estructura modular con TypeScript
- **Optimizado**: Construido con Vite para máxima velocidad
- **Mobile-Friendly**: Completamente responsivo para todos los dispositivos
- **Animaciones**: Efectos visuales profesionales y pulidos
- **Dashboard Admin**: Login protegido para cuantizar tracks (single y batch)

## 📋 Requisitos

- Node.js (v14 o superior)
- npm o yarn

## 🛠️ Instalación

1. Clona el repositorio:
```bash
git clone <repository-url>
cd maia-records-frontend-web
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura variables de entorno:
```bash
cp .env.example .env.local
```

Define al menos:

- `VITE_QUANTIZE_API_BASE_URL`
- `VITE_ADMIN_EMAILS` (correos separados por coma)

## 🏃 Desarrollo

Para iniciar el servidor de desarrollo:

```bash
npm run dev
```

La aplicación se abrirá automáticamente en `http://localhost:3000`

Rutas admin:

- `/admin/login`
- `/admin/quantize`

## 🏗️ Construcción

Para crear la compilación de producción:

```bash
npm run build
```

Los archivos compilados estarán en la carpeta `dist/`

## 👁️ Vista Previa

Para previsualizar la compilación de producción:

```bash
npm run preview
```

## 📁 Estructura del Proyecto

```
maia-records-frontend-web/
├── src/
│   ├── components/           # Componentes React
│   │   ├── Header.tsx
│   │   ├── Hero.tsx
│   │   ├── About.tsx
│   │   ├── VisionMission.tsx
│   │   ├── Services.tsx
│   │   ├── Contact.tsx
│   │   └── Footer.tsx
│   ├── App.tsx              # Componente principal
│   ├── App.css              # Estilos de App
│   ├── main.tsx             # Punto de entrada
│   └── index.css            # Estilos globales
├── assets/                  # Imágenes y recursos
├── index.html               # HTML principal
├── vite.config.ts           # Configuración de Vite
├── tsconfig.json            # Configuración de TypeScript
└── package.json             # Dependencias del proyecto
```

## 🎨 Personalización

### Variables CSS
Puedes modificar los colores principales en `src/index.css`:

```css
:root {
  --primary-dark: #0f1419;
  --primary-light: #1a1f2a;
  --accent-purple: #9333ea;
  --accent-light: #a855f7;
  --text-light: #e5e7eb;
  --text-muted: #9ca3af;
  --border-color: #374151;
}
```

### Contenido
Edita el contenido en los componentes correspondientes en la carpeta `src/components/`

## 📞 Contacto

Para configurar el formulario de contacto, actualiza los datos de contacto en [Contact.tsx](src/components/Contact.tsx)

## 📄 Licencia

Todos los derechos reservados © 2026 Maia Records

---

**Tagline**: Desde el universo hasta tus oídos ✨
