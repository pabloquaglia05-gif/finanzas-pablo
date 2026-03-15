import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const EMPTY_FORM = { nombre: '', tipo: 'Gasto' }

export default function Categorias() {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('categorias').select('*').order('tipo').order('nombre')
    setCategorias(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (!form.nombre.trim()) return alert('Ingresá un nombre')
    setSaving(true)
    const { error } = await supabase.from('categorias').insert([{ nombre: form.nombre.trim(), tipo: form.tipo }])
    if (!error) { setShowModal(false); setForm(EMPTY_FORM); load() }
    else alert('Error: ' + error.message)
    setSaving(false)
  }

  const del = async (id) => {
    if (!window.confirm('¿Eliminar esta categoría?')) return
    await supabase.from('categorias').delete().eq('id', id)
    load()
  }

  const ingresos = categorias.filter(c => c.tipo === 'Ingreso')
  const gastos = categorias.filter(c => c.tipo === 'Gasto')

  if (loading) return <div className="loading">Cargando...</div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="page-title">Categorías</div>
          <div className="page-subtitle">Administrá tus categorías de ingresos y gastos</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Nueva</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Ingresos */}
        <div className="card">
          <div className="section-title" style={{ color: 'var(--green)' }}>📥 Ingresos ({ingresos.length})</div>
          {ingresos.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{c.nombre}</span>
              <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>🗑</button>
            </div>
          ))}
          {ingresos.length === 0 && <div style={{ color: 'var(--text2)', fontSize: 14, padding: '20px 0' }}>Sin categorías</div>}
        </div>

        {/* Gastos */}
        <div className="card">
          <div className="section-title" style={{ color: 'var(--red)' }}>📤 Gastos ({gastos.length})</div>
          {gastos.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14 }}>{c.nombre}</span>
              <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}>🗑</button>
            </div>
          ))}
          {gastos.length === 0 && <div style={{ color: 'var(--text2)', fontSize: 14, padding: '20px 0' }}>Sin categorías</div>}
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-title">Nueva categoría</div>
            <div className="form-grid">
              <div className="form-group form-full">
                <label className="form-label">Nombre *</label>
                <input type="text" className="form-input" placeholder="Ej: Combustible" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div className="form-group form-full">
                <label className="form-label">Tipo *</label>
                <select className="form-select" value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}>
                  <option value="Ingreso">Ingreso</option>
                  <option value="Gasto">Gasto</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button className="btn btn-danger" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
