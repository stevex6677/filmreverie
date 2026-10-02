// HTTP is supported only on this machine's established private/loopback names.
const privateHosts = ['localhost', '127.0.0.1', '[::1]', 'macbook', 'macbook.tail2b1388.ts.net'];

export function isDevOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === value && !url.username && !url.password
      && (url.protocol === 'https:' || url.protocol === 'http:' && privateHosts.includes(url.hostname));
  } catch { return false; }
}

/** Port wildcards are limited to known private hosts, never arbitrary domains. */
export function isDevOriginPattern(value: string): boolean {
  if (!value.endsWith(':*')) return isDevOrigin(value);
  const base = value.slice(0, -2);
  return isDevOrigin(base) && privateHosts.includes(new URL(base).hostname) && !new URL(base).port;
}

export function matchesDevOrigin(value: string, pattern: string): boolean {
  if (!isDevOrigin(value) || !isDevOriginPattern(pattern)) return false;
  if (!pattern.endsWith(':*')) return value === pattern;
  const url = new URL(value), base = new URL(pattern.slice(0, -2));
  return url.protocol === base.protocol && url.hostname === base.hostname;
}
