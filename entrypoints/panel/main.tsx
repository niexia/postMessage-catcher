import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelApp } from '../../components/panel/PanelApp';
import './style.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <PanelApp />
    </StrictMode>,
  );
}
