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
 *
 * ── Two-phase search ──────────────────────────────────────────────────────
 * `mode=fast` answers from the server's in-memory catalog snapshot and is
 * cheap enough to run on every keystroke. `mode=llm` is the refine pass: it is
 * only worth paying inference latency for once the visitor has stopped typing,
 * so the caller fires it on a settle timer rather than on every key.
 *
 * Both passes share ONE abort/sequence pair on purpose: a new keystroke must
 * cancel a refine pass that is no longer relevant, and a stale refine response
 * must never overwrite fresher fast results.
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

  async function fire(query, handlers, perCallParams) {
    const mySeq = ++seq;
    if (controller) {
      try { controller.abort(); } catch { /* already aborted */ }
    }
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    controller = ctrl;
    const callQuery = perCallParams
      ? Object.entries(perCallParams)
        .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
      : '';
    try {
      const url = `${apiUrl}/api/products/suggest?q=${encodeURIComponent(query)}`
        + (extraQuery ? `&${extraQuery}` : '')
        + (callQuery ? `&${callQuery}` : '');
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
     *
     * `opts.extraParams` is merged on top of the session-level params (used to
     * add `mode=llm` on the refine pass). `opts.debounceMs` overrides the
     * session default — the settle timer has already waited, so the refine
     * pass should fire immediately rather than debounce again.
     */
    request(rawQuery, handlers = {}, opts = {}) {
      const q = String(rawQuery == null ? '' : rawQuery).trim();
      if (timer) { clearTimeout(timer); timer = null; }
      if (q.length < minLength) {
        seq++; // invalidate any in-flight response
        if (controller) { try { controller.abort(); } catch { /* noop */ } controller = null; }
        if (handlers.onTooShort) handlers.onTooShort(q);
        return;
      }
      const wait = Number.isFinite(opts.debounceMs) ? opts.debounceMs : debounceMs;
      const run = () => { timer = null; void fire(q, handlers, opts.extraParams); };
      if (wait <= 0) run();
      else timer = setTimeout(run, wait);
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
