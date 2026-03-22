import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

function exportToCSV(categorias) {
  const headers = ['Nombre', 'Tipo']
  const rows = categorias.map(c => [c.nombre, c.tipo])
  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'categorias.csv'; a.click()
  URL.revokeObjectURL(url)
}

function downloadTemplate() {
  const template = `Nombre,Tipo
Sueldo,Ingreso
Freelance / Honorarios,Ingreso
Alquiler cobrado,Ingreso
Alimentación,Gasto
Transporte,Gasto
Salud,Gasto
Entretenimiento,Gasto`
  const blob = new Blob(['\uFEFF' + template], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'plantilla_categorias.csv'; a.click()
  URL.revokeObjectURL(url)
}

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const sep = lines[0].includes(';') ? ';' : ','
  const parseRow = line => {
    const cols = []; let cur = '', inQ = false
    for (let c of line) {
      if (c === '"') { inQ = !inQ }
      else if (c === sep && !inQ) { cols.push(cur.trim()); cur = '' }
      else cur += c
    }
    cols.push(cur.trim())
    return cols
  }
  const headers = parseRow(lines[0]).map(h => h.toLowerCase().trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i])
    if (cols.every(c => !c)) continue
    const getNombre = () => {
      const hi = headers.findIndex(h => h.includes('nombre') || h.includes('name') || h.includes('categ'))
      return hi >= 0 ? cols[hi] : cols[0]
    }
    const getTipo = () => {
      const hi = headers.findIndex(h => h.includes('tipo') || h.includes('type'))
      return hi >= 0 ? cols[hi] : cols[1]
    }
    rows.push({ nombre: (getNombre() || '').trim(), tipo: (getTipo() || '').trim() })
  }
  return rows
}

function parseTipo(str) {
  const s = String(str).toLowerCase().trim()
  if (s.includes('ingreso') || s === 'i') return 'Ingreso'
  if (s.includes('gasto') || s === 'g') return 'Gasto'
  return null
}

const EMPTY_FORM = { nombre: '', tipo: 'Gasto' }

export default function Categorias() {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState([]) // { nombre, tipo, estado: 'nuevo'|'duplicado'|'error', error? }
  const [importStep, setImportStep] = useState('upload')
  const fileRef = useRef()

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('categorias').select('*').order('tipo').order('nombre')
    setCategorias(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditItem(null); setForm(EMPTY_FORM); setShowModal(true) }
  const openEdit = (cat) => { setEditItem(cat); setForm({ nombre: cat.nombre, tipo: cat.tipo }); setShowModal(true) }

  const save = async () => {
    if (!form.nombre.trim()) return alert('Ingresá un nombre')
    const nombreLower = form.nombre.trim().toLowerCase()
    const duplicado = categorias.find(c =>
      c.nombre.toLowerCase() === nombreLower &&
      c.tipo === form.tipo &&
      (!editItem || c.id !== editItem.id)
    )
    if (duplicado) return alert(`Ya existe una categoría de ${form.tipo} llamada "${duplicado.nombre}"`)
    setSaving(true)
    if (editItem) {
      const { error } = await supabase.from('categorias').update({ nombre: form.nombre.trim(), tipo: form.tipo }).eq('id', editItem.id)
      if (error) alert('Error: ' + error.message)
    } else {
      const { error } = await supabase.from('categorias').insert([{ nombre: form.nombre.trim(), tipo: form.tipo }])
      if (error) alert('Error: ' + error.message)
    }
    setShowModal(false); setForm(EMPTY_FORM); setEditItem(null); load()
    setSaving(false)
  }

  const del = async (id) => {
    if (!window.confirm('¿Eliminar esta categoría?')) return
    await supabase.from('categorias').delete().eq('id', id)
    load()
  }

  // ── IMPORTAR ─────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      // Comparar con categorías existentes (case-insensitive)
      const existentes = categorias.map(c => c.nombre.toLowerCase().trim())
      const vistos = new Set() // para detectar duplicados dentro del mismo archivo

      const result = rows.map((r, i) => {
        if (!r.nombre) return { ...r, estado: 'error', error: 'nombre vacío' }
        const tipo = parseTipo(r.tipo)
        if (!tipo) return { ...r, estado: 'error', error: 'tipo debe ser Ingreso o Gasto' }
        const key = r.nombre.toLowerCase().trim()
        if (existentes.includes(key)) return { nombre: r.nombre, tipo, estado: 'duplicado', error: 'ya existe en la app' }
        if (vistos.has(key)) return { nombre: r.nombre, tipo, estado: 'duplicado', error: 'repetida en el archivo' }
        vistos.add(key)
        return { nombre: r.nombre, tipo, estado: 'nuevo' }
      })

      setPreview(result)
      setImportStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const confirmImport = async () => {
    const nuevas = preview.filter(r => r.estado === 'nuevo')
    if (nuevas.length === 0) return alert('No hay categorías nuevas para importar')
    setImporting(true)
    const { error } = await supabase.from('categorias').insert(
      nuevas.map(r => ({ nombre: r.nombre.trim(), tipo: r.tipo }))
    )
    if (!error) { setImportStep('done'); load() }
    else alert('Error: ' + error.message)
    setImporting(false)
  }

  const resetImport = () => {
    setPreview([]); setImportStep('upload'); setShowImport(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const ingresos = categorias.filter(c => c.tipo === 'Ingreso')
  const gastos = categorias.filter(c => c.tipo === 'Gasto')
  const nuevasCount = preview.filter(r => r.estado === 'nuevo').length
  const duplicadasCount = preview.filter(r => r.estado === 'duplicado').length
  const erroresCount = preview.filter(r => r.estado === 'error').length

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Categorías</div>
          <div className="page-subtitle">Administrá tus categorías de ingresos y gastos</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
            onClick={() => exportToCSV(categorias)}>📤 Exportar</button>
          <button className="btn" style={{ background: 'rgba(79,124,255,0.12)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
            onClick={() => { setImportStep('upload'); setShowImport(true) }}>📥 Importar</button>
          <button className="btn btn-primary" onClick={openNew}>+ Nueva</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="section-title" style={{ color: 'var(--green)' }}>📥 Ingresos ({ingresos.length})</div>
          {ingresos.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{c.nombre}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', border: 'none' }} onClick={() => openEdit(c)}>✏️</button>
                <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>🗑</button>
              </div>
            </div>
          ))}
          {ingresos.length === 0 && <div style={{ color: 'var(--text2)', fontSize: 14, padding: '20px 0' }}>Sin categorías</div>}
        </div>

        <div className="card">
          <div className="section-title" style={{ color: 'var(--red)' }}>📤 Gastos ({gastos.length})</div>
          {gastos.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{c.nombre}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm" style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', border: 'none' }} onClick={() => openEdit(c)}>✏️</button>
                <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>🗑</button>
              </div>
            </div>
          ))}
          {gastos.length === 0 && <div style={{ color: 'var(--text2)', fontSize: 14, padding: '20px 0' }}>Sin categorías</div>}
        </div>
      </div>

      {/* Modal nueva/editar */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">{editItem ? 'Editar categoría' : 'Nueva categoría'}</div>
            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" placeholder="Ej: Combustible"
                  value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} />
              </div>
              <div className="form-group form-full">
                <label className="form-label">Tipo *</label>
                <select className="form-select" value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}>
                  <option value="Ingreso">Ingreso</option>
                  <option value="Gasto">Gasto</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-danger" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : editItem ? 'Actualizar' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {showImport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && resetImport()}>
          <div className="modal" style={{ maxWidth: 580 }}>
            <div className="modal-title">📥 Importar categorías</div>

            {importStep === 'upload' && (
              <>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>El CSV debe tener estas columnas:</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--accent)' }}>Nombre | Tipo</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                    • <strong>Tipo</strong>: debe decir <strong>Ingreso</strong> o <strong>Gasto</strong><br/>
                    • Las categorías que ya existen se van a <strong>omitir automáticamente</strong>
                  </div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <button className="btn btn-sm" style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)' }}
                    onClick={downloadTemplate}>📋 Descargar plantilla</button>
                </div>
                <div style={{ border: '2px dashed var(--border)', borderRadius: 10, padding: 28, textAlign: 'center', marginBottom: 16 }}>
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
                {/* Resumen */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                  <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--green)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                    ✅ <strong>{nuevasCount}</strong> nuevas
                  </div>
                  <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid var(--yellow)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                    ⚠️ <strong>{duplicadasCount}</strong> duplicadas (se omiten)
                  </div>
                  {erroresCount > 0 && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                      ❌ <strong>{erroresCount}</strong> con errores
                    </div>
                  )}
                </div>

                <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th></tr></thead>
                    <tbody>
                      {preview.map((r, i) => (
                        <tr key={i} style={{ opacity: r.estado !== 'nuevo' ? 0.6 : 1 }}>
                          <td style={{ fontSize: 13 }}>{r.nombre}</td>
                          <td>
                            {r.tipo && <span className={`badge ${r.tipo === 'Ingreso' ? 'ingreso' : 'gasto'}`} style={{ fontSize: 11 }}>{r.tipo}</span>}
                          </td>
                          <td>
                            {r.estado === 'nuevo' && <span className="badge pagado" style={{ fontSize: 11 }}>✅ Nueva</span>}
                            {r.estado === 'duplicado' && <span className="badge pendiente" style={{ fontSize: 11 }}>⚠️ {r.error}</span>}
                            {r.estado === 'error' && <span className="badge gasto" style={{ fontSize: 11 }}>❌ {r.error}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="form-actions">
                  <button className="btn btn-danger" onClick={() => setImportStep('upload')}>← Volver</button>
                  <button className="btn btn-primary" onClick={confirmImport}
                    disabled={importing || nuevasCount === 0}>
                    {importing ? 'Importando...' : `Importar ${nuevasCount} categorías nuevas`}
                  </button>
                </div>
              </>
            )}

            {importStep === 'done' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>¡Importación exitosa!</div>
                <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 8 }}>
                  Se importaron <strong>{nuevasCount}</strong> categorías nuevas.
                </div>
                {duplicadasCount > 0 && (
                  <div style={{ fontSize: 13, color: 'var(--yellow)', marginBottom: 20 }}>
                    Se omitieron {duplicadasCount} duplicadas.
                  </div>
                )}
                <button className="btn btn-primary" onClick={resetImport}>Cerrar</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
