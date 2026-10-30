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

export function fetchPosts() {
  return request('/api/posts');
}

export function fetchPost(slug) {
  return request(`/api/posts/${encodeURIComponent(slug)}`);
}

export function createPost(payload) {
  return request('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function updatePost(slug, patch) {
  return request(`/api/posts/${encodeURIComponent(slug)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function uploadPostImage(slug, file) {
  const form = new FormData();
  form.append('file', file);
  return request(`/api/posts/${encodeURIComponent(slug)}/images`, {
    method: 'POST',
    body: form,
  });
}

export function fetchAssets() {
  return request('/api/assets');
}

export function saveAssets(payload) {
  return request('/api/assets', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function renameAssetPrefix(payload) {
  return request('/api/assets/prefix', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deletePost(slug, { removeAssets = false } = {}) {
  const query = removeAssets ? '?removeAssets=1' : '';
  return request(`/api/posts/${encodeURIComponent(slug)}${query}`, { method: 'DELETE' });
}
