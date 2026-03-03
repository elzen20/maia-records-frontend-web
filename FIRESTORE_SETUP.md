# Configuración de Firestore

## Pasos para habilitar Firestore y las reglas de seguridad

### 1. Habilitar Firestore en Firebase Console

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Selecciona tu proyecto **maia-records-web**
3. En el menú lateral, haz clic en **Firestore Database**
4. Haz clic en **"Create database"**
5. Selecciona **"Start in production mode"**
6. Elige la ubicación más cercana (recomendado: `us-central1` o `southamerica-east1` para México)
7. Haz clic en **"Enable"**

### 2. Configurar Reglas de Seguridad

Una vez creada la base de datos:

1. Ve a la pestaña **"Rules"** en Firestore
2. Reemplaza el contenido con las reglas del archivo `firestore.rules`
3. Haz clic en **"Publish"**

Alternativamente, puedes desplegar las reglas desde la terminal:

```bash
firebase deploy --only firestore:rules
```

### 3. Verificar la colección

Los mensajes de contacto se guardarán automáticamente en la colección `contacts` con esta estructura:

```javascript
{
  name: "Nombre del usuario",
  email: "email@ejemplo.com",
  phone: "+52 1 123 456 7890",
  message: "Mensaje del usuario...",
  timestamp: Timestamp,
  status: "new"
}
```

### 4. Ver los mensajes recibidos

1. Ve a **Firestore Database** en Firebase Console
2. Verás la colección `contacts`
3. Haz clic para ver todos los mensajes recibidos

### 5. (Opcional) Configurar Cloud Functions para recibir emails

Si quieres recibir un email cada vez que alguien envía un mensaje:

1. Instala Firebase Functions:
   ```bash
   firebase init functions
   ```

2. Sigue las instrucciones en el archivo `CLOUD_FUNCTIONS.md`

---

## Reglas de Seguridad Explicadas

Las reglas actuales permiten:
- ✅ **Crear** documentos en `contacts` (cualquier usuario puede enviar un mensaje)
- ❌ **Leer** documentos (solo tú puedes verlos desde Firebase Console)
- ❌ **Actualizar** o **Eliminar** (protección contra manipulación)

Esto asegura que los usuarios solo puedan enviar mensajes, pero no puedan ver los de otros ni modificarlos.
