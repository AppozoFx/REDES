"use client";

import { auth } from "@/lib/firebaseClient";

export default function DevCreateUserPage() {
  const createUser = async () => {
    const user = auth.currentUser;
    if (!user) {
      alert("No hay usuario logueado");
      return;
    }

    const idToken = await user.getIdToken();

    const payload = {
      email: "tech1@test.com",
      password: "123456",
      nombres: "Tecnico",
      apellidos: "Uno",
      dni_ce: "12345678",
      celular: "999999999",
      direccion: "Lima",
      genero: "M",
      nacionalidad: "PE",
      rol: "TECNICO",
      area: "INSTALACIONES",
      roles: ["TECNICO"],
      areas: ["INSTALACIONES"],
      estado: "ACTIVO",
      estadoAcceso: "HABILITADO",
    };

    const url = "http://127.0.0.1:5001/redes-5bb81/us-central1/usersCreate";

    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await resp.json().catch(() => ({}));

    alert(`usersCreate: ${resp.status} ${JSON.stringify(data)}`);
  };

  return (
    <div style={{ padding: 16 }}>
      <h1>Dev Create User</h1>
      <p>Debe estar logueado como ADMIN en Auth Emulator.</p>
      <button onClick={createUser} style={{ padding: 12, border: "1px solid #ccc" }}>
        Crear usuario (usersCreate)
      </button>
    </div>
  );
}
