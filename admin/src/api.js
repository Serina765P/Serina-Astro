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
