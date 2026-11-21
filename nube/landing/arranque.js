// Clases de arranque de la landing (antes eran dos <script> en línea; viven acá para que la CSP no tenga que permitir scripts en línea).
document.documentElement.classList.add('m-enter');
setTimeout(() => document.documentElement.classList.add('m-enter-done'), 700);
document.documentElement.classList.add('mo-js');
setTimeout(() => document.documentElement.classList.add('mo-safe'), 2500);
