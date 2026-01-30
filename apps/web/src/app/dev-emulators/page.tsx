"use client";

import { auth } from "@/lib/firebaseClient";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getIdToken } from "firebase/auth";

export default function DevEmulatorsPage() {
  async function createUser() {
    await createUserWithEmailAndPassword(auth, "admin@test.com", "123456");
    alert("Usuario creado en Auth Emulator");
  }

  async function login() {
    await signInWithEmailAndPassword(auth, "admin@test.com", "123456");
    alert("Login OK (Auth Emulator)");
  }

  async function bootstrapAdmin() {
    const user = auth.currentUser;
    if (!user) return alert("Primero haz login");

    const token = await getIdToken(user, true);

    const res = await fetch("http://127.0.0.1:5001/redes-5bb81/us-central1/bootstrapAdmin", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    console.log("bootstrapAdmin", res.status, data);
    alert(`bootstrapAdmin: ${res.status} ${JSON.stringify(data)}`);
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1>Dev Emulators</h1>
      <button onClick={createUser}>1) Crear usuario (Auth Emulator)</button>
      <button onClick={login}>2) Login (Auth Emulator)</button>
      <button onClick={bootstrapAdmin}>3) Bootstrap Admin (Functions Emulator)</button>
      <p>Revisa Emulator UI: http://127.0.0.1:4000</p>
    </div>
  );
}
