import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0)
}

export default function ResumenAnual() {
  const [movimientos, setMovimientos] = useState([])
  const [tarjetas, setTarjetas] = useState([])
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [tab, setTab] = useState('mensual')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: mov }, { data: tc }] = await Promise.all([
        supabase.from('movimientos').select('*'),
        supabase.from('tarjeta_credito').select('*')
      ])
      setMovimientos(mov || [])
      setTarjetas(tc || [])
      setLoading(false)
    }
    load()
  }, [])

  const movAnio = movimientos.filter(m => new Date(m.fecha + 'T12:00:00').getFullYear() === anio)

  // Helper: gastos de tarjeta de un mes específico
  const gastosTC = (mesIdx) => {
    const mesKey = `${MESES[mesIdx]}/${String(anio).slice(2)}`
    return tarjetas
      .filter(t => t.mes_a_pagar === mesKey)
      .reduce((a, b) => a + Number(b.valor_cuota), 0)
  }

  // Datos mensuales incluyendo tarjetas
  const mensual = MESES.map((mes, idx) => {
    const movs = movAnio.filter(m => new Date(m.fecha + 'T12:00:00').getMonth() === idx)
    const ing = movs.filter(m => m.tipo === 'Ingreso').reduce((a, b) => a + Number(b.monto), 0)
    const gasMov = movs.filter(m => m.tipo === 'Gasto').reduce((a, b) => a + Number(b.monto), 0)
    const gasTC = gastosTC(idx)
    const gas = gasMov + gasTC
    return {
      mes: mes.slice(0, 3),
      Ingresos: ing,
      Gastos: gas,
      GastosMov: gasMov,
      GastosTC: gasTC,
      Balance: ing - gas,
      Ahorro: ing > 0 ? ((ing - gas) / ing * 100).toFixed(1) : 0
    }
  })

  const totalIng = mensual.reduce((a, b) => a + b.Ingresos, 0)
  const totalGas = mensual.reduce((a, b) => a + b.Gastos, 0)
  const totalGasMov = mensual.reduce((a, b) => a + b.GastosMov, 0)
  const totalGasTC = mensual.reduce((a, b) => a + b.GastosTC, 0)

  // Por categoría — movimientos + tarjetas
  const porCat = {}

  movAnio.forEach(m => {
    if (!porCat[m.categoria]) porCat[m.categoria] = { tipo: m.tipo, meses: Array(12).fill(0), total: 0 }
    const idx = new Date(m.fecha + 'T12:00:00').getMonth()
    porCat[m.categoria].meses[idx] += Number(m.monto)
    porCat[m.categoria].total += Number(m.monto)
  })

  // Agregar tarjetas a gastos por categoría
  tarjetas.forEach(t => {
    const [mesNombre, anioTC] = t.mes_a_pagar.split('/')
    if (parseInt(anioTC) + 2000 !== anio) return
    const idx = MESES.indexOf(mesNombre)
    if (idx === -1) return
    if (!porCat[t.categoria]) porCat[t.categoria] = { tipo: 'Gasto', meses: Array(12).fill(0), total: 0 }
    porCat[t.categoria].meses[idx] += Number(t.valor_cuota)
    porCat[t.categoria].total += Number(t.valor_cuota)
  })

  const catsIngreso = Object.entries(porCat).filter(([, v]) => v.tipo === 'Ingreso').sort((a, b) => b[1].total - a[1].total)
  const catsGasto = Object.entries(porCat).filter(([, v]) => v.tipo === 'Gasto').sort((a, b) => b[1].total - a[1].total)

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Resumen Anual</div>
          <div className="page-subtitle">Vista completa del año — incluye tarjetas de crédito</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', color: 'var(--text)', cursor: 'pointer', fontSize: 16 }} onClick={() => setAnio(a => a - 1)}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 18, minWidth: 50, textAlign: 'center' }}>{anio}</span>
          <button style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', color: 'var(--text)', cursor: 'pointer', fontSize: 16 }} onClick={() => setAnio(a => a + 1)}>›</button>
        </div>
      </div>

      {/* Totales */}
      <div className="stat-grid" style={{ marginBottom: 24 }}>
        <div className="stat-card green">
          <div className="stat-label">Total Ingresos {anio}</div>
          <div className="stat-value green">{fmt(totalIng)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Total Gastos {anio}</div>
          <div className="stat-value red">{fmt(totalGas)}</div>
          {totalGasTC > 0 && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>incl. {fmt(totalGasTC)} en tarjetas</div>}
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Balance anual</div>
          <div className={`stat-value ${totalIng - totalGas >= 0 ? 'green' : 'red'}`}>{fmt(totalIng - totalGas)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">% Ahorro anual</div>
          <div className="stat-value yellow">{totalIng > 0 ? ((totalIng - totalGas) / totalIng * 100).toFixed(1) : 0}%</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['mensual', 'categorias'].map(t => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : ''}`}
            style={tab !== t ? { background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--text2)' } : {}}
            onClick={() => setTab(t)}>
            {t === 'mensual' ? '📅 Por mes' : '🏷️ Por categoría'}
          </button>
        ))}
      </div>

      {tab === 'mensual' && <>
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-title">Ingresos vs Gastos (incl. tarjetas)</div>
          <div style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mensual} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis dataKey="mes" tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8b91a8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8 }} />
                <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Mes</th><th>Ingresos</th><th>Gastos Mov.</th><th>Tarjetas</th><th>Total Gastos</th><th>Balance</th><th>% Ahorro</th>
            </tr></thead>
            <tbody>
              {mensual.map((m, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{MESES[i]}</td>
                  <td><span className="monto-pos">{fmt(m.Ingresos)}</span></td>
                  <td><span className="monto-neg">{fmt(m.GastosMov)}</span></td>
                  <td><span className="monto-neg" style={{ opacity: m.GastosTC > 0 ? 1 : 0.3 }}>{fmt(m.GastosTC)}</span></td>
                  <td><span className="monto-neg" style={{ fontWeight: 700 }}>{fmt(m.Gastos)}</span></td>
                  <td><span className={m.Balance >= 0 ? 'monto-pos' : 'monto-neg'}>{fmt(m.Balance)}</span></td>
                  <td style={{ color: Number(m.Ahorro) >= 0 ? 'var(--green)' : 'var(--red)', fontFamily: 'DM Mono' }}>{m.Ahorro}%</td>
                </tr>
              ))}
              <tr style={{ borderTop: '2px solid var(--border)' }}>
                <td style={{ fontWeight: 700 }}>TOTAL</td>
                <td><span className="monto-pos" style={{ fontWeight: 700 }}>{fmt(totalIng)}</span></td>
                <td><span className="monto-neg" style={{ fontWeight: 700 }}>{fmt(totalGasMov)}</span></td>
                <td><span className="monto-neg" style={{ fontWeight: 700 }}>{fmt(totalGasTC)}</span></td>
                <td><span className="monto-neg" style={{ fontWeight: 700, fontSize: 15 }}>{fmt(totalGas)}</span></td>
                <td><span className={totalIng - totalGas >= 0 ? 'monto-pos' : 'monto-neg'} style={{ fontWeight: 700, fontSize: 15 }}>{fmt(totalIng - totalGas)}</span></td>
                <td style={{ fontFamily: 'DM Mono', fontWeight: 700 }}>{totalIng > 0 ? ((totalIng - totalGas) / totalIng * 100).toFixed(1) : 0}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </>}

      {tab === 'categorias' && <>
        <div className="section-title" style={{ color: 'var(--green)', marginBottom: 12 }}>📥 Ingresos por categoría</div>
        <div className="table-wrap" style={{ marginBottom: 24 }}>
          <table>
            <thead><tr>
              <th>Categoría</th>
              {MESES.map(m => <th key={m}>{m.slice(0, 3)}</th>)}
              <th>Total</th>
            </tr></thead>
            <tbody>
              {catsIngreso.map(([cat, val]) => (
                <tr key={cat}>
                  <td style={{ fontWeight: 600 }}>{cat}</td>
                  {val.meses.map((m, i) => (
                    <td key={i}>{m > 0 ? <span className="monto-pos" style={{ fontSize: 12 }}>{fmt(m)}</span> : <span style={{ color: 'var(--border)' }}>-</span>}</td>
                  ))}
                  <td><span className="monto-pos" style={{ fontWeight: 700 }}>{fmt(val.total)}</span></td>
                </tr>
              ))}
              {catsIngreso.length === 0 && <tr><td colSpan={14} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>Sin datos</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="section-title" style={{ color: 'var(--red)', marginBottom: 12 }}>📤 Gastos por categoría (incl. tarjetas)</div>
        <div className="table-wrap">
          <table>
            <thead><tr>
              <th>Categoría</th>
              {MESES.map(m => <th key={m}>{m.slice(0, 3)}</th>)}
              <th>Total</th>
            </tr></thead>
            <tbody>
              {catsGasto.map(([cat, val]) => (
                <tr key={cat}>
                  <td style={{ fontWeight: 600 }}>{cat}</td>
                  {val.meses.map((m, i) => (
                    <td key={i}>{m > 0 ? <span className="monto-neg" style={{ fontSize: 12 }}>{fmt(m)}</span> : <span style={{ color: 'var(--border)' }}>-</span>}</td>
                  ))}
                  <td><span className="monto-neg" style={{ fontWeight: 700 }}>{fmt(val.total)}</span></td>
                </tr>
              ))}
              {catsGasto.length === 0 && <tr><td colSpan={14} style={{ textAlign: 'center', color: 'var(--text2)', padding: 24 }}>Sin datos</td></tr>}
            </tbody>
          </table>
        </div>
      </>}
    </div>
  )
}
