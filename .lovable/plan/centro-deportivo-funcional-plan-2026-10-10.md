# Centro Deportivo Funcional — Plan

## Mejoras recomendadas (antes de empezar)

1. **Base de datos**: GitHub guarda el código, no los datos. Propongo usar Lovable Cloud como base de datos real (socios, pagos, entrenos), y sincronizar el código con GitHub. Así los datos se comparten entre el móvil del dueño y los socios.
2. **Acceso de socios solo con teléfono**: cualquiera que sepa un teléfono vería sesiones ajenas. Recomiendo teléfono + PIN de 4 dígitos (lo asigna el dueño desde la ficha del socio).
3. **Protección de datos (RGPD/LOPDGDD)**: lesiones y patologías son datos de salud (categoría especial). Añadir casilla de consentimiento expreso con fecha en la ficha, y que los socios nunca vean datos de salud ni apellidos de otros (solo nombre).
4. **Contraseña del dueño**: de momento acceso libre; la dejaré preparada para activarla en Ajustes.
5. **Vídeo de intro**: lo genero (8–10 s, ritmo alto) cuando me pases el logo; mientras tanto, intro animada provisional con botón "Saltar" y que solo se muestre una vez por sesión.
6. **Avisos de socios**: el dueño podrá aprobar/rechazar el cambio de hora y el socio verá el estado.
7. **Instalable en móvil**: icono en pantalla de inicio para el dueño.

## Pantallas

- **Intro** (vídeo) -> **Acceso**: logo, contraseña, botón Entrar, botón "¿Eres socio? Entra aquí" (teléfono+PIN).
- **Portal socio**: sus sesiones de la semana, compañeros por hora (solo nombre), solicitar cambio de hora o avisar ausencia con motivo.
- **Pestañas del dueño**: Inicio, Socios, Agenda, Entrenos, Finanzas, Estadísticas, Ajustes, Salir — con el contenido exacto descrito en tu mensaje.

## Reglas de negocio

- Lunes a viernes; sábado y domingo cerrado (editable).
- Sesiones en horas medias (ej. 9:30), aforo 6. Se puede poner a un socio en hora en punto solapando dos medias, máximo 1 por sala -> máximo 7.
- Contador: verde hasta 6/6, rojo si 7/6.
- Tarifas: 2 días 90 €, 3 días 120 €, 4 días 150 € (editables).
- Métodos de pago: Bizum, Efectivo, Tarjeta, Transferencia.
- Mínimo 20 casuísticas precargadas (lesiones, patologías, condiciones, objetivos), ampliables.
- Toda eliminación con doble confirmación (confirmar + escribir "ELIMINAR").

## Entrenos

Generador automático por bloques: calentamiento/activación, fuerza, aeróbico; WOD y Hyrox modificables; ejercicios sueltos. Registro de cargas para ver progresión e histórico de últimos 4 entrenos.

## Ajustes

Plantillas Excel descargables (socios y ejercicios), importación con vista previa antes de guardar, tarifas, aforo, días, horas, métodos de pago, categorías, copia de seguridad (exportar/importar), borrado de bases con doble seguridad.

## Diseño

Fondo oscuro, grises, blancos y verde lima; tarjetas, tipografía deportiva (no genérica), totalmente adaptado a móvil y escritorio.

## Orden de construcción

1. Base de datos + datos de ejemplo + acceso (dueño y socio).
2. Inicio, Socios (ficha completa), Agenda.
3. Entrenos, Finanzas.
4. Estadísticas, Ajustes (Excel, copias).
5. Intro con vídeo y logo cuando lo envíes.

## Detalles técnicos

- Lovable Cloud (tablas: members, schedules, sessions, payments, workouts, exercises, workout_logs, conditions, member_requests, settings) con RLS; portal socio vía función de servidor que valida teléfono+PIN y devuelve solo nombres.
- Gráficos con recharts; Excel con SheetJS (xlsx).
- Sincronización GitHub desde el menú + > GitHub.