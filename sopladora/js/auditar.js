// Comprobaciones de las fichas y de la calculadora. No lee el disco: sirve en Node y en el navegador.

import {
  aCentesimasNumero,
  calcularNuevo,
  fichasPlanas,
  mediasCalculadas,
  prepararFicha,
  repartoMayorResto,
  textoACentesimas,
} from './calculo.js';

function repartoAcumulado(medios, total) {
  const suma = medios.reduce((a, b) => a + b, 0);
  let acum = 0;
  let prev = 0;
  const out = [];
  for (const m of medios) {
    acum += m;
    const cur = Math.floor((2 * total * acum + suma) / (2 * suma));
    out.push(cur - prev);
    prev = cur;
  }
  return out;
}

function repartoBig(partes, total) {
  const suma = partes.reduce((a, b) => a + BigInt(b), 0n);
  const objetivo = BigInt(total);
  const base = partes.map((p) => Number((objetivo * BigInt(p)) / suma));
  let resto = total - base.reduce((a, b) => a + b, 0);
  const orden = partes.map((p, i) => ({
    i,
    frac: Number((objetivo * BigInt(p)) % suma),
    peso: p,
  }));
  orden.sort((a, b) => b.frac - a.frac || b.peso - a.peso || a.i - b.i);
  for (let k = 0; k < resto; k += 1) base[orden[k].i] += 1;
  return base;
}

function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function auditarDocumento(doc) {
  const pruebas = [];
  const fallos = [];
  const hallazgos = [];
  const chk = (nombre, ok, detalle = '') => {
    pruebas.push({ prueba: nombre, ok: Boolean(ok) });
    if (!ok) fallos.push(`${nombre}${detalle ? ` (${detalle})` : ''}`);
  };

  const planas = fichasPlanas(doc);
  chk('14 fichas', planas.length === 14, String(planas.length));
  chk('13 botellas', doc.botellas.length === 13, String(doc.botellas.length));
  chk('Ninguna ficha Freeway añadida', planas.every((p) => !/freeway/i.test(p.ficha.ficha_codigo)));

  const invertidas = [];
  for (const item of planas) {
    for (const z of item.preparada.zonas) {
      if (z.rango_invertido_en_ppt) invertidas.push({ ficha: item.ficha.ficha_codigo, zona: z });
    }
  }
  chk('Los rangos escritos al revés en el PowerPoint quedan con mínimo menor que máximo', invertidas.length > 0 && invertidas.every(({ zona }) => zona.min < zona.max && zona.medio * 2 === zona.min + zona.max), String(invertidas.length));

  chk('Ejemplo: máx 8,2 → Máx-Máx 8,4', aCentesimasNumero(8.2) + 20 === aCentesimasNumero(8.4));

  for (const item of planas) {
    const { ficha, preparada } = item;
    const clave = `${ficha.ficha_codigo}|${ficha.gas}`;
    const suma = preparada.sumaC / 100;
    chk(`${clave}: nº de zonas`, ficha.n_zonas === preparada.zonas.length && ficha.zonas.length === preparada.zonas.length);
    chk(`${clave}: suma de medios`, Math.abs(suma - ficha.suma_medios_zonas) < 1e-9, `${suma} vs ${ficha.suma_medios_zonas}`);
    const total = ficha.peso_total_g;
    chk(`${clave}: total mín/medio/máx`,
      aCentesimasNumero(total.min) === Math.round(total.min * 100)
      && aCentesimasNumero(total.medio) === Math.round(total.medio * 100)
      && aCentesimasNumero(total.max) === Math.round(total.max * 100));
    chk(`${clave}: extremos del total`,
      aCentesimasNumero(total.min_min) === aCentesimasNumero(total.min) - 20
      && aCentesimasNumero(total.max_max) === aCentesimasNumero(total.max) + 20);
    chk(`${clave}: cortes + 1 = zonas`, ficha.cortes_cm.length + 1 === ficha.n_zonas, `${ficha.cortes_cm.length} cortes`);

    let sumaPct = 0;
    preparada.zonas.forEach((z, i) => {
      const p = (z.medioC / preparada.sumaC) * 100;
      sumaPct += p;
      chk(`${clave}/${z.nombre}: % sobre la suma de zonas`, Math.abs(p - z.pct_sobre_suma_zonas) < 5e-4, `${p} vs ${z.pct_sobre_suma_zonas}`);
      const pt = (z.medio / total.medio) * 100;
      chk(`${clave}/${z.nombre}: % sobre el total del PowerPoint (dato, no se muestra)`, Math.abs(pt - z.pct_sobre_peso_total) < 5e-4);
      chk(`${clave}/${z.nombre}: Mín-Mín`, z.minMinC === z.minC - 20);
      chk(`${clave}/${z.nombre}: Máx-Máx`, z.maxMaxC === z.maxC + 20);
      chk(`${clave}/${z.nombre}: Mín ≤ Medio ≤ Máx`, z.minC <= z.medioC && z.medioC <= z.maxC, `${z.minC} ${z.medioC} ${z.maxC}`);
      if (z.minC + z.maxC !== z.medioC * 2) {
        hallazgos.push(`${clave}/${z.nombre}: el medio no es la media del rango.`);
      }
      chk(`${clave}/${z.nombre}: el % mostrado entra en el cierre a 100,00`, preparada.pct[i] >= 0);
    });
    chk(`${clave}: los % exactos suman 100`, Math.abs(sumaPct - 100) < 1e-8, String(sumaPct));
    chk(`${clave}: los % a 2 decimales suman 100,00`, preparada.pct.reduce((a, b) => a + b, 0) === 10000);

    const oficial = aCentesimasNumero(total.medio);
    const muestras = [preparada.sumaC, oficial, 1, 2000, 3333, 4041, 9999, 10001, 2165, 3765, 5500];
    const visto = new Set();
    for (const nC of muestras) {
      if (visto.has(nC) || nC <= 0) continue;
      visto.add(nC);
      const nuevo = calcularNuevo(preparada, nC);
      const medios = preparada.zonas.map((z) => z.medioC);
      const esperado = repartoMayorResto(medios, nC);
      chk(`${clave}: N=${nC} suma exacta`, nuevo.sumaC === nC, String(nuevo.sumaC));
      chk(`${clave}: N=${nC} coincide con mayor resto`, nuevo.filas.every((f, i) => f.medioC === esperado[i]));
      chk(`${clave}: N=${nC} coincide con BigInt`, esperado.every((v, i) => v === repartoBig(medios, nC)[i]));
      chk(`${clave}: N=${nC} % suman 100,00`, nuevo.pct.reduce((a, b) => a + b, 0) === 10000);
      nuevo.filas.forEach((f, i) => {
        const z = preparada.zonas[i];
        const inf = z.medioC - z.minC;
        const sup = z.maxC - z.medioC;
        chk(`${clave}: N=${nC} margen ${z.clave}`, f.minC === f.medioC - inf && f.maxC === f.medioC + sup);
        chk(`${clave}: N=${nC} extremo ${z.clave}`, f.minMinC === f.minC - 20 && f.maxMaxC === f.maxC + 20);
      });
      if (nC === preparada.sumaC) {
        chk(`${clave}: con el gramaje patrón (suma de zonas) se recuperan los medios`,
          nuevo.filas.every((f, i) => f.medioC === preparada.zonas[i].medioC));
      }
    }

    const raros = ['19,999', '40.405', '0,01', '100,005'];
    for (const texto of raros) {
      const pedido = textoACentesimas(texto);
      chk(`${clave}: se lee ${texto}`, pedido.ok);
      if (!pedido.ok) continue;
      const nuevo = calcularNuevo(preparada, pedido.centesimas);
      chk(`${clave}: N leído de «${texto}» suma exacta`, nuevo.sumaC === pedido.centesimas);
    }
  }

  const rng = aleatorio(15);
  let aleatorias = 0;
  let aleatoriasOk = 0;
  for (const item of planas) {
    const medios = item.preparada.zonas.map((z) => z.medioC);
    for (let i = 0; i < 300; i += 1) {
      const nC = 1500 + Math.floor(rng() * 4001);
      const a = repartoMayorResto(medios, nC);
      const b = repartoAcumulado(medios, nC);
      const suma = medios.reduce((x, y) => x + y, 0);
      const cerca = a.every((v, idx) => Math.abs(v - (nC * medios[idx]) / suma) < 1);
      const ok = a.reduce((x, y) => x + y, 0) === nC
        && b.reduce((x, y) => x + y, 0) === nC
        && a.every((v, idx) => Math.abs(v - b[idx]) <= 1)
        && a.every((v) => v >= 0)
        && cerca;
      aleatorias += 1;
      if (ok) aleatoriasOk += 1;
    }
  }
  chk(`Calculadora: ${aleatorias} gramajes aleatorios con suma exacta`, aleatoriasOk === aleatorias, `${aleatoriasOk}/${aleatorias}`);

  const calculadas = mediasCalculadas(planas);
  const porNombre = new Map(calculadas.map((g) => [g.grupo, g]));
  const esperadas = doc.medias_pct_grupos || [];
  chk('17 grupos de medias', esperadas.length === 17 && calculadas.length === 17, `${calculadas.length}/${esperadas.length}`);
  for (const g of esperadas) {
    const c = porNombre.get(g.grupo);
    chk(`Grupo «${g.grupo}» presente`, Boolean(c));
    if (!c) continue;
    chk(`Grupo «${g.grupo}» nº de fichas`, c.n_fichas === g.n_fichas, `${c.n_fichas} vs ${g.n_fichas}`);
    const claves = Object.keys(g.sobre_suma_zonas);
    chk(`Grupo «${g.grupo}» mismas zonas`, claves.every((k) => c.zonas[k]) && Object.keys(c.zonas).every((k) => g.sobre_suma_zonas[k]));
    for (const k of claves) {
      const esp = g.sobre_suma_zonas[k];
      const got = c.zonas[k];
      if (!got) continue;
      chk(`Grupo «${g.grupo}» ${k} media`, Math.abs(got.media - esp.media_pct) < 0.006, `${got.media} vs ${esp.media_pct}`);
      chk(`Grupo «${g.grupo}» ${k} n`, got.n === esp.n);
    }
  }

  const pedidoVacio = textoACentesimas('');
  const pedidoMal = textoACentesimas('abc');
  const pedidoCero = textoACentesimas('0');
  chk('Gramaje vacío no calcula', !pedidoVacio.ok && pedidoVacio.motivo === 'vacio');
  chk('Gramaje no numérico no calcula', !pedidoMal.ok);
  chk('Gramaje 0 no calcula', !pedidoCero.ok);

  return { total: pruebas.length, fallos: fallos.length, lista_fallos: fallos, hallazgos, pruebas };
}
