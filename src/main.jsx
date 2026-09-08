import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './discord-polish.css'
import './components/ServerSettings.css'

document.addEventListener('contextmenu', e => {
  const el = e.target.closest?.('input, textarea, [contenteditable="true"]')
  if (el) return
  e.preventDefault()
})

try {
  const fs = localStorage.getItem('dsh_font')
  if (fs) document.documentElement.style.fontSize = fs + 'px'
} catch {}

createRoot(document.getElementById('root')).render(<App />)
