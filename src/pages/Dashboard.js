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
  const movMes = movimientos.filter(m => {
    const d = new Date(m.fecha)
    return d.getFullYear() === anio && d.getMonth() === mes
  })

  const ingresos = movMes.filter(m => m.tipo === 'Ingreso').reduce((a, b) => a + Number(b.monto), 0)
  const gastos = movMes.filter(m => m.tipo === 'Gasto').reduce((a, b) => a + Number(b.monto), 0)
  const balance = ingresos - gastos
  const ahorro = ingresos > 0 ? ((ingresos - gastos) / ingresos * 100).toFixed(1) : 0

  // Tarjetas pendientes del mes
  const tcMes = tarjetas.filter(t => t.mes_a_pagar === `${mesStr}/${String(anio).slice(2)}` && t.estado === 'Pendiente')
  const totalTC = tcMes.reduce((a, b) => a + Number(b.valor_cuota), 0)

  // Gastos por categoría del mes
  const porCat = {}
  movMes.filter(m => m.tipo === 'Gasto').forEach(m => {
    porCat[m.categoria] = (porCat[m.categoria] || 0) + Number(m.monto)
  })
  const catData = Object.entries(porCat).sort((a,b) => b[1]-a[1]).slice(0,6).map(([name, value]) => ({ name, value }))

  // Resumen anual (últimos 6 meses)
  const anualData = []
  for (let i = 5; i >= 0; i--) {
    let m = mes - i
    let y = anio
    if (m < 0) { m += 12; y-- }
    const movs = movimientos.filter(mv => {
      const d = new Date(mv.fecha)
      return d.getFullYear() === y && d.getMonth() === m
    })
    anualData.push({
      name: MESES[m].slice(0,3),
      Ingresos: movs.filter(mv => mv.tipo === 'Ingreso').reduce((a,b) => a+Number(b.monto), 0),
      Gastos: movs.filter(mv => mv.tipo === 'Gasto').reduce((a,b) => a+Number(b.monto), 0),
    })
  }

  const prevMes = mes === 0 ? 11 : mes - 1
  const prevAnio = mes === 0 ? anio - 1 : anio
  const movPrev = movimientos.filter(m => {
    const d = new Date(m.fecha)
    return d.getFullYear() === prevAnio && d.getMonth() === prevMes
  })
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
        <button className="month-btn" onClick={() => { if (mes === 0) { setMes(11); setAnio(a=>a-1) } else setMes(m=>m-1) }}>‹</button>
        <span className="month-display">{MESES[mes]} {anio}</span>
        <button className="month-btn" onClick={() => { if (mes === 11) { setMes(0); setAnio(a=>a+1) } else setMes(m=>m+1) }}>›</button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card green">
          <div className="stat-label">Ingresos del mes</div>
          <div className="stat-value green">{fmt(ingresos)}</div>
        </div>
        <div className="stat-card red">
          <div className="stat-label">Gastos del mes</div>
          <div className="stat-value red">{fmt(gastos)}</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Balance</div>
          <div className={`stat-value ${balance >= 0 ? 'green' : 'red'}`}>{fmt(balance)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">% Ahorro</div>
          <div className={`stat-value ${ahorro >= 0 ? 'green' : 'red'}`}>{ahorro}%</div>
        </div>
        <div className="stat-card blue">
          <div className="stat-label">Tarjetas pendientes {mesStr}</div>
          <div className="stat-value blue">{fmt(totalTC)}</div>
        </div>
        <div className="stat-card yellow">
          <div className="stat-label">Movimientos del mes</div>
          <div className="stat-value yellow">{movMes.length}</div>
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
                <YAxis tick={{ fill: '#8b91a8', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#1a1d27', border: '1px solid #2e3347', borderRadius: 8 }} />
                <Bar dataKey="Ingresos" fill="#22c55e" radius={[4,4,0,0]} />
                <Bar dataKey="Gastos" fill="#ef4444" radius={[4,4,0,0]} />
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
                  <Pie data={catData} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => `${name.slice(0,10)} ${(percent*100).toFixed(0)}%`} labelLine={false} fontSize={10}>
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
                    <td>{new Date(m.fecha).toLocaleDateString('es-AR')}</td>
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
