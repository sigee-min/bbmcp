import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import HomePage from './app/page';
import './app/globals.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container #root was not found.');
}

createRoot(container).render(
  <StrictMode>
    <HomePage />
  </StrictMode>
);
