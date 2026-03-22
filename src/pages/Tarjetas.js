import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MESES_LIST = []
for (let y = 2025; y <= 2028; y++) MESES.forEach(m => MESES_LIST.push(`${m}/${String(y).slice(2)}`))

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0)
}

function siguienteMes(mesStr) {
  const [nombre, anio] = mesStr.split('/')
  const idx = MESES.indexOf(nombre)
  const y = parseInt(anio)
  if (idx === 11) return `Enero/${String(y + 1).padStart(2, '0')}`
  return `${MESES[idx + 1]}/${String(y).padStart(2, '0')}`
}

function exportToCSV(items) {
  const headers = ['Fecha Compra','Tarjeta','Descripcion','Categoria','Tipo de Pago','Monto Total','Cuotas','Valor Cuota','Mes a Pagar','Estado']
  const rows = items.map(i => [
    new Date(i.fecha_compra).toLocaleDateString('es-AR'),
    i.tarjeta, i.descripcion, i.categoria, i.tipo_pago,
    i.monto_total, i.cuotas, i.valor_cuota, i.mes_a_pagar, i.estado
  ])
  const csv = [headers, ...rows].map(r => r.join(';')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'tarjetas.csv'; a.click()
  URL.revokeObjectURL(url)
}

function downloadTemplate() {
  const t = `Fecha Compra;Tarjeta;Descripcion;Categoria;Tipo de Pago;Monto Total;Cuotas;Valor Cuota;Mes a Pagar;Estado
01/03/2026;BBVA;Supermercado;Alimentacion;Pago Unico;25000;1;25000;Abril/26;Pendiente
15/02/2026;BBVA;Zapatillas Nike;Ropa;Cuotas;30000;3;10000;Abril/26;Pendiente
15/02/2026;BBVA;Zapatillas Nike;Ropa;Cuotas;30000;3;10000;Mayo/26;Pendiente
15/02/2026;BBVA;Zapatillas Nike;Ropa;Cuotas;30000;3;10000;Junio/26;Pendiente`
  const blob = new Blob(['\uFEFF' + t], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'plantilla_tarjetas.csv'; a.click()
  URL.revokeObjectURL(url)
}

function parseDate(str) {
  if (!str) return null
  str = String(str).trim()
  let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (m) {
    const y = m[3].length === 2 ? '20' + m[3] : m[3]
    return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
  }
  if (str.match(/^\d{4}-\d{2}-\d{2}$/)) return str
  return null
}

function parseMonto(str) {
  if (!str) return null
  const n = Number(String(str).replace(/[$.]/g,'').replace(',','.').trim())
  return isNaN(n) ? null : Math.abs(n)
}

function parseTipoPago(str) {
  const s = String(str || '').toLowerCase().trim()
  if (s.includes('cuota')) return 'Cuotas'
  if (s.includes('nico') || s.includes('unico') || s.includes('pago') || s === 'u') return 'Pago Único'
  return 'Pago Único' // default
}

function parseTarjeta(str) {
  const s = String(str || '').toLowerCase().trim()
  if (s.includes('bbva')) return 'BBVA'
  if (s.includes('mercado') || s.includes('mp')) return 'Mercado Pago'
  return null
}

function parseEstado(str) {
  const s = String(str || '').toLowerCase().trim()
  if (s.includes('pagado')) return 'Pagado'
  return 'Pendiente'
}

// Accept any string that looks like a month/year
function parseMesAPagar(str) {
  if (!str) return null
  str = String(str).trim()
  if (!str) return null
  // Already valid format - just return it
  if (str.match(/^[A-Za-záéíóúÁÉÍÓÚ]+\/\d{2,4}$/)) return str
  // Try to build it
  const parts = str.split(/[\/\-\s]+/)
  if (parts.length >= 2) {
    const anio = parts[parts.length-1].length === 4 ? parts[parts.length-1].slice(2) : parts[parts.length-1]
    return parts[0] + '/' + anio
  }
  return str.length > 0 ? str : null
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
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const cols = parseRow(lines[i])
    if (cols.every(c => !c)) continue
    // Use position directly — more reliable than header matching
    rows.push({
      fecha_compra: cols[0] || '',
      tarjeta:      cols[1] || '',
      descripcion:  cols[2] || '',
      categoria:    cols[3] || '',
      tipo_pago:    cols[4] || '',
      monto_total:  cols[5] || '',
      cuotas:       cols[6] || '1',
      valor_cuota:  cols[7] || '',
      mes_a_pagar:  cols[8] || '',
      estado:       cols[9] || 'Pendiente',
    })
  }
  return rows
}

const now = new Date()
const MES_ACTUAL = `${MESES[now.getMonth()]}/${String(now.getFullYear()).slice(2)}`

const EMPTY_FORM = {
  fecha_compra: new Date().toISOString().split('T')[0],
  tarjeta: 'BBVA', descripcion: '', categoria: '',
  tipo_pago: 'Pago Único', monto_total: '', cuotas: 1,
  mes_inicio: MES_ACTUAL
}

export default function Tarjetas() {
  const [items, setItems] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState([])
  const [importStep, setImportStep] = useState('upload')
  const [filtroTarjeta, setFiltroTarjeta] = useState('Todas')
  const [filtroMes, setFiltroMes] = useState(MES_ACTUAL)
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [tab, setTab] = useState('lista')
  const [selected, setSelected] = useState(new Set())
  const fileRef = useRef()

  const load = async () => {
    setLoading(true)
    const [{ data: tc }, { data: cats }] = await Promise.all([
      supabase.from('tarjeta_credito').select('*').order('mes_a_pagar').order('fecha_compra'),
      supabase.from('categorias').select('*').order('nombre')
    ])
    setItems(tc || [])
    setCategorias(cats || [])
    setSelected(new Set())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtrados = items.filter(i => {
    const okTarjeta = filtroTarjeta === 'Todas' || i.tarjeta === filtroTarjeta
    const okMes = !filtroMes || i.mes_a_pagar === filtroMes
    const okEstado = filtroEstado === 'Todos' || i.estado === filtroEstado
    return okTarjeta && okMes && okEstado
  })

  const totalPendiente = filtrados.filter(i => i.estado === 'Pendiente').reduce((a, b) => a + Number(b.valor_cuota), 0)
  const totalPagado = filtrados.filter(i => i.estado === 'Pagado').reduce((a, b) => a + Number(b.valor_cuota), 0)

  const resumenMeses = {}
  items.filter(i => i.estado === 'Pendiente').forEach(i => {
    if (!resumenMeses[i.mes_a_pagar]) resumenMeses[i.mes_a_pagar] = { bbva: 0, mp: 0 }
    if (i.tarjeta === 'BBVA') resumenMeses[i.mes_a_pagar].bbva += Number(i.valor_cuota)
    else resumenMeses[i.mes_a_pagar].mp += Number(i.valor_cuota)
  })

  // ── NUEVA COMPRA ─────────────────────────────────────────────
  const openNew = () => { setEditItem(null); setForm(EMPTY_FORM); setShowModal(true) }

  const openEdit = (item) => {
    setEditItem(item)
    setForm({
      fecha_compra: item.fecha_compra,
      tarjeta: item.tarjeta,
      descripcion: item.descripcion,
      categoria: item.categoria,
      tipo_pago: item.tipo_pago,
      monto_total: item.monto_total,
      cuotas: item.cuotas,
      mes_inicio: item.mes_a_pagar,
      estado: item.estado
    })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.fecha_compra || !form.descripcion || !form.categoria || !form.monto_total) return alert('Completá todos los campos')
    setSaving(true)

    if (editItem) {
      // Editar registro existente
      const { error } = await supabase.from('tarjeta_credito').update({
        fecha_compra: form.fecha_compra,
        tarjeta: form.tarjeta,
        descripcion: form.descripcion,
        categoria: form.categoria,
        tipo_pago: form.tipo_pago,
        monto_total: Number(form.monto_total),
        cuotas: Number(form.cuotas),
        valor_cuota: Math.round((Number(form.monto_total) / Number(form.cuotas)) * 100) / 100,
        mes_a_pagar: form.mes_inicio,
        estado: form.estado || 'Pendiente'
      }).eq('id', editItem.id)
      if (!error) { setShowModal(false); setEditItem(null); setForm(EMPTY_FORM); load() }
      else alert('Error: ' + error.message)
    } else {
      // Nueva compra — generar una fila por cuota
      const numCuotas = form.tipo_pago === 'Cuotas' ? Number(form.cuotas) : 1
      const valorCuota = Math.round((Number(form.monto_total) / numCuotas) * 100) / 100
      const filas = []
      let mesActual = form.mes_inicio
      for (let n = 1; n <= numCuotas; n++) {
        filas.push({
          fecha_compra: form.fecha_compra, tarjeta: form.tarjeta,
          descripcion: numCuotas > 1 ? `${form.descripcion} (${n}/${numCuotas})` : form.descripcion,
          categoria: form.categoria, tipo_pago: form.tipo_pago,
          monto_total: Number(form.monto_total), cuotas: numCuotas,
          valor_cuota: valorCuota, mes_a_pagar: mesActual, estado: 'Pendiente'
        })
        mesActual = siguienteMes(mesActual)
      }
      const { error } = await supabase.from('tarjeta_credito').insert(filas)
      if (!error) { setShowModal(false); setForm(EMPTY_FORM); load() }
      else alert('Error: ' + error.message)
    }
    setSaving(false)
  }

  const toggleEstado = async (item) => {
    const nuevo = item.estado === 'Pendiente' ? 'Pagado' : 'Pendiente'
    await supabase.from('tarjeta_credito').update({ estado: nuevo }).eq('id', item.id)
    load()
  }

  // ── SELECCIÓN MÚLTIPLE ───────────────────────────────────────
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === filtrados.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtrados.map(i => i.id)))
    }
  }

  const deleteSelected = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`¿Eliminar ${selected.size} registro${selected.size > 1 ? 's' : ''}?`)) return
    const ids = Array.from(selected)
    await supabase.from('tarjeta_credito').delete().in('id', ids)
    load()
  }

  const del = async (id) => {
    if (!window.confirm('¿Eliminar esta cuota?')) return
    await supabase.from('tarjeta_credito').delete().eq('id', id)
    load()
  }

  // ── IMPORTAR ─────────────────────────────────────────────────
  const handleFile = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result)
      const result = rows.map(r => {
        const fecha = parseDate(r.fecha_compra)
        const tarjeta = parseTarjeta(r.tarjeta)
        const monto_total = parseMonto(r.monto_total)
        const valor_cuota = parseMonto(r.valor_cuota)
        const tipo_pago = parseTipoPago(r.tipo_pago)
        const mes_a_pagar = parseMesAPagar(r.mes_a_pagar)
        const errs = []
        if (!fecha) errs.push('fecha inválida')
        if (!tarjeta) errs.push('tarjeta debe ser BBVA o Mercado Pago')
        if (!monto_total) errs.push('monto total inválido')
        if (!valor_cuota) errs.push('valor cuota inválido')
        if (!r.descripcion?.trim()) errs.push('descripción vacía')
        if (!mes_a_pagar) errs.push('mes a pagar inválido')
        if (errs.length > 0) return { raw: r, estado_import: 'error', errores: errs }
        return {
          fecha_compra: fecha, tarjeta,
          descripcion: r.descripcion.trim(),
          categoria: r.categoria?.trim() || 'Otros Gastos',
          tipo_pago,
          monto_total,
          cuotas: Number(r.cuotas) || 1,
          valor_cuota,
          mes_a_pagar,
          estado: parseEstado(r.estado),
          estado_import: 'valido'
        }
      })
      setPreview(result)
      setImportStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }

  const confirmImport = async () => {
    const validos = preview.filter(r => r.estado_import === 'valido')
    if (validos.length === 0) return
    setImporting(true)
    const { error } = await supabase.from('tarjeta_credito').insert(
      validos.map(({ estado_import, raw, ...r }) => r)
    )
    if (!error) { setImportStep('done'); load() }
    else alert('Error: ' + error.message)
    setImporting(false)
  }

  const resetImport = () => {
    setPreview([]); setImportStep('upload'); setShowImport(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const validosCount = preview.filter(r => r.estado_import === 'valido').length
  const erroresCount = preview.filter(r => r.estado_import === 'error').length

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Tarjetas de Crédito</div>
          <div className="page-subtitle">BBVA y Mercado Pago</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' }}
            onClick={() => exportToCSV(filtrados)}>📤 Exportar</button>
          <button className="btn" style={{ background: 'rgba(79,124,255,0.12)', border: '1px solid var(--accent)', color: 'var(--accent)' }}
            onClick={() => { setImportStep('upload'); setShowImport(true) }}>📥 Importar</button>
          <button className="btn btn-primary" onClick={openNew}>+ Nueva compra</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['lista', 'resumen'].map(t => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : ''}`}
            style={tab !== t ? { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' } : {}}
            onClick={() => setTab(t)}>
            {t === 'lista' ? '📋 Lista' : '📊 Resumen por mes'}
          </button>
        ))}
      </div>

      {tab === 'lista' && <>
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <div className="stat-card yellow">
            <div className="stat-label">Pendiente (filtro)</div>
            <div className="stat-value yellow">{fmt(totalPendiente)}</div>
          </div>
          <div className="stat-card green">
            <div className="stat-label">Pagado (filtro)</div>
            <div className="stat-value green">{fmt(totalPagado)}</div>
          </div>
        </div>

        <div className="filters">
          <select className="filter-select" value={filtroTarjeta} onChange={e => setFiltroTarjeta(e.target.value)}>
            <option value="Todas">Todas las tarjetas</option>
            <option value="BBVA">BBVA</option>
            <option value="Mercado Pago">Mercado Pago</option>
          </select>
          <select className="filter-select" value={filtroMes} onChange={e => setFiltroMes(e.target.value)}>
            <option value="">Todos los meses</option>
            {[...new Set(items.map(i => i.mes_a_pagar))].sort((a, b) => {
                const MESES_ORD = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
                const [mA, yA] = a.split('/'); const [mB, yB] = b.split('/')
                return yA !== yB ? parseInt(yA) - parseInt(yB) : MESES_ORD.indexOf(mA) - MESES_ORD.indexOf(mB)
              }).map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select className="filter-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="Todos">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Pagado">Pagado</option>
          </select>
          <span style={{ color: 'var(--text2)', fontSize: 14 }}>{filtrados.length} registros</span>

          {/* Acciones selección múltiple */}
          {selected.size > 0 && (
            <button className="btn btn-danger btn-sm" onClick={deleteSelected}>
              🗑 Eliminar {selected.size} seleccionado{selected.size > 1 ? 's' : ''}
            </button>
          )}
        </div>

        {filtrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">💳</div><div className="empty-text">No hay registros con este filtro</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox"
                    checked={selected.size === filtrados.length && filtrados.length > 0}
                    onChange={toggleSelectAll}
                    style={{ cursor: 'pointer' }} />
                </th>
                <th>Fecha compra</th><th>Tarjeta</th><th>Descripción</th><th>Categoría</th>
                <th>Valor cuota</th><th>Mes a pagar</th><th>Estado</th><th></th>
              </tr></thead>
              <tbody>
                {filtrados.map(i => (
                  <tr key={i.id} style={{ background: selected.has(i.id) ? 'rgba(239,68,68,0.08)' : '' }}>
                    <td>
                      <input type="checkbox"
                        checked={selected.has(i.id)}
                        onChange={() => toggleSelect(i.id)}
                        style={{ cursor: 'pointer' }} />
                    </td>
                    <td>{new Date(i.fecha_compra).toLocaleDateString('es-AR')}</td>
                    <td><span className={`badge ${i.tarjeta === 'BBVA' ? 'bbva' : 'mp'}`}>{i.tarjeta}</span></td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descripcion}</td>
                    <td style={{ fontSize: 13, color: 'var(--text2)' }}>{i.categoria}</td>
                    <td><span className="monto-neg">{fmt(i.valor_cuota)}</span></td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{i.mes_a_pagar}</td>
                    <td>
                      <button className={`badge ${i.estado === 'Pendiente' ? 'pendiente' : 'pagado'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        onClick={() => toggleEstado(i)}>
                        {i.estado}
                      </button>
                    </td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-sm" style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', border: 'none' }}
                        onClick={() => openEdit(i)}>✏️</button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(i.id)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {tab === 'resumen' && (
        <div>
          <div className="section-title">Cuotas pendientes por mes</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Mes</th><th>BBVA</th><th>Mercado Pago</th><th>Total</th></tr></thead>
              <tbody>
                {Object.entries(resumenMeses).sort((a, b) => {
                  const parseMesSort = (s) => {
                    const parts = s.split('/')
                    const anio = parseInt(parts[parts.length - 1]) || 0
                    const mesNombre = parts[0].charAt(0).toUpperCase() + parts[0].slice(1).toLowerCase()
                    const normalize = x => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    const idx = MESES.findIndex(m => normalize(m).toLowerCase().startsWith(normalize(mesNombre).toLowerCase().slice(0, 3)))
                    return anio * 100 + (idx >= 0 ? idx : 99)
                  }
                  return parseMesSort(a[0]) - parseMesSort(b[0])
                }).map(([mes, val]) => (
                  <tr key={mes}>
                    <td style={{ fontWeight: 600 }}>{mes}</td>
                    <td><span className="monto-neg">{fmt(val.bbva)}</span></td>
                    <td><span className="monto-neg">{fmt(val.mp)}</span></td>
                    <td><span className="monto-neg" style={{ fontSize: 15, fontWeight: 700 }}>{fmt(val.bbva + val.mp)}</span></td>
                  </tr>
                ))}
                {Object.keys(resumenMeses).length === 0 && (
                  <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text2)', padding: 40 }}>¡No hay cuotas pendientes! 🎉</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal nueva / editar compra */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">{editItem ? 'Editar registro' : 'Nueva compra con tarjeta'}</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Fecha compra *</label>
                <input type="date" className="form-input" value={form.fecha_compra}
                  onChange={e => setForm({ ...form, fecha_compra: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Tarjeta *</label>
                <select className="form-select" value={form.tarjeta}
                  onChange={e => setForm({ ...form, tarjeta: e.target.value })}>
                  <option value="BBVA">BBVA</option>
                  <option value="Mercado Pago">Mercado Pago</option>
                </select>
              </div>
              <div className="form-group form-full">
                <label className="form-label">Descripción *</label>
                <input type="text" className="form-input" placeholder="Ej: Supermercado"
                  value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Categoría *</label>
                <select className="form-select" value={form.categoria}
                  onChange={e => setForm({ ...form, categoria: e.target.value })}>
                  <option value="">Seleccionar...</option>
                  {categorias.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de pago *</label>
                <select className="form-select" value={form.tipo_pago}
                  onChange={e => setForm({ ...form, tipo_pago: e.target.value, cuotas: 1 })}>
                  <option value="Pago Único">Pago Único</option>
                  <option value="Cuotas">Cuotas</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Monto total *</label>
                <input type="number" className="form-input" placeholder="0.00"
                  value={form.monto_total} onChange={e => setForm({ ...form, monto_total: e.target.value })} />
              </div>
              {form.tipo_pago === 'Cuotas' && <>
                <div className="form-group">
                  <label className="form-label">Nº de cuotas</label>
                  <input type="number" className="form-input" min="2" max="48"
                    value={form.cuotas} onChange={e => setForm({ ...form, cuotas: e.target.value })} />
                </div>
                {form.monto_total && Number(form.cuotas) > 1 && (
                  <div className="form-group">
                    <label className="form-label">Valor por cuota</label>
                    <div style={{ padding: '10px 12px', background: 'var(--bg3)', borderRadius: 8, fontFamily: 'DM Mono', fontWeight: 600, color: 'var(--accent)' }}>
                      {fmt(Number(form.monto_total) / Number(form.cuotas))}
                    </div>
                  </div>
                )}
              </>}
              <div className="form-group form-full">
                <label className="form-label">{editItem ? 'Mes a pagar' : 'Mes del primer pago'}</label>
                <select className="form-select" value={form.mes_inicio}
                  onChange={e => setForm({ ...form, mes_inicio: e.target.value })}>
                  {MESES_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {editItem && (
                <div className="form-group form-full">
                  <label className="form-label">Estado</label>
                  <select className="form-select" value={form.estado || 'Pendiente'}
                    onChange={e => setForm({ ...form, estado: e.target.value })}>
                    <option value="Pendiente">Pendiente</option>
                    <option value="Pagado">Pagado</option>
                  </select>
                </div>
              )}
              {!editItem && form.tipo_pago === 'Cuotas' && Number(form.cuotas) > 1 && (
                <div className="form-group form-full" style={{ background: 'rgba(79,124,255,0.08)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    ✅ Se van a crear <strong style={{ color: 'var(--accent)' }}>{form.cuotas} filas</strong> desde <strong style={{ color: 'var(--accent)' }}>{form.mes_inicio}</strong>
                  </div>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button className="btn btn-danger" onClick={() => { setShowModal(false); setEditItem(null) }}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : editItem ? 'Actualizar' : `Guardar${form.tipo_pago === 'Cuotas' && Number(form.cuotas) > 1 ? ` (${form.cuotas} cuotas)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal importar */}
      {showImport && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && resetImport()}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div className="modal-title">📥 Importar tarjetas</div>

            {importStep === 'upload' && (
              <>
                <div style={{ background: 'var(--bg3)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 6 }}>Columnas del CSV (separadas por punto y coma):</div>
                  <div style={{ fontFamily: 'DM Mono', fontSize: 11, color: 'var(--accent)', lineHeight: 1.8 }}>
                    Fecha Compra ; Tarjeta ; Descripcion ; Categoria ; Tipo de Pago ; Monto Total ; Cuotas ; Valor Cuota ; Mes a Pagar ; Estado
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 8 }}>
                    • <strong>Tarjeta:</strong> BBVA o Mercado Pago<br/>
                    • <strong>Tipo de Pago:</strong> Cuotas o Pago Unico<br/>
                    • <strong>Mes a Pagar:</strong> Abril/26, Mayo/26, etc.<br/>
                    • Cada cuota va en una fila separada con su mes
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
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                  <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid var(--green)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                    ✅ <strong>{validosCount}</strong> válidos
                  </div>
                  {erroresCount > 0 && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--red)', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                      ❌ <strong>{erroresCount}</strong> con errores
                    </div>
                  )}
                </div>
                {erroresCount > 0 && (
                  <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)', marginBottom: 6 }}>Filas con errores:</div>
                    {preview.filter(r => r.estado_import === 'error').map((r, i) => (
                      <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>
                        • {r.errores.join(', ')} — <em>{r.raw?.descripcion || r.raw?.fecha_compra}</em>
                      </div>
                    ))}
                  </div>
                )}
                <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
                  <table>
                    <thead><tr><th>Tarjeta</th><th>Descripción</th><th>Valor cuota</th><th>Mes</th><th>Estado</th></tr></thead>
                    <tbody>
                      {preview.filter(r => r.estado_import === 'valido').map((r, i) => (
                        <tr key={i}>
                          <td><span className={`badge ${r.tarjeta === 'BBVA' ? 'bbva' : 'mp'}`} style={{ fontSize: 11 }}>{r.tarjeta}</span></td>
                          <td style={{ fontSize: 12 }}>{r.descripcion}</td>
                          <td><span className="monto-neg" style={{ fontSize: 12 }}>{fmt(r.valor_cuota)}</span></td>
                          <td style={{ fontSize: 12, fontWeight: 600 }}>{r.mes_a_pagar}</td>
                          <td><span className={`badge ${r.estado === 'Pendiente' ? 'pendiente' : 'pagado'}`} style={{ fontSize: 11 }}>{r.estado}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions">
                  <button className="btn btn-danger" onClick={() => setImportStep('upload')}>← Volver</button>
                  <button className="btn btn-primary" onClick={confirmImport} disabled={importing || validosCount === 0}>
                    {importing ? 'Importando...' : `Importar ${validosCount} registros`}
                  </button>
                </div>
              </>
            )}

            {importStep === 'done' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>¡Importación exitosa!</div>
                <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24 }}>
                  Se importaron <strong>{validosCount}</strong> registros.
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
