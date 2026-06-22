"use client";

import { useEffect, useCallback } from "react";

export default function ParticlesBackground() {
  const initParticles = useCallback(() => {
    const oldCanvas = document.querySelector("#particles-login canvas");
    if (oldCanvas) oldCanvas.remove();

    // @ts-ignore
    if (window.pJSDom?.length > 0) {
      // @ts-ignore
      window.pJSDom.forEach((p: any) => p.pJS.fn.vendors.destroypJS());
      // @ts-ignore
      window.pJSDom = [];
    }

    // @ts-ignore
    window.particlesJS("particles-login", {
      particles: {
        number: { value: 95, density: { enable: true, value_area: 800 } },
        color: { value: "#90aee4" },
        shape: {
          type: "circle",
          stroke: { width: 0, color: "#30518c" },
        },
        opacity: {
          value: 0.45,
          random: true,
          anim: { enable: true, speed: 0.7, opacity_min: 0.15 },
        },
        size: {
          value: 2.2,
          random: true,
          anim: { enable: true, speed: 1.2, size_min: 0.6 },
        },
        line_linked: {
          enable: true,
          distance: 145,
          color: "#4d7bc4",
          opacity: 0.25,
          width: 1,
        },
        move: {
          enable: true,
          speed: 1.1,
          random: true,
          out_mode: "bounce",
          straight: false,
        },
      },
      interactivity: {
        detect_on: "canvas",
        events: {
          onhover: { enable: true, mode: "grab" },
          onclick: { enable: true, mode: "push" },
          resize: true,
        },
        modes: {
          grab: { distance: 180, line_linked: { opacity: 0.55 } },
          push: { particles_nb: 3 },
          repulse: { distance: 150, duration: 0.4 },
        },
      },
      retina_detect: true,
    });
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js";
    script.async = true;
    document.body.appendChild(script);

    script.onload = () => initParticles();

    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
    };
  }, [initParticles]);

  return <div id="particles-login" className="absolute inset-0 z-0" />;
}
