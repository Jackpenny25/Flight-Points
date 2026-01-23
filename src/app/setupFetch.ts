import { projectId, publicAnonKey } from '../../utils/supabase/info';

export function installFunctionFetchWrapper() {
  if (typeof window === 'undefined' || (window as any).__functionsFetchPatched) return;
  const origFetch = window.fetch.bind(window);
  (window as any).__functionsFetchPatched = true;

  window.fetch = async (input: RequestInfo, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
      const fnPrefix = `https://${projectId}.supabase.co/functions/v1/`;
      if (url.startsWith(fnPrefix)) {
        const headers: Record<string, string> = {};
        // preserve existing headers from init
        if (init && init.headers) {
          const h = init.headers as Record<string, string> | Headers;
          if (h instanceof Headers) {
            h.forEach((v, k) => (headers[k] = v));
          } else {
            Object.assign(headers, h as Record<string, string>);
          }
        }

        // Ensure apikey and Authorization headers are present so Supabase gateway treats as valid public call
        const hasApikey = !!(headers['apikey'] || headers['ApiKey'] || headers['x-api-key']);
        const hasAuth = !!(headers['authorization'] || headers['Authorization']);
        if (!hasApikey) headers['apikey'] = publicAnonKey;
        if (!hasAuth) headers['Authorization'] = `Bearer ${publicAnonKey}`;

        const newInit = { ...(init || {}), headers } as RequestInit;
        return origFetch(input, newInit);
      }
    } catch (e) {
      // fall through to original fetch on error
    }
    return origFetch(input, init);
  };
}

// Auto-install when loaded in browser
if (typeof window !== 'undefined') installFunctionFetchWrapper();
