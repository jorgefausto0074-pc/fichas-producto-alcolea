// Cliente mínimo de la API de GitHub. El token solo viaja en Authorization.

const API = 'https://api.github.com';
const RELEASE = 'actualizacion-pendiente';
export const WORKFLOW = 'actualizar-fichas.yml';

export function sanear(texto, secreto) {
  let out = String(texto || '');
  if (secreto) out = out.split(secreto).join('•••');
  return out.replace(/github_pat_[A-Za-z0-9_]+/g, '•••').replace(/ghp_[A-Za-z0-9]+/g, '•••').slice(0, 240);
}

export function crearCliente({ fetch: fetchImpl = globalThis.fetch, token, repo }) {
  if (!token || !repo) throw new Error('Falta el acceso a GitHub.');

  async function pedir(url, { method = 'GET', body, headers = {}, binario = false } = {}) {
    const res = await fetchImpl(url, {
      method,
      headers: {
        Accept: binario ? 'application/octet-stream' : 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...headers,
      },
      body,
    });
    if (!res.ok) {
      let detalle = '';
      try { detalle = (await res.json())?.message || ''; } catch { /* cuerpo vacío o binario */ }
      const err = new Error(sanear(detalle || `GitHub ha respondido ${res.status}.`, token));
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    if (binario) return new Uint8Array(await res.arrayBuffer());
    return res.json();
  }

  return {
    async releases() {
      return pedir(`${API}/repos/${repo}/releases?per_page=100`);
    },
    async releasePendiente() {
      const lista = await this.releases();
      return (lista || []).find((r) => r.draft && (r.tag_name === RELEASE || r.name === RELEASE)) || null;
    },
    async borrarRelease(id) {
      await pedir(`${API}/repos/${repo}/releases/${id}`, { method: 'DELETE' });
    },
    async crearRelease() {
      return pedir(`${API}/repos/${repo}/releases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: RELEASE,
          name: RELEASE,
          draft: true,
          prerelease: true,
          make_latest: 'false',
          body: 'Borrador de actualización. Los PDF van cifrados. Se borra al publicar o al descartar.',
        }),
      });
    },
    async subir(releaseId, nombre, bytes, contentType) {
      const url = `https://uploads.github.com/repos/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(nombre)}`;
      return pedir(url, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: bytes,
      });
    },
    async bajar(release, nombre) {
      const asset = (release.assets || []).find((a) => a.name === nombre);
      if (!asset) throw Object.assign(new Error(`No está ${nombre}.`), { code: 'sin-asset' });
      return pedir(asset.url, { binario: true });
    },
    async dispatch(modo, solicitud) {
      await pedir(`${API}/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: 'main', inputs: { modo, solicitud } }),
      });
    },
    async runs() {
      return pedir(`${API}/repos/${repo}/actions/workflows/${WORKFLOW}/runs?per_page=15`);
    },
    async runEnCurso() {
      const data = await this.runs();
      return (data.workflow_runs || []).find((r) => r.status !== 'completed') || null;
    },
  };
}

export async function reemplazarRelease(gh) {
  const enCurso = await gh.runEnCurso();
  if (enCurso) {
    throw Object.assign(new Error('Ya hay una actualización en curso.'), { code: 'en-curso', runUrl: enCurso.html_url });
  }
  const previa = await gh.releasePendiente();
  if (previa) await gh.borrarRelease(previa.id);
  return gh.crearRelease();
}

export function nuevaSolicitud() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
  return `a${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function esperarRun(gh, { solicitud, desde, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), intervalo = 4000, limite = 90 }) {
  const inicio = Date.parse(desde) - 15000;
  let visto = null;
  for (let i = 0; i < limite; i += 1) {
    const data = await gh.runs();
    const runs = data.workflow_runs || [];
    visto = runs.find((r) => String(r.name || '').includes(solicitud) || String(r.display_title || '').includes(solicitud))
      || runs.find((r) => r.event === 'workflow_dispatch' && Date.parse(r.created_at) >= inicio);
    if (visto && visto.status === 'completed') return visto;
    await esperar(intervalo);
  }
  if (visto) return visto;
  throw new Error('No aparece la ejecución en GitHub.');
}

export function mensajeFallo({ resultado, run }) {
  const url = run?.html_url || '';
  const codigo = resultado?.codigo;
  if (codigo === 2 || codigo === '2') {
    return {
      texto: 'No se ha aceptado el PDF. Tiene que ser un informe de Access de Alcolea, de asépticos o de no asépticos, y no los dos del mismo grupo.',
      url,
    };
  }
  if (codigo === 'base') {
    return {
      texto: 'Las fichas publicadas cambiaron desde la revisión. Descarta esta actualización y vuelve a revisarla.',
      url,
    };
  }
  return { texto: 'La ejecución ha fallado.', url };
}
