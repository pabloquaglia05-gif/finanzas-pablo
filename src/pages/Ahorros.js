import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

function fmt(n, moneda = 'ARS') {
  if (moneda === 'USD') return `U$S ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0)
}

function exportToCSV(data) {
  const headers = ['Fecha','Tipo','Descripción','Plataforma','Movimiento','Monto','Moneda','TC','TNA','Vencimiento','Notas']
  const rows = data.map(r => [
    new Date(r.fecha + 'T12:00:00').toLocaleDateString('es-AR'),
    r.tipo, r.descripcion, r.plataforma, r.movimiento,
    r.monto, r.tipo_moneda, r.tipo_cambio || '', r.tna || '',
    r.fecha_vencimiento || '', r.notas || ''
  ])
  const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'ahorros.csv'; a.click()
  URL.revokeObjectURL(url)
}

const TIPOS = ['FCI USD', 'FCI ARS', 'Plazo Fijo']
const MOVIMIENTOS = ['Suscripcion', 'Rescate', 'Interes', 'Vencimiento']

const EMPTY_FORM = {
  fecha: new Date().toISOString().split('T')[0],
  tipo: 'FCI USD',
  descripcion: '',
  plataforma: '',
  movimiento: 'Suscripcion',
  monto: '',
  tipo_moneda: 'USD',
  tipo_cambio: '',
  tna: '',
  fecha_vencimiento: '',
  notas: ''
}

export default function Ahorros() {
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filtroTipo, setFiltroTipo] = useState('Todos')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('ahorros').select('*').order('fecha', { ascending: false })
    setMovimientos(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ── Cálculos ─────────────────────────────────────────────────
  const calcSaldo = (tipo, moneda) => {
    return movimientos
      .filter(m => m.tipo === tipo && m.tipo_moneda === moneda)
      .reduce((acc, m) => {
        if (m.movimiento === 'Suscripcion') return acc + Number(m.monto)
        if (m.movimiento === 'Rescate' || m.movimiento === 'Vencimiento') return acc - Number(m.monto)
        return acc // Interés no suma al capital
      }, 0)
  }

  const calcIntereses = (tipo, moneda) => {
    return movimientos
      .filter(m => m.tipo === tipo && m.tipo_moneda === moneda && m.movimiento === 'Interes')
      .reduce((acc, m) => acc + Number(m.monto), 0)
  }

  const totalFCIusd = calcSaldo('FCI USD', 'USD')
  const interesesFCIusd = calcIntereses('FCI USD', 'USD')
  const totalFCIars = calcSaldo('FCI ARS', 'ARS')
  const interesesFCIars = calcIntereses('FCI ARS', 'ARS')
  const totalPF = calcSaldo('Plazo Fijo', 'ARS')
  const interesesPF = calcIntereses('Plazo Fijo', 'ARS')

  // Agrupar por plataforma/descripción para el resumen
  const resumenFCIusd = {}
  const resumenFCIars = {}
  const resumenPF = {}

  movimientos.forEach(m => {
    const key = `${m.descripcion} — ${m.plataforma}`
    if (m.tipo === 'FCI USD') {
      if (!resumenFCIusd[key]) resumenFCIusd[key] = { capital: 0, intereses: 0, plataforma: m.plataforma }
      if (m.movimiento === 'Suscripcion') resumenFCIusd[key].capital += Number(m.monto)
      if (m.movimiento === 'Rescate') resumenFCIusd[key].capital -= Number(m.monto)
      if (m.movimiento === 'Interes') resumenFCIusd[key].intereses += Number(m.monto)
    }
    if (m.tipo === 'FCI ARS') {
      if (!resumenFCIars[key]) resumenFCIars[key] = { capital: 0, intereses: 0, plataforma: m.plataforma }
      if (m.movimiento === 'Suscripcion') resumenFCIars[key].capital += Number(m.monto)
      if (m.movimiento === 'Rescate') resumenFCIars[key].capital -= Number(m.monto)
      if (m.movimiento === 'Interes') resumenFCIars[key].intereses += Number(m.monto)
    }
    if (m.tipo === 'Plazo Fijo') {
      if (!resumenPF[key]) resumenPF[key] = { capital: 0, intereses: 0, plataforma: m.plataforma, tna: m.tna, vencimiento: m.fecha_vencimiento }
      if (m.movimiento === 'Suscripcion') resumenPF[key].capital += Number(m.monto)
      if (m.movimiento === 'Vencimiento') resumenPF[key].capital -= Number(m.monto)
      if (m.movimiento === 'Interes') resumenPF[key].intereses += Number(m.monto)
    }
  })

  const filtrados = movimientos.filter(m => filtroTipo === 'Todos' || m.tipo === filtroTipo)

  // ── CRUD ──────────────────────────────────────────────────────
  const openNew = () => {
    setEditItem(null)
    setForm({ ...EMPTY_FORM,
      tipo_moneda: 'USD',
      fecha: new Date().toISOString().split('T')[0]
    })
    setShowModal(true)
  }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      fecha: item.fecha,
      tipo: item.tipo,
      descripcion: item.descripcion,
      plataforma: item.plataforma,
      movimiento: item.movimiento,
      monto: item.monto,
      tipo_moneda: item.tipo_moneda,
      tipo_cambio: item.tipo_cambio || '',
      tna: item.tna || '',
      fecha_vencimiento: item.fecha_vencimiento || '',
      notas: item.notas || ''
    })
    setShowModal(true)
  }

  // Auto-set moneda según tipo
  const handleTipoChange = (tipo) => {
    const moneda = tipo === 'FCI USD' ? 'USD' : 'ARS'
    setForm(f => ({ ...f, tipo, tipo_moneda: moneda }))
  }

  const save = async () => {
    if (!form.fecha || !form.descripcion || !form.plataforma || !form.monto) return alert('Completá todos los campos obligatorios')
    setSaving(true)
    const payload = {
      fecha: form.fecha,
      tipo: form.tipo,
      descripcion: form.descripcion.trim(),
      plataforma: form.plataforma.trim(),
      movimiento: form.movimiento,
      monto: Number(form.monto),
      tipo_moneda: form.tipo_moneda,
      tipo_cambio: form.tipo_cambio ? Number(form.tipo_cambio) : null,
      tna: form.tna ? Number(form.tna) : null,
      fecha_vencimiento: form.fecha_vencimiento || null,
      notas: form.notas || null
    }
    if (editItem) {
      const { error } = await supabase.from('ahorros').update(payload).eq('id', editItem.id)
      if (error) alert('Error: ' + error.message)
    } else {
      const { error } = await supabase.from('ahorros').insert([payload])
      if (error) alert('Error: ' + error.message)
    }
    setShowModal(false); setEditItem(null); setForm(EMPTY_FORM); load()
    setSaving(false)
  }

  const del = async (id) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return
    await supabase.from('ahorros').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Ahorros e inversiones</div>
          <div className="page-subtitle">FCI en USD, FCI en pesos y plazos fijos</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
            onClick={() => exportToCSV(filtrados)}>📤 Exportar</button>
          <button className="btn btn-primary" onClick={openNew}>+ Nuevo movimiento</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card blue">
          <div className="stat-label">FCI en USD</div>
          <div className="stat-value blue">{fmt(totalFCIusd, 'USD')}</div>
          {interesesFCIusd > 0 && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>+ {fmt(interesesFCIusd, 'USD')} intereses</div>}
        </div>
        <div className="stat-card green">
          <div className="stat-label">FCI en pesos</div>
          <div className="stat-value green">{fmt(totalFCIars)}</div>
          {interesesFCIars > 0 && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>+ {fmt(interesesFCIars)} intereses</div>}
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Plazos fijos</div>
          <div className="stat-value yellow">{fmt(totalPF)}</div>
          {interesesPF > 0 && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 4 }}>+ {fmt(interesesPF)} intereses</div>}
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Total intereses ARS</div>
          <div className="stat-value green">{fmt(interesesFCIars + interesesPF)}</div>
          {interesesFCIusd > 0 && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>+ {fmt(interesesFCIusd, 'USD')} en USD</div>}
        </div>
      </div>

      {/* Resumen por instrumento */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* FCI USD */}
        <div className="card">
          <div className="section-title" style={{ color: 'var(--accent)' }}>💵 FCI en dólares</div>
          {Object.keys(resumenFCIusd).length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 0' }}>Sin registros</div>
          ) : Object.entries(resumenFCIusd).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{val.plataforma}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{key.split(' — ')[0]}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{fmt(val.capital, 'USD')}</div>
                {val.intereses > 0 && <div style={{ fontSize: 12, color: 'var(--green)' }}>+{fmt(val.intereses, 'USD')}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* FCI ARS */}
        <div className="card">
          <div className="section-title" style={{ color: 'var(--green)' }}>🏦 FCI en pesos</div>
          {Object.keys(resumenFCIars).length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 0' }}>Sin registros</div>
          ) : Object.entries(resumenFCIars).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{val.plataforma}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>{key.split(' — ')[0]}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>{fmt(val.capital)}</div>
                {val.intereses > 0 && <div style={{ fontSize: 12, color: 'var(--green)' }}>+{fmt(val.intereses)}</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Plazos fijos */}
        <div className="card">
          <div className="section-title" style={{ color: 'var(--yellow)' }}>📅 Plazos fijos</div>
          {Object.keys(resumenPF).length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 0' }}>Sin registros</div>
          ) : Object.entries(resumenPF).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{val.plataforma}</div>
                {val.tna && <div style={{ fontSize: 12, color: 'var(--yellow)' }}>TNA {val.tna}%</div>}
                {val.vencimiento && <div style={{ fontSize: 12, color: 'var(--text2)' }}>Vence {new Date(val.vencimiento + 'T12:00:00').toLocaleDateString('es-AR')}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--yellow)' }}>{fmt(val.capital)}</div>
                {val.intereses > 0 && <div style={{ fontSize: 12, color: 'var(--green)' }}>+{fmt(val.intereses)}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="filters">
        <select className="filter-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="Todos">Todos</option>
          {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <span style={{ color: 'var(--text2)', fontSize: 14 }}>{filtrados.length} movimientos</span>
      </div>

      {/* Tabla historial */}
      {filtrados.length === 0 ? (
        <div className="empty"><div className="empty-icon">💰</div><div className="empty-text">No hay movimientos aún</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Fecha</th><th>Tipo</th><th>Descripción</th><th>Plataforma</th>
              <th>Movimiento</th><th>Monto</th><th>Notas</th><th></th>
            </tr></thead>
            <tbody>
              {filtrados.map(m => (
                <tr key={m.id}>
                  <td>{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                  <td>
                    <span className="badge" style={{
                      background: m.tipo === 'FCI USD' ? 'rgba(79,124,255,0.15)' : m.tipo === 'FCI ARS' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                      color: m.tipo === 'FCI USD' ? 'var(--accent)' : m.tipo === 'FCI ARS' ? 'var(--green)' : 'var(--yellow)'
                    }}>{m.tipo}</span>
                  </td>
                  <td>{m.descripcion}</td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{m.plataforma}</td>
                  <td>
                    <span className="badge" style={{
                      background: m.movimiento === 'Interes' ? 'rgba(34,197,94,0.12)' : m.movimiento === 'Rescate' || m.movimiento === 'Vencimiento' ? 'rgba(239,68,68,0.12)' : 'rgba(79,124,255,0.12)',
                      color: m.movimiento === 'Interes' ? 'var(--green)' : m.movimiento === 'Rescate' || m.movimiento === 'Vencimiento' ? 'var(--red)' : 'var(--accent)'
                    }}>{m.movimiento}</span>
                  </td>
                  <td>
                    <span style={{
                      fontFamily: 'DM Mono, monospace', fontWeight: 600,
                      color: m.movimiento === 'Interes' ? 'var(--green)' : m.movimiento === 'Rescate' || m.movimiento === 'Vencimiento' ? 'var(--red)' : 'var(--text)'
                    }}>
                      {m.movimiento === 'Interes' ? '+' : m.movimiento === 'Rescate' || m.movimiento === 'Vencimiento' ? '-' : ''}
                      {fmt(m.monto, m.tipo_moneda)}
                    </span>
                    {m.tna && <div style={{ fontSize: 11, color: 'var(--yellow)' }}>TNA {m.tna}%</div>}
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{m.notas}</td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-sm" style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', border: 'none' }}
                      onClick={() => openEdit(m)}>✏️</button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(m.id)}>🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">{editItem ? 'Editar movimiento' : 'Nuevo movimiento'}</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input type="date" className="form-input" value={form.fecha}
                  onChange={e => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="form-select" value={form.tipo} onChange={e => handleTipoChange(e.target.value)}>
                  {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group form-full">
                <label className="form-label">Descripción *</label>
                <input type="text" className="form-input" placeholder="Ej: FCI Ahorro Plus"
                  value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Plataforma *</label>
                <input type="text" className="form-input" placeholder="Ej: Lemonde, Ripio, BBVA"
                  value={form.plataforma} onChange={e => setForm({ ...form, plataforma: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Movimiento *</label>
                <select className="form-select" value={form.movimiento}
                  onChange={e => setForm({ ...form, movimiento: e.target.value })}>
                  {MOVIMIENTOS.map(mv => <option key={mv} value={mv}>{mv}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto *</label>
                <input type="number" className="form-input" placeholder="0.00"
                  value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Moneda</label>
                <select className="form-select" value={form.tipo_moneda}
                  onChange={e => setForm({ ...form, tipo_moneda: e.target.value })}>
                  <option value="USD">USD</option>
                  <option value="ARS">ARS</option>
                </select>
              </div>
              {form.tipo_moneda === 'USD' && (
                <div className="form-group">
                  <label className="form-label">Tipo de cambio</label>
                  <input type="number" className="form-input" placeholder="Ej: 1150"
                    value={form.tipo_cambio} onChange={e => setForm({ ...form, tipo_cambio: e.target.value })} />
                </div>
              )}
              {form.tipo === 'Plazo Fijo' && (
                <>
                  <div className="form-group">
                    <label className="form-label">TNA %</label>
                    <input type="number" className="form-input" placeholder="Ej: 78"
                      value={form.tna} onChange={e => setForm({ ...form, tna: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Fecha vencimiento</label>
                    <input type="date" className="form-input" value={form.fecha_vencimiento}
                      onChange={e => setForm({ ...form, fecha_vencimiento: e.target.value })} />
                  </div>
                </>
              )}
              <div className="form-group form-full">
                <label className="form-label">Notas</label>
                <textarea className="form-textarea" placeholder="Opcional..."
                  value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-danger" onClick={() => { setShowModal(false); setEditItem(null) }}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : editItem ? 'Actualizar' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
