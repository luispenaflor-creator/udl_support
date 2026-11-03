# Primer inicio de UDL Support en Windows

## A. Preparar Supabase

1. Entra a supabase.com y crea una cuenta. Pulsa New project, ponle UDL Support, elige una contraseña para la base de datos y guárdala en un gestor de contraseñas. La app no necesita esa contraseña para el uso normal.
2. Cuando el proyecto indique que está listo, abre SQL Editor > New query. En el proyecto descomprimido, abre supabase/migrations/202610310001_initial.sql con Bloc de notas, copia todo el contenido y pégalo en el editor. Pulsa Run.
3. En Authentication > Users, selecciona Add user y crea la primera cuenta de acceso con tu correo institucional. Marca la confirmación de correo si la pantalla lo solicita.
4. Copia el UUID (ID) de ese usuario en Authentication > Users. En SQL Editor, ejecuta esta consulta reemplazando los cuatro valores entre comillas por los datos reales. El rol inicial debe ser administrador:

```sql
insert into public.profiles (id,email,full_name,role,campus)
values ('UUID_DEL_USUARIO','TU_CORREO','Tu nombre','administrador','Centro');
```

## B. Conectar la aplicación

5. En Supabase pulsa Connect y copia Project URL y la Publishable key (empieza con sb_publishable_). La clave publishable está diseñada para la app del navegador; no copies una Secret key ni una service_role key.
6. En la carpeta descomprimida, copia .env.example y renombra la copia como .env.local. Ábrela con Bloc de notas. En las líneas NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY pega los valores copiados. Guarda el archivo. No lo compartas ni lo subas a GitHub.
7. Abre Terminal dentro de esa carpeta. Una manera sencilla es abrir la carpeta en el Explorador, hacer clic derecho en un espacio vacío y elegir Abrir en Terminal. Comprueba que la ruta visible termina en la carpeta udl-support.
8. La primera vez ejecuta: npm ci
9. Al terminar ejecuta: npm run dev
10. Abre el navegador en http://localhost:3000 e inicia sesión con el correo y contraseña creados en el paso 3.

Para apagar el servidor local, vuelve a la ventana de Terminal y pulsa Ctrl+C. Para abrirlo otro día, vuelve a ejecutar npm run dev dentro de la carpeta.

Si aparece “Missing Supabase environment variables”, revisa que el archivo se llame exactamente .env.local, esté junto a package.json y tenga la URL y la clave publishable. Después de editarlo, detén y vuelve a iniciar npm run dev.

Este arranque es para probar en tu computadora. Más adelante conectamos GitHub y Vercel para publicarlo en la nube. Los módulos Gmail, Pub/Sub, push y otras funciones pendientes aún no se activan con estos pasos.
