import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { installSessionFetch } from './lib/session-client'

installSessionFetch()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
