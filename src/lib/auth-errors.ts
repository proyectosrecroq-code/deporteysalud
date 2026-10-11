// Shared between server functions and the client so the UI can recognise an expired session.
export const AUTH_ERROR_PREFIX = "No autorizado";
export const AUTH_REQUIRED = `${AUTH_ERROR_PREFIX}: inicia sesión de nuevo`;
// includes(): validation errors wrap the text ("Datos no válidos (token): No autorizado…").
export const isAuthError = (e: unknown) =>
  e instanceof Error && e.message.includes(AUTH_ERROR_PREFIX);

export const SESSION_HOURS = 12;
