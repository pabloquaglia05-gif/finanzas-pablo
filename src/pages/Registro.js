import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0)
}

function exportToExcel(data, filename) {
  const headers = ['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto', 'Notas']
  const rows = data.map(m => [
    new Date(m.fecha).toLocaleDateString('es-AR'),
    m.descripcion, m.categoria, m.tipo, m.monto, m.notas || ''
  ])
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const EMPTY_FORM = {
  fecha: new Date().toISOString().split('T')[0],
  descripcion: '', categoria: '', tipo: 'Gasto', monto: '', notas: ''
}

export default function Registro() {
  const [movimientos, setMovimientos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth())
  const [filtroTipo, setFiltroTipo] = useState('Todos')

  const load = async () => {
    setLoading(true)
    const [{ data: mov }, { data: cats }] = await Promise.all([
      // Ordenar por fecha DESC para mostrar los más recientes primero
      supabase.from('movimientos').select('*').order('fecha', { ascending: false }).order('created_at', { ascending: false }),
      supabase.from('categorias').select('*').order('tipo').order('nombre')
    ])
    setMovimientos(mov || [])
    setCategorias(cats || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const movFiltrados = movimientos
    .filter(m => {
      const d = new Date(m.fecha)
      const okMes = d.getFullYear() === anio && d.getMonth() === mes
      const okTipo = filtroTipo === 'Todos' || m.tipo === filtroTipo
      return okMes && okTipo
    })
    // Asegurar orden por fecha DESC dentro del filtro
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const totalIngresos = movFiltrados.filter(m => m.tipo === 'Ingreso').reduce((a, b) => a + Number(b.monto), 0)
  const totalGastos = movFiltrados.filter(m => m.tipo === 'Gasto').reduce((a, b) => a + Number(b.monto), 0)

  const save = async () => {
    if (!form.fecha || !form.descripcion || !form.categoria || !form.monto) {
      return alert('Completá todos los campos obligatorios')
    }
    setSaving(true)
    const { error } = await supabase.from('movimientos').insert([{
      fecha: form.fecha, descripcion: form.descripcion,
      categoria: form.categoria, tipo: form.tipo,
      monto: Number(form.monto), notas: form.notas
    }])
    if (!error) { setShowModal(false); setForm(EMPTY_FORM); load() }
    setSaving(false)
  }

  const del = async (id) => {
    if (!window.confirm('¿Eliminar este movimiento?')) return
    await supabase.from('movimientos').delete().eq('id', id)
    load()
  }

  const handleExport = () => {
    const filename = `movimientos_${MESES[mes]}_${anio}.csv`
    exportToExcel(movFiltrados, filename)
  }

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Registro de Movimientos</div>
          <div className="page-subtitle">Ingresos y gastos ordenados por fecha</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }} onClick={handleExport}>
            📥 Exportar
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nuevo</button>
        </div>
      </div>

      {/* Selector mes */}
      <div className="month-selector">
        <button className="month-btn" onClick={() => { if (mes === 0) { setMes(11); setAnio(a => a - 1) } else setMes(m => m - 1) }}>‹</button>
        <span className="month-display">{MESES[mes]} {anio}</span>
        <button className="month-btn" onClick={() => { if (mes === 11) { setMes(0); setAnio(a => a + 1) } else setMes(m => m + 1) }}>›</button>
      </div>

      {/* Stats */}
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card green">
          <div className="stat-label">Ingresos</div>
          <div className="stat-value green">{fmt(totalIngresos)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Gastos</div>
          <div className="stat-value red">{fmt(totalGastos)}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Balance</div>
          <div className={`stat-value ${totalIngresos - totalGastos >= 0 ? 'green' : 'red'}`}>{fmt(totalIngresos - totalGastos)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="filters">
        <select className="filter-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
          <option value="Todos">Todos</option>
          <option value="Ingreso">Ingresos</option>
          <option value="Gasto">Gastos</option>
        </select>
        <span style={{ color: 'var(--text2)', fontSize: 14 }}>{movFiltrados.length} registros</span>
      </div>

      {/* Tabla */}
      {movFiltrados.length === 0 ? (
        <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">No hay movimientos este mes</div></div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Tipo</th><th>Monto</th><th>Notas</th><th></th>
            </tr></thead>
            <tbody>
              {movFiltrados.map(m => (
                <tr key={m.id}>
                  <td>{new Date(m.fecha).toLocaleDateString('es-AR')}</td>
                  <td>{m.descripcion}</td>
                  <td>{m.categoria}</td>
                  <td><span className={`badge ${m.tipo.toLowerCase()}`}>{m.tipo}</span></td>
                  <td><span className={m.tipo === 'Ingreso' ? 'monto-pos' : 'monto-neg'}>{fmt(m.monto)}</span></td>
                  <td style={{ color: 'var(--text2)', fontSize: 13 }}>{m.notas}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => del(m.id)}>🗑</button></td>
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
            <div className="modal-title">Nuevo movimiento</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input type="date" className="form-input" value={form.fecha}
                  onChange={e => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="form-select" value={form.tipo}
                  onChange={e => setForm({ ...form, tipo: e.target.value, categoria: '' })}>
                  <option value="Ingreso">Ingreso</option>
                  <option value="Gasto">Gasto</option>
                </select>
              </div>
              <div className="form-group form-full">
                <label className="form-label">Descripción *</label>
                <input type="text" className="form-input" placeholder="Ej: Sueldo enero"
                  value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría *</label>
                <select className="form-select" value={form.categoria}
                  onChange={e => setForm({ ...form, categoria: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {categorias.filter(c => c.tipo === form.tipo).map(c => (
                    <option key={c.id} value={c.nombre}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto *</label>
                <input type="number" className="form-input" placeholder="0.00"
                  value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} />
              </div>
              <div className="form-group form-full">
                <label className="form-label">Notas</label>
                <textarea className="form-textarea" placeholder="Opcional..."
                  value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-danger" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
