import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

export async function sendNotifTecnico(
  cuadrillaId: string,
  tipo: string,
  titulo: string,
  mensaje: string,
): Promise<void> {
  if (!cuadrillaId) return;
  await adminDb()
    .collection("notificaciones_tecnico")
    .doc(cuadrillaId)
    .collection("items")
    .add({
      tipo,
      titulo,
      mensaje,
      leido: false,
      creadoAt: FieldValue.serverTimestamp(),
    });
}
