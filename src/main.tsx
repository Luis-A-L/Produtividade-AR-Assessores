import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Se esta janela for um pop-up de callback do Google/Supabase OAuth
const isOAuthPopupCallback =
  window.opener &&
  window.opener !== window &&
  (window.location.hash.includes('access_token') ||
   window.location.search.includes('code=') ||
   window.location.hash.includes('error'));

if (isOAuthPopupCallback) {
  try {
    window.opener.postMessage(
      {
        type: 'SUPABASE_OAUTH_CALLBACK',
        hash: window.location.hash,
        search: window.location.search,
      },
      '*'
    );
  } catch (e) {
    console.error('Falha ao comunicar com janela principal:', e);
  }

  // Exibe tela minimalista de sucesso no pop-up e fecha rapidamente
  document.body.innerHTML = `
    <div style="font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #0f172a; color: #f8fafc; text-align: center; padding: 24px; box-sizing: border-box;">
      <div style="width: 52px; height: 52px; border-radius: 50%; background: #22c55e; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; box-shadow: 0 4px 14px rgba(34, 197, 94, 0.4);">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 8px 0; color: #f8fafc;">Login efetuado com sucesso!</h2>
      <p style="font-size: 13px; color: #94a3b8; margin: 0;">Esta janela fechará automaticamente...</p>
    </div>
  `;

  setTimeout(() => {
    window.close();
  }, 400);
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
