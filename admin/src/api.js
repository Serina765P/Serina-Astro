async function request(pathname, init) {
  const response = await fetch(pathname, init);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error ?? `请求失败（HTTP ${response.status}）`);
  }
  return payload;
}

export function fetchSiteInfo() {
  return request('/api/site-info');
}

export function saveSiteInfo(patch) {
  return request('/api/site-info', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function fetchShuoshuo() {
  return request('/api/shuoshuo');
}

export function createShuoshuo(payload) {
  return request('/api/shuoshuo', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updateShuoshuo(id, patch) {
  return request(`/api/shuoshuo/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function deleteShuoshuo(id) {
  return request(`/api/shuoshuo/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function fetchTaxonomy() {
  return request('/api/taxonomy');
}

export function saveTaxonomy(taxonomy) {
  return request('/api/taxonomy', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(taxonomy),
  });
}
