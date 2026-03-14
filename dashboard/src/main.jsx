import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import DemoPage from './DemoPage';

const path = window.location.pathname;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/demo' ? <DemoPage /> : <App />}
  </StrictMode>
);
