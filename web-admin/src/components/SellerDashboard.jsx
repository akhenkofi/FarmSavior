import React, { useEffect, useState } from 'react'
import { fetchSellerOrders } from '../services/api'

const SellerDashboard = () => {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const data = await fetchSellerOrders()
        setOrders(Array.isArray(data) ? data : (data?.orders || []))
      } catch (err) {
        setError('Unable to load seller orders. Please try again.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalEarnings = orders.reduce((sum, order) => sum + Number(order.seller_payout_amount || order.seller_net || 0), 0)
  const pendingPayouts = orders.filter(o => o.status === 'pending' || o.status === 'paid')
  const completedPayouts = orders.filter(o => o.status === 'completed')

  const formatCurrency = (value) => `${(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GHS`

  return (
    <section className='panel' style={{ marginTop: 20 }}>
      <h3>Seller earnings dashboard</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginTop: 10 }}>
        <div className='panel' style={{ padding: 12 }}>
          <div className='helper-text'>Total earnings</div>
          <strong>{formatCurrency(totalEarnings)}</strong>
        </div>
        <div className='panel' style={{ padding: 12 }}>
          <div className='helper-text'>Pending payouts</div>
          <strong>{pendingPayouts.length}</strong>
        </div>
        <div className='panel' style={{ padding: 12 }}>
          <div className='helper-text'>Completed payouts</div>
          <strong>{completedPayouts.length}</strong>
        </div>
      </div>
      {error && <div className='helper-text' style={{ color: 'red' }}>{error}</div>}
      {loading ? (
        <div className='helper-text'>Loading orders…</div>
      ) : (
        <div className='list' style={{ marginTop: 10 }}>
          <div className='list-row list-header' style={{ fontWeight: 700 }}>
            <span>Order</span>
            <span>Status</span>
            <span>Payout</span>
            <span>Platform fee</span>
          </div>
          {orders.map(order => (
            <div key={`seller-order-${order.id}`} className='list-row'>
              <span>#{order.id}</span>
              <span>{order.status}</span>
              <span>{formatCurrency(order.seller_payout_amount)}</span>
              <span>{formatCurrency(order.platform_fee_amount)}</span>
            </div>
          ))}
          {!orders.length && !loading && <div className='helper-text'>No seller orders yet.</div>}
        </div>
      )}
    </section>
  )
}

export default SellerDashboard
