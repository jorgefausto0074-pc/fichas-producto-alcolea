// Efectos visuales de la ficha (rediseño 19/11/2026). Solo transform/opacity, sin librerías.
// Con «reducir movimiento» no se anima nada: todo se muestra en su estado final.
const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const raiz = document.documentElement;

/* ---------- Portada: se encoge al bajar y aparece la barra fija ---------- */
let pendiente = false;
function alturaTop() {
  const t = document.querySelector('.topbar');
  raiz.style.setProperty('--top-h', `${t ? Math.round(t.getBoundingClientRect().height) : 0}px`);
}
function portada() {
  if (pendiente) return;
  pendiente = true;
  requestAnimationFrame(() => {
    pendiente = false;
    const cover = document.querySelector('.portada');
    const mini = document.querySelector('.ficha-mini');
    if (!cover || !mini) return;
    const top = cover.getBoundingClientRect().top - (parseFloat(raiz.style.getPropertyValue('--top-h')) || 0);
    const p = Math.min(1, Math.max(0, -top / ((cover.offsetHeight || 1) * 0.8)));
    cover.style.setProperty('--p', reducido() ? '0' : p.toFixed(3));
    mini.classList.toggle('is-on', p > 0.8);
  });
}
addEventListener('scroll', portada, { passive: true });
addEventListener('resize', () => { alturaTop(); portada(); });

/* ---------- Carrusel: punto activo ---------- */
function carrusel(root) {
  root.querySelectorAll('.galeria').forEach((gal) => {
    const puntos = gal.nextElementSibling?.classList.contains('gal-puntos') ? [...gal.nextElementSibling.children] : null;
    if (!puntos) return;
    const items = [...gal.querySelectorAll('.gal-item')];
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.intersectionRatio > 0.6) {
        const i = items.indexOf(e.target);
        puntos.forEach((d, k) => d.classList.toggle('is-on', k === i));
      }
    }, { root: gal, threshold: [0.6] });
    items.forEach((it) => io.observe(it));
  });
}

/* ---------- Secciones y barras al aparecer ---------- */
function decimales(t) { const m = String(t).match(/[.,](\d+)/); return m ? m[1].length : 0; }
function contar(b) {
  const final = b.textContent;
  const v = parseFloat(final.replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(v) || reducido()) return;
  const dec = decimales(final);
  const coma = final.includes(',');
  const desde = v * 0.85;
  const t0 = performance.now();
  const paso = (t) => {
    if (!b.isConnected) return;
    const k = Math.min(1, (t - t0) / 800);
    const e = 1 - (1 - k) ** 3;
    // siempre termina en el texto exacto del PDF
    b.textContent = k >= 1 ? final : (desde + (v - desde) * e).toFixed(dec).replace('.', coma ? ',' : '.');
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}
let ioVer;
function aparecer(root) {
  const anima = !reducido() && 'IntersectionObserver' in window;
  const items = root.querySelectorAll('.sec, .rango');
  if (!anima) { items.forEach((el) => el.classList.add('is-in')); return; }
  ioVer ||= new IntersectionObserver((es) => {
    for (const e of es) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      ioVer.unobserve(el);
      el.classList.add('is-in');
      if (el.classList.contains('rango')) el.closest('.gauge')?.querySelectorAll('[data-cifra]').forEach(contar);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.05 });
  raiz.classList.add('fx');
  items.forEach((el) => ioVer.observe(el));
}

/** Se llama tras cada renderVista. */
export function activarEfectos(root) {
  alturaTop();
  carrusel(root);
  aparecer(root);
  portada();
}

/* ---------- Transición tarjeta → ficha ---------- */
function fotoDestino() {
  return document.querySelector('.portada-img') || document.querySelector('.pantalla .gal-item img');
}
/**
 * Ejecuta `navegar` (que pinta la ficha de forma síncrona) con la miniatura «volando» a la foto de la ficha.
 * View Transitions si existe (Chrome/WebView 111+); si no, animación FLIP; con reducir movimiento, sin animar.
 */
export function transicionTarjeta(enlace, navegar) {
  const img = enlace.querySelector('.thumb img');
  if (!img || reducido()) { navegar(); return; }
  if (document.startViewTransition) {
    img.style.viewTransitionName = 'foto-ficha';
    let destino = null;
    const vt = document.startViewTransition(() => {
      img.style.viewTransitionName = '';
      navegar();
      scrollTo(0, 0);
      destino = fotoDestino();
      if (destino) destino.style.viewTransitionName = 'foto-ficha';
    });
    vt.finished.finally(() => { if (destino) destino.style.viewTransitionName = ''; });
    return;
  }
  const r0 = img.getBoundingClientRect();
  navegar();
  scrollTo(0, 0);
  const d = fotoDestino();
  if (!d || !d.animate) return;
  const r1 = d.getBoundingClientRect();
  if (!r1.width || !r1.height) return;
  d.animate([
    { transformOrigin: '0 0', transform: `translate(${r0.left - r1.left}px, ${r0.top - r1.top}px) scale(${r0.width / r1.width}, ${r0.height / r1.height})` },
    { transformOrigin: '0 0', transform: 'none' },
  ], { duration: 480, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
