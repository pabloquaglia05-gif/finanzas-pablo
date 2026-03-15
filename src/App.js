import React, { useState } from 'react'
import Dashboard from './pages/Dashboard'
import Registro from './pages/Registro'
import Tarjetas from './pages/Tarjetas'
import ResumenAnual from './pages/ResumenAnual'
import Categorias from './pages/Categorias'
import './App.css'

const PAGES = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'registro', label: 'Registro', icon: '📝' },
  { id: 'tarjetas', label: 'Tarjetas', icon: '💳' },
  { id: 'anual', label: 'Resumen Anual', icon: '📅' },
  { id: 'categorias', label: 'Categorías', icon: '🏷️' },
]

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [menuOpen, setMenuOpen] = useState(false)

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'registro': return <Registro />
      case 'tarjetas': return <Tarjetas />
      case 'anual': return <ResumenAnual />
      case 'categorias': return <Categorias />
      default: return <Dashboard />
    }
  }

  return (
    <div className="app">
      {/* Sidebar desktop */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="logo-icon">💰</span>
          <span className="logo-text">Finanzas</span>
        </div>
        <nav className="sidebar-nav">
          {PAGES.map(p => (
            <button
              key={p.id}
              className={`nav-item ${page === p.id ? 'active' : ''}`}
              onClick={() => setPage(p.id)}
            >
              <span className="nav-icon">{p.icon}</span>
              <span className="nav-label">{p.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Mobile header */}
      <header className="mobile-header">
        <div className="mobile-logo">💰 Finanzas</div>
        <button className="hamburger" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="mobile-menu">
          {PAGES.map(p => (
            <button
              key={p.id}
              className={`mobile-nav-item ${page === p.id ? 'active' : ''}`}
              onClick={() => { setPage(p.id); setMenuOpen(false) }}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main content */}
      <main className="main-content">
        {renderPage()}
      </main>

      {/* Bottom nav mobile */}
      <nav className="bottom-nav">
        {PAGES.map(p => (
          <button
            key={p.id}
            className={`bottom-nav-item ${page === p.id ? 'active' : ''}`}
            onClick={() => setPage(p.id)}
          >
            <span className="bottom-nav-icon">{p.icon}</span>
            <span className="bottom-nav-label">{p.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
