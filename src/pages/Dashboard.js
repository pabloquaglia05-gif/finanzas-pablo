import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const COLORS = ['#4f7cff','#22c55e','#f59e0b','#ef4444','#a78bfa','#38bdf8','#fb923c','#84cc16']

function fmt(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n || 0)
}

export default function Dashboard() {
  const [movimientos, setMovimientos] = useState([])
  const [tarjetas, setTarjetas] = useState([])
  const [loading, setLoading] = useState(true)
  const now = new Date()
  const [anio, setAnio] = useState(now.getFullYear())
  const [mes, setMes] = useState(now.getMonth())

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: mov }, { data: tc }] = await Promise.all([
        supabase.from('movimientos').select('*').order('fecha', { ascending: false }),
        supabase.from('tarjeta_credito').select('*')
      ])
      setMovimientos(mov || [])
      setTarjetas(tc || [])
      setLoading(false)
    }
    load()
  }, [])

  const mesStr = MESES[mes]
  const mesKey = `${mesStr}/${String(anio).slice(2)}`

  // Movimientos del mes
  const movMes = movimientos.filter(m => {
    const d = new Date(m.fecha + 'T12:00:00')
    return d.getFullYear() === anio && d.getMonth() === mes
  })

  // Tarjetas del mes (pagadas o pendientes — son gastos reales del mes)
  const tcMes = tarjetas.filter(t => t.mes_a_pagar === mesKey)
  const tcMesPendiente = tcMes.filter(t => t.estado === 'Pendiente').reduce((a, b) => a + Number(b.valor_cuota), 0)
  const tcMesPagado = tcMes.filter(t => t.estado === 'Pagado').reduce((a, b) => a + Number(b.valor_cuota), 0)
  const totalTC = tcMesPendiente + tcMesPagado

  // Totales del mes incluyendo tarjetas
  const ingresos = movMes.filter(m => m.tipo === 'Ingreso').reduce((a, b) => a + Number(b.monto), 0)
  const gastosMov = movMes.filter(m => m.tipo === 'Gasto').reduce((a, b) => a + Number(b.monto), 0)
  const gastosTotal = gastosMov + totalTC
  const balance = ingresos - gastosTotal
  const ahorro = ingresos > 0 ? ((ingresos - gastosTotal) / ingresos * 100).toFixed(1) : 0

  // Gastos por categoría (movimientos + tarjetas del mes)
  const porCat = {}
  movMes.filter(m => m.tipo === 'Gasto').forEach(m => {
    porCat[m.categoria] = (porCat[m.categoria] || 0) + Number(m.monto)
  })
  tcMes.forEach(t => {
    porCat[t.categoria] = (porCat[t.categoria] || 0) + Number(t.valor_cuota)
  })
  const catData = Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, value]) => ({ name, value }))

  // Gráfico 6 meses
  const anualData = []
  for (let i = 5; i >= 0; i--) {
    let m = mes - i
    let y = anio
    if (m < 0) { m += 12; y-- }
    const mk = `${MESES[m]}/${String(y).slice(2)}`
    const movs = movimientos.filter(mv => {
      const d = new Date(mv.fecha + 'T12:00:00')
      return d.getFullYear() === y && d.getMonth() === m
    })
    const tcMesG = tarjetas.filter(t => t.mes_a_pagar === mk)
    const gasTC = tcMesG.reduce((a, b) => a + Number(b.valor_cuota), 0)
    anualData.push({
      name: MESES[m].slice(0, 3),
      Ingresos: movs.filter(mv => mv.tipo === 'Ingreso').reduce((a, b) => a + Number(b.monto), 0),
      Gastos: movs.filter(mv => mv.tipo === 'Gasto').reduce((a, b) => a + Number(b.monto), 0) + gasTC,
    })
  }

  const ultimos = movimientos.slice(0, 5)

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header">
        <div className="page-title">Dashboard</div>
        <div className="page-subtitle">Resumen de tus finanzas</div>
      </div>

      {/* Selector mes */}
      <div className="month-selector">
        <button className="month-btn" onClick={() => { if (mes === 0) { setMes(11); setAnio(a => a - 1) } else setMes(m => m - 1) }}>‹</button>
        <span className="month-display">{MESES[mes]} {anio}</span>
        <button className="month-btn" onClick={() => { if (mes === 11) { setMes(0); setAnio(a => a + 1) } else setMes(m => m + 1) }}>›</button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-label">Ingresos del mes</div>
          <div className="stat-value green">{fmt(ingresos)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Gastos del mes</div>
          <div className="stat-value red">{fmt(gastosTotal)}</div>
          {totalTC > 0 && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>incl. {fmt(totalTC)} en tarjetas</div>}
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Balance</div>
          <div className={`stat-value ${balance >= 0 ? 'green' : 'red'}`}>{fmt(balance)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">% Ahorro</div>
          <div className={`stat-value ${Number(ahorro) >= 0 ? 'green' : 'red'}`}>{ahorro}%</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Tarjetas pendientes {mesStr}</div>
          <div className="stat-value blue">{fmt(tcMesPendiente)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Movimientos del mes</div>
          <div className="stat-value yellow">{movMes.length + tcMes.length}</div>
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div className="card">
          <div className="section-title">Últimos 6 meses</div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={anualData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis dataKey="name" tick={{ fill: '#8b91a8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#8b91a8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8 }} />
                <Bar dataKey="Ingresos" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Gastos por categoría</div>
          {catData.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name.slice(0, 10)} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false} fontSize={10}>
                    {catData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty"><div className="empty-text">Sin gastos este mes</div></div>
          )}
        </div>
      </div>

      {/* Últimos movimientos */}
      <div className="card">
        <div className="section-title">Últimos movimientos</div>
        {ultimos.length === 0 ? (
          <div className="empty"><div className="empty-icon">📭</div><div className="empty-text">No hay movimientos aún</div></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Fecha</th><th>Descripción</th><th>Categoría</th><th>Tipo</th><th>Monto</th>
              </tr></thead>
              <tbody>
                {ultimos.map(m => (
                  <tr key={m.id}>
                    <td>{new Date(m.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                    <td>{m.descripcion}</td>
                    <td>{m.categoria}</td>
                    <td><span className={`badge ${m.tipo.toLowerCase()}`}>{m.tipo}</span></td>
                    <td><span className={m.tipo === 'Ingreso' ? 'monto-pos' : 'monto-neg'}>{fmt(m.monto)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
