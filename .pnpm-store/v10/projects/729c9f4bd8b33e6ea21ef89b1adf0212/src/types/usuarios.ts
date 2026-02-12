export type TipoDoc = "DNI" | "CE";

export type Genero = "M" | "F" | "OTRO" | "NO_ESPECIFICA";

export type EstadoPerfil = "ACTIVO" | "INACTIVO";

export type UsuarioPerfil = {
  uid: string;

  nombres: string;
  apellidos: string;
  displayName: string;

  tipoDoc: TipoDoc;
  nroDoc: string;

  celular: string;
  direccion: string;

  email: string;

  genero: Genero;
  nacionalidad: string;

  fIngreso: string; // YYYY-MM-DD (en UI/DTO). En Firestore guardaremos Timestamp.
  fNacimiento: string; // YYYY-MM-DD

  estadoPerfil: EstadoPerfil;

  // recomendados
  sede?: string;
  cargo?: string;
  cuadrillaId?: string;
  supervisorUid?: string;

  audit?: any;
};
