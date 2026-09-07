"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const PING_MS = 60_000;
// Sin interacción por más de esto, deja de latir: una pestaña olvidada abierta
// no debe acumular horas. Coincide con el bucket de 5 min de la base.
const IDLE_MS = 5 * 60_000;

const INTERACTION_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchstart",
] as const;

/**
 * Mide el tiempo de cada usuario dentro del CRM (ver la migración
 * `user_activity_tracking` para qué significa el número y por qué se mide así).
 *
 * Late cada minuto, pero sólo si la pestaña está visible Y hubo interacción
 * hace menos de 5 minutos. Las dos condiciones son las que hacen que el dato
 * signifique "estuvo trabajando" y no "dejó el CRM abierto".
 *
 * Vive en el shell de la app, así que corre en todas las pantallas de todos los
 * roles. Es fire-and-forget: nada de la UI depende de que el latido llegue.
 */
export function ActivityTracker() {
  const pathname = usePathname();
  // La ruta se lee en el latido, no entra como dependencia del intervalo:
  // cambiar de pantalla no debe reiniciarlo (si no, navegar rápido late de más).
  // Quién la traduce a sección es el endpoint, para que a la base sólo entren
  // valores del catálogo.
  const pathRef = useRef(pathname);
  // Arranca en 0 (no en Date.now(): leer el reloj durante el render es impuro)
  // y lo pone en hora el efecto de abajo, que es el que también lo refresca.
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const touch = () => {
      lastInteractionRef.current = Date.now();
    };
    // Abrir la pantalla ya cuenta como interacción: el usuario acaba de navegar.
    touch();
    for (const ev of INTERACTION_EVENTS) {
      window.addEventListener(ev, touch, { passive: true });
    }
    return () => {
      for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, touch);
    };
  }, []);

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastInteractionRef.current > IDLE_MS) return;
      void fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: pathRef.current }),
        keepalive: true,
      }).catch(() => {
        // El tiempo es telemetría: si el latido no llega, no pasa nada.
      });
    };

    // Abrir el CRM ya cuenta: la navegación misma es la interacción.
    ping();
    const id = setInterval(ping, PING_MS);

    // Volver a la pestaña cuenta como interacción y late enseguida, para no
    // perder el minuto de arranque esperando el próximo tick.
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      lastInteractionRef.current = Date.now();
      ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
