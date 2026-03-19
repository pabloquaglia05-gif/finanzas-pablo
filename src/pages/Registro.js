import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0)
}

function exportToCSV(data, filename) {
  const headers = ['Fecha', 'Descripción', 'Categoría', 'Tipo', 'Monto', 'Notas']
  const rows = data.map(m => [
    new Date(m.fecha).toLocaleDateString('es-AR'),
    m.descripcion, m.categoria, m.tipo, m.monto, m.notas || ''
  ])
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// Parsear fecha en múltiples formatos
function parseDate(str) {
  if (!str) return null
  str = String(str).trim()
  // DD/MM/YYYY o DD-MM-YYYY
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  }
  // YYYY-MM-DD
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return str
  // Número serial de Excel
  const n = Number(str)
  if (!isNaN(n) && n > 40000) {
    const d = new Date((n - 25569) * 86400 * 1000)
    return d.toISOString().split('T')[0]
  }
  return null
}

function parseMonto(str) {
  if (!str) return null
  const n = Number(String(str).replace(/[$.]/g, '').replace(',', '.').trim())
  return isNaN(n) ? null : Math.abs(n)
}

function parseTipo(str) {
  if (!str) return null
  const s = String(str).toLowerCase().trim()
  if (s.includes('ingreso') || s === 'i') return 'Ingreso'
  if (s.includes('gasto') || s === 'g') return 'Gasto'
  return null
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  // Detectar separador
  const sep = lines[0].includes(';') ? ';' : ','
  const parseRow = line => {
    const cols = []
    let cur = '', inQ = false
    for (let c of line) {
      if (c === '"') { inQ = !inQ }
      else if (c === sep && !inQ) { cols.push(cur.trim()); cur = '' }
      else cur += c
    }
    cols.push(cur.trim())
    return cols
  }
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().replace(/[^a-záéíóúñ]/g, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i])
    if (cols.every(c => !c)) continue
    // Mapear por headers o por posición
    const get = (names, idx) => {
      for (const n of names) {
        const hi = headers.findIndex(h => h.includes(n))
        if (hi >= 0 && cols[hi]) return cols[hi]
      }
      return cols[idx] || ''
    }
    rows.push({
      fecha:       get(['fecha','date','fec'], 0),
      descripcion: get(['desc','detalle','concepto','nombre'], 1),
      categoria:   get(['categ','cat'], 2),
      tipo:        get(['tipo','type'], 3),
      monto:       get(['monto','importe','amount','valor'], 4),
      notas:       get(['nota','obs','comment'], 5),
    })
  }
  return rows
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
  const [showImport, setShowImport] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState([])
  const [importErrors, setImportErrors] = useState([])
  const [importStep, setImportStep] = useState('upload') // upload | preview | done
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth())
  const [filtroTipo, setFiltroTipo] = useState('Todos')
  const fileRef = useRef()

  const load = async () => {
    setLoading(true)
    const [{ data: mov }, { data: cats }] = await Promise.all([
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
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const totalIngresos = movFiltrados.filter(m => m.tipo === 'Ingreso').reduce((a, b) => a + Number(b.monto), 0)
  const totalGastos = movFiltrados.filter(m => m.tipo === 'Gasto').reduce((a, b) => a + Number(b.monto), 0)

  const save = async () => {
    if (!form.fecha || !form.descripcion || !form.categoria || !form.monto) return alert('Completá todos los campos obligatorios')
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

  // ── IMPORTAR ────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const rows = parseCSV(text)
      const valid = [], errors = []
      rows.forEach((r, i) => {
        const fecha = parseDate(r.fecha)
        const monto = parseMonto(r.monto)
        const tipo = parseTipo(r.tipo)
        const errs = []
        if (!fecha) errs.push('fecha inválida')
        if (!monto) errs.push('monto inválido')
        if (!tipo) errs.push('tipo debe ser Ingreso o Gasto')
        if (!r.descripcion?.trim()) errs.push('descripción vacía')
        if (errs.length > 0) {
          errors.push({ fila: i + 2, errores: errs, datos: r })
        } else {
          valid.push({
            fecha, monto, tipo,
            descripcion: r.descripcion.trim(),
            categoria: r.categoria?.trim() || (tipo === 'Ingreso' ? 'Otros Ingresos' : 'Otros Gastos'),
            notas: r.notas?.trim() || ''
          })
        }
      })
      setPreview(valid)
      setImportErrors(errors)
      setImportStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const confirmImport = async () => {
    if (preview.length === 0) return
    setImporting(true)
    const { error } = await supabase.from('movimientos').insert(preview)
    if (!error) {
      setImportStep('done')
      load()
    } else {
      alert('Error al importar: ' + error.message)
    }
    setImporting(false)
  }

  const resetImport = () => {
    setPreview([])
    setImportErrors([])
    setImportStep('upload')
    setShowImport(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const downloadTemplate = () => {
    const template = `Fecha,Descripción,Categoría,Tipo,Monto,Notas
01/03/2026,Sueldo marzo,Sueldo,Ingreso,150000,
05/03/2026,Supermercado,Alimentación,Gasto,25000,Compra semanal
10/03/2026,Freelance proyecto,Freelance / Honorarios,Ingreso,80000,
15/03/2026,Netflix,Entretenimiento,Gasto,5000,`
    const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'plantilla_movimientos.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Registro de Movimientos</div>
          <div className="page-subtitle">Ingresos y gastos ordenados por fecha</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
            onClick={() => exportToCSV(movFiltrados, `movimientos_${MESES[mes]}_${anio}.csv`)}>
            📤 Exportar
          </button>
          <button className="btn" style={{ background: 'rgba(79,124,255,0.12)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
            onClick={() => { setImportStep('upload'); setShowImport(true) }}>
            📥 Importar
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

      {/* Modal nuevo movimiento */}
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
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {showImport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && resetImport()}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-title">📥 Importar movimientos</div>

            {importStep === 'upload' && (
              <>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>
                    El archivo CSV debe tener estas columnas en orden:
                  </div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--accent)' }}>
                    Fecha | Descripción | Categoría | Tipo | Monto | Notas
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                    • Fecha: DD/MM/YYYY o YYYY-MM-DD<br/>
                    • Tipo: debe decir exactamente <strong>Ingreso</strong> o <strong>Gasto</strong><br/>
                    • Categoría: si no existe se asigna "Otros"<br/>
                    • Notas: opcional
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <button className="btn btn-sm" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}
                    onClick={downloadTemplate}>
                    📋 Descargar plantilla
                  </button>
                </div>
                <div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 30, textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
                  <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 12 }}>Seleccioná tu archivo CSV</div>
                  <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleFile} />
                  <button className="btn btn-primary" onClick={() => fileRef.current.click()}>Elegir archivo</button>
                </div>
                <div className="form-actions">
                  <button className="btn btn-danger" onClick={resetImport}>Cancelar</button>
                </div>
              </>
            )}

            {importStep === 'preview' && (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                  <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--green)', borderRadius: 8, padding: '8px 16px', fontSize: 14 }}>
                    ✅ <strong>{preview.length}</strong> registros válidos
                  </div>
                  {importErrors.length > 0 && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 16px', fontSize: 14 }}>
                      ❌ <strong>{importErrors.length}</strong> con errores
                    </div>
                  )}
                </div>

                {importErrors.length > 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 6 }}>Filas con errores (no se importarán):</div>
                    {importErrors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                        Fila {e.fila}: {e.errores.join(', ')} — <em>{e.datos.descripcion || e.datos.fecha}</em>
                      </div>
                    ))}
                  </div>
                )}

                {preview.length > 0 && (
                  <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 16 }}>
                    <table>
                      <thead><tr><th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Tipo</th><th>Monto</th></tr></thead>
                      <tbody>
                        {preview.map((r, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: 12 }}>{new Date(r.fecha).toLocaleDateString('es-AR')}</td>
                            <td style={{ fontSize: 12 }}>{r.descripcion}</td>
                            <td style={{ fontSize: 12 }}>{r.categoria}</td>
                            <td><span className={`badge ${r.tipo.toLowerCase()}`} style={{ fontSize: 11 }}>{r.tipo}</span></td>
                            <td><span className={r.tipo === 'Ingreso' ? 'monto-pos' : 'monto-neg'} style={{ fontSize: 12 }}>{fmt(r.monto)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="form-actions">
                  <button className="btn btn-danger" onClick={() => setImportStep('upload')}>← Volver</button>
                  <button className="btn btn-primary" onClick={confirmImport} disabled={importing || preview.length === 0}>
                    {importing ? 'Importando...' : `Importar ${preview.length} registros`}
                  </button>
                </div>
              </>
            )}

            {importStep === 'done' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>¡Importación exitosa!</div>
                <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>
                  Se importaron <strong>{preview.length}</strong> movimientos correctamente.
                </div>
                <button className="btn btn-primary" onClick={resetImport}>Cerrar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
