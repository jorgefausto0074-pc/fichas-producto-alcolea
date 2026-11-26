export function normalizar(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1,$2')
    .replace(/\s+/g, ' ')
    .trim();
}

export function textoCapacidad(cap) {
  return `${cap} L`;
}

export function textoGas(gas) {
  return gas === 'con_gas' ? 'Con gas' : 'Sin gas';
}

function bolsa(botella, ficha, gramaje) {
  const cap = textoCapacidad(botella.capacidad_l);
  return normalizar([
    botella.nombre,
    botella.id,
    ficha.ficha_codigo,
    ficha.id,
    ficha.titulo_diapositiva,
    textoGas(botella.gas),
    cap,
    cap.replace(' ', ''),
    gramaje,
    gramaje.replace(',', '.'),
    `${botella.capacidad_l} l`,
    `${botella.capacidad_l}l`,
  ].filter(Boolean).join(' · '));
}

export function botellaVisible(botella, { q, gas, capacidad, gramosDe }) {
  if (gas !== 'todas' && botella.gas !== gas) return false;
  if (capacidad !== 'todas' && botella.capacidad_l !== capacidad) return false;
  const consulta = normalizar(q);
  if (!consulta) return true;
  const compacta = consulta.replace(/ /g, '');
  return botella.fichas.some((ficha) => {
    const texto = bolsa(botella, ficha, gramosDe(ficha));
    return texto.includes(consulta) || texto.replace(/ /g, '').includes(compacta);
  });
}
