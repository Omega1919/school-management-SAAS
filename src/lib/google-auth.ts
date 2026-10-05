/**
 * Google Sign-In Helper utilizing Google Identity Services (GIS)
 * Direct connection to accounts.google.com avoids reliance on unhosted firebaseapp.com domains
 */
import firebaseConfig from '../../firebase-applet-config.json';

interface GoogleAuthResponse {
  accessToken?: string;
  idToken?: string;
}

let scriptLoadingPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Window not available'));
  if ((window as any).google?.accounts?.oauth2 || (window as any).google?.accounts?.id) {
    return Promise.resolve();
  }

  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services SDK'));
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

export async function requestGoogleSignIn(customClientId?: string): Promise<GoogleAuthResponse> {
  await loadGoogleIdentityScript();

  const clientId = customClientId || firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('Google OAuth Client ID is not configured.');
  }

  return new Promise((resolve, reject) => {
    try {
      const oauth2 = (window as any).google?.accounts?.oauth2;
      if (oauth2 && typeof oauth2.initTokenClient === 'function') {
        const tokenClient = oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: (response: any) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
            } else if (response.access_token) {
              resolve({ accessToken: response.access_token });
            } else {
              reject(new Error('No authorization token received from Google.'));
            }
          },
          error_callback: (err: any) => {
            reject(new Error(err?.message || 'Google popup sign-in was closed or failed.'));
          },
        });

        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } else {
        reject(new Error('Google OAuth2 client is not ready.'));
      }
    } catch (err: any) {
      reject(err);
    }
  });
}
