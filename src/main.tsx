import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';
import { applyTheme } from './lib/theme';
import './styles.css';

// Before the first paint: the saved or system theme, so dark mode never flashes light.
applyTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster richColors closeButton position="top-center" />
  </React.StrictMode>,
);
