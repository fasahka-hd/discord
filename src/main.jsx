import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

// Discord blocks the native browser context menu — only our custom menus exist.
// Native menu stays available inside text inputs (copy/paste).
document.addEventListener('contextmenu', e => {
  const el = e.target.closest?.('input, textarea, [contenteditable="true"]')
  if (el) return
  e.preventDefault()
})

// restore saved font size
try {
  const fs = localStorage.getItem('dsh_font')
  if (fs) document.documentElement.style.fontSize = fs + 'px'
} catch {}

createRoot(document.getElementById('root')).render(<App />)
