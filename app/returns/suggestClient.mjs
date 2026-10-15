/**
 * Debounced + abortable product-suggest session.
 *
 * Shared by the Returns page (browser) and the Node test harness — one
 * implementation is tested in both places:
 *  - 250ms debounce (keystroke bursts → one request)
 *  - min length gate (short queries never hit the network)
 *  - AbortController cancels the previous in-flight request on supersede
 *  - monotonic sequence drops stale responses that ignore the abort
 *
 * Pure ESM, no framework imports, injectable fetch for tests.
 */
export function createSuggestSession(options = {}) {
  const debounceMs = options.debounceMs ?? 250;
  const minLength = options.minLength ?? 2;
  const apiUrl = options.apiUrl ?? '';
  const fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
  /**
   * Extra query parameters, merged into every request this session makes.
   * Used for the selected Equipment Category. Absent or empty means the URL is
   * byte-for-byte what it was before this option existed — the server treats
   * `cat` as optional, so an older deployment simply ignores it.
   */
  const extraParams = options.extraParams && typeof options.extraParams === 'object'
    ? options.extraParams
    : {};

  const extraQuery = Object.entries(extraParams)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

  let timer = null;
  let controller = null;
  let seq = 0;

  async function fire(query, handlers) {
    const mySeq = ++seq;
    if (controller) {
      try { controller.abort(); } catch { /* already aborted */ }
    }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    controller = ctrl;
    try {
      const url = `${apiUrl}/api/products/suggest?q=${encodeURIComponent(query)}`
        + (extraQuery ? `&${extraQuery}` : '');
      const res = await fetchImpl(
        url,
        ctrl ? { signal: ctrl.signal } : undefined
      );
      const body = await res.json();
      if (mySeq !== seq) return; // superseded — stale response, drop it
      handlers.onResponse && handlers.onResponse(body, query);
    } catch (err) {
      if (mySeq !== seq) return;
      if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) return;
      handlers.onError && handlers.onError(err);
    } finally {
      if (controller === ctrl) controller = null;
    }
  }

  return {
    /**
     * Queue a lookup. `handlers`: onResponse(body, query), onError(err),
     * onTooShort(query). Fire-and-forget; responses arrive via handlers.
     */
    request(rawQuery, handlers = {}) {
      const q = String(rawQuery == null ? '' : rawQuery).trim();
      if (timer) { clearTimeout(timer); timer = null; }
      if (q.length < minLength) {
        seq++; // invalidate any in-flight response
        if (controller) { try { controller.abort(); } catch { /* noop */ } controller = null; }
        if (handlers.onTooShort) handlers.onTooShort(q);
        return;
      }
      timer = setTimeout(() => { timer = null; void fire(q, handlers); }, debounceMs);
    },

    /** Cancel any pending debounce + in-flight request (unmount / close). */
    cancel() {
      if (timer) { clearTimeout(timer); timer = null; }
      seq++;
      if (controller) { try { controller.abort(); } catch { /* noop */ } controller = null;
      }
    }
  };
}
