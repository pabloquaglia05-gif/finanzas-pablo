import React, { useState, useEffect } from 'react'
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
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filtroTarjeta, setFiltroTarjeta] = useState('Todas')
  const [filtroMes, setFiltroMes] = useState(MES_ACTUAL)
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [tab, setTab] = useState('lista')

  const load = async () => {
    setLoading(true)
    const [{ data: tc }, { data: cats }] = await Promise.all([
      supabase.from('tarjeta_credito').select('*').order('mes_a_pagar').order('fecha_compra'),
      supabase.from('categorias').select('*').order('nombre')
    ])
    setItems(tc || [])
    setCategorias(cats || [])
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

  const save = async () => {
    if (!form.fecha_compra || !form.descripcion || !form.categoria || !form.monto_total) {
      return alert('Completá todos los campos obligatorios')
    }
    setSaving(true)
    const numCuotas = form.tipo_pago === 'Cuotas' ? Number(form.cuotas) : 1
    const valorCuota = Math.round((Number(form.monto_total) / numCuotas) * 100) / 100
    const montoTotal = Number(form.monto_total)
    const filas = []
    let mesActual = form.mes_inicio
    for (let n = 1; n <= numCuotas; n++) {
      filas.push({
        fecha_compra: form.fecha_compra,
        tarjeta: form.tarjeta,
        descripcion: numCuotas > 1 ? `${form.descripcion} (${n}/${numCuotas})` : form.descripcion,
        categoria: form.categoria,
        tipo_pago: form.tipo_pago,
        monto_total: montoTotal,
        cuotas: numCuotas,
        valor_cuota: valorCuota,
        mes_a_pagar: mesActual,
        estado: 'Pendiente'
      })
      mesActual = siguienteMes(mesActual)
    }
    const { error } = await supabase.from('tarjeta_credito').insert(filas)
    if (!error) { setShowModal(false); setForm(EMPTY_FORM); load() }
    else alert('Error: ' + error.message)
    setSaving(false)
  }

  const toggleEstado = async (item) => {
    const nuevo = item.estado === 'Pendiente' ? 'Pagado' : 'Pendiente'
    await supabase.from('tarjeta_credito').update({ estado: nuevo }).eq('id', item.id)
    load()
  }

  const del = async (id) => {
    if (!window.confirm('¿Eliminar esta cuota?')) return
    await supabase.from('tarjeta_credito').delete().eq('id', id)
    load()
  }

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Tarjetas de Crédito</div>
          <div className="page-subtitle">BBVA y Mercado Pago — cada cuota en su mes</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nueva compra</button>
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
            {[...new Set(items.map(i => i.mes_a_pagar))].sort().map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select className="filter-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
            <option value="Todos">Todos</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Pagado">Pagado</option>
          </select>
          <span style={{ color: 'var(--text2)', fontSize: 14 }}>{filtrados.length} registros</span>
        </div>

        {filtrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">💳</div><div className="empty-text">No hay registros con este filtro</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Fecha compra</th><th>Tarjeta</th><th>Descripción</th><th>Categoría</th>
                <th>Valor cuota</th><th>Mes a pagar</th><th>Estado</th><th></th>
              </tr></thead>
              <tbody>
                {filtrados.map(i => (
                  <tr key={i.id}>
                    <td>{new Date(i.fecha_compra).toLocaleDateString('es-AR')}</td>
                    <td><span className={`badge ${i.tarjeta === 'BBVA' ? 'bbva' : 'mp'}`}>{i.tarjeta}</span></td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.descripcion}</td>
                    <td style={{ fontSize: 13, color: 'var(--text2)' }}>{i.categoria}</td>
                    <td><span className="monto-neg">{fmt(i.valor_cuota)}</span></td>
                    <td style={{ fontSize: 13, fontWeight: 600 }}>{i.mes_a_pagar}</td>
                    <td>
                      <button className={`badge ${i.estado === 'Pendiente' ? 'pendiente' : 'pagado'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        onClick={() => toggleEstado(i)}
                        title="Clic para cambiar estado">
                        {i.estado}
                      </button>
                    </td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => del(i.id)}>🗑</button></td>
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
                  const [mA, yA] = a[0].split('/'); const [mB, yB] = b[0].split('/')
                  return yA !== yB ? yA - yB : MESES.indexOf(mA) - MESES.indexOf(mB)
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

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">Nueva compra con tarjeta</div>
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
                <input type="text" className="form-input" placeholder="Ej: Supermercado Día"
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
                <label className="form-label">Mes del primer pago</label>
                <select className="form-select" value={form.mes_inicio}
                  onChange={e => setForm({ ...form, mes_inicio: e.target.value })}>
                  {MESES_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {form.tipo_pago === 'Cuotas' && Number(form.cuotas) > 1 && (
                <div className="form-group form-full" style={{ background: 'rgba(79,124,255,0.08)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    ✅ Se van a crear <strong style={{ color: 'var(--accent)' }}>{form.cuotas} filas</strong> automáticamente,
                    una por mes desde <strong style={{ color: 'var(--accent)' }}>{form.mes_inicio}</strong>
                  </div>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button className="btn btn-danger" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Guardando...' : `Guardar${form.tipo_pago === 'Cuotas' && Number(form.cuotas) > 1 ? ` (${form.cuotas} cuotas)` : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
