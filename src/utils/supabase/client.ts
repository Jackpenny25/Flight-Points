import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

export const supabase = createClient(
  `https://${projectId}.supabase.co`,
  publicAnonKey
);

// Listen for auth state changes and proactively clear session on refresh failures.
// This helps prevent repeated "Invalid Refresh Token" errors from the client library
// by signing the user out when refresh fails (they can then sign in again).
if (typeof window !== 'undefined' && supabase?.auth?.onAuthStateChange) {
  supabase.auth.onAuthStateChange((event) => {
    try {
      // Handle token refresh failures or other auth errors by signing out.
      if (event === 'TOKEN_REFRESH_FAILED' || event === 'AUTO_REFRESH_TOKEN_ERROR' || event === 'SIGNED_OUT') {
        // attempt to sign out and clear any stale session
        supabase.auth.signOut().catch(() => {});
        // notify the app if needed
        try { window.dispatchEvent(new CustomEvent('supabase:auth:refresh_failed', { detail: { event } })); } catch (_) {}
      }
    } catch (e) {
      // swallow to avoid noisy logs
    }
  });
}

export default supabase;
