// =============================================================================
// Kanbinou - Point d'entrée de l'application Vue 3 & PWA
// =============================================================================

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// Import des styles SCSS modulaires
import './styles/main.scss';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.mount('#app');

// Enregistrement du Service Worker Natif W3C (PWA)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swUrl)
      .then((registration) => {
        console.log('[PWA] Service Worker actif, scope :', registration.scope);
      })
      .catch((error) => {
        console.warn('[PWA] Échec enregistrement Service Worker :', error);
      });
  });
}
