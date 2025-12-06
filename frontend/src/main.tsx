import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// import App from './App.tsx'
import AuthPage from './pages/AuthPage.tsx';

const root = createRoot(document.getElementById('root')!);

root.render(
  <StrictMode>
    <AuthPage/>
  </StrictMode>,
)
