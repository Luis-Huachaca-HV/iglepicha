// Sin dependencias de Node (nada de "crypto" acá) — seguro de importar
// tanto desde componentes de cliente como desde rutas de servidor.
export function esPinHashValido(valor: string | null | undefined): valor is string {
  return !!valor && valor.includes(":") && valor.split(":").length === 2;
}
