# Bibliotecas de terceros servidas desde el sitio

Se bajaron una sola vez de las mismas direcciones que usaba `nube/index.html` (16/11/2026) y no se modificaron.
Servirlas desde el sitio evita depender de un CDN externo sin integridad (SRI) y permite una CSP con `script-src 'self'`.

| Archivo | Versión | Origen | SHA-256 | Licencia |
|---|---|---|---|---|
| gsap.min.js | GSAP 3.12.5 | https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js | 28033e449a31ebcc396e5be8b13b63152bf03094288fb5867034321927bce087 | GreenSock Standard License (https://gsap.com/standard-license), uso sin cargo |
| ScrollTrigger.min.js | ScrollTrigger (GSAP) 3.12.5 | https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js | ad33c2df9ada8a663c2147357828f980d0b7ca731ef33eb3c6e4f327c3b2cda5 | GreenSock Standard License (https://gsap.com/standard-license), uso sin cargo |
| lenis.min.js | Lenis 1.1.13 | https://unpkg.com/lenis@1.1.13/dist/lenis.min.js | b2958f142f832f0d5e547cdef77e6fadfce16bea60982fc8bbf50395a2439df8 | MIT (https://github.com/darkroomengineering/lenis/blob/main/LICENSE) |

Para actualizar: bajar la versión nueva de la misma fuente, anotar acá versión y SHA-256, y probar la landing en Edge.
