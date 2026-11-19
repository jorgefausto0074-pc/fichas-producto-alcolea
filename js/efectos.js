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

/* ---------- Carrusel: flechas, puntos, teclado y arrastre con ratón (el táctil usa el scroll nativo) ---------- */
function carrusel(root) {
  root.querySelectorAll('.galeria').forEach((gal) => {
    const wrap = gal.closest('.gal-wrap') || gal.parentElement;
    const puntosBox = wrap.nextElementSibling?.classList.contains('gal-puntos') ? wrap.nextElementSibling : null;
    const puntos = puntosBox ? [...puntosBox.querySelectorAll('[data-gal-ir]')] : [];
    const items = [...gal.querySelectorAll('.gal-item')];
    if (items.length < 2) return;
    let actual = 0;
    const marcar = (i) => {
      actual = i;
      gal.dataset.i = String(i);
      puntos.forEach((d, k) => { d.classList.toggle('is-on', k === i); if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
    };
    let objetivo = null;
    const ir = (i) => {
      const n = Math.max(0, Math.min(items.length - 1, i));
      objetivo = n;
      const it = items[n];
      const left = Math.max(0, Math.min(gal.scrollWidth - gal.clientWidth, it.offsetLeft - gal.offsetLeft - (gal.clientWidth - it.offsetWidth) / 2));
      if (Math.abs(left - gal.scrollLeft) < 2) objetivo = null; // ya está ahí: no habrá evento scroll
      else gal.scrollTo({ left, behavior: reducido() ? 'auto' : 'smooth' });
      marcar(n);
    };
    const cercano = () => {
      const centro = gal.scrollLeft + gal.clientWidth / 2;
      let mejor = 0; let d = Infinity;
      items.forEach((it, k) => { const c = it.offsetLeft - gal.offsetLeft + it.offsetWidth / 2; if (Math.abs(c - centro) < d) { d = Math.abs(c - centro); mejor = k; } });
      return mejor;
    };
    // Punto activo: el destino pedido (flechas, puntos, teclado, arrastre) o, si se desliza a mano, la foto más centrada.
    let fin = 0;
    gal.addEventListener('scroll', () => {
      clearTimeout(fin);
      fin = setTimeout(() => {
        if (arrastre) return;
        if (objetivo != null) { marcar(objetivo); objetivo = null; } else marcar(cercano());
      }, 140);
    }, { passive: true });
    wrap.querySelectorAll('[data-gal-mover]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); ir(actual + Number(b.dataset.galMover)); }));
    puntos.forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); ir(Number(b.dataset.galIr)); }));
    gal.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); ir(actual + 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(actual - 1); }
    });
    // Arrastre con ratón: el scroll nativo solo responde al táctil.
    let arrastre = null;
    let bloquearClic = false;
    gal.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      arrastre = { x: e.clientX, left: gal.scrollLeft, movido: false, id: e.pointerId };
    });
    gal.addEventListener('pointermove', (e) => {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      const dx = e.clientX - arrastre.x;
      if (!arrastre.movido && Math.abs(dx) < 6) return;
      if (!arrastre.movido) { arrastre.movido = true; gal.setPointerCapture(e.pointerId); gal.classList.add('is-arrastre'); }
      gal.scrollLeft = arrastre.left - dx;
    });
    const soltar = (e) => {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      const { movido, x } = arrastre;
      arrastre = null;
      gal.classList.remove('is-arrastre');
      if (!movido) return; // clic sin arrastrar: abre el visor como siempre
      bloquearClic = true;
      setTimeout(() => { bloquearClic = false; }, 0);
      const dx = e.clientX - x;
      const base = cercano();
      ir(Math.abs(dx) > 50 && base === actual ? actual + (dx < 0 ? 1 : -1) : base);
    };
    gal.addEventListener('pointerup', soltar);
    gal.addEventListener('pointercancel', soltar);
    gal.addEventListener('click', (e) => { if (bloquearClic) { e.stopPropagation(); e.preventDefault(); bloquearClic = false; } }, true);
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
