import React, { useState } from 'react'
import SellerDashboard from './SellerDashboard'

const EarningsButton = () => {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open && (
        <div className='lightbox' style={{ background:'rgba(15,23,42,.45)', zIndex: 5200 }}>
          <div className='lightbox-inner' style={{ width:'100%', maxWidth:640, borderRadius:16, margin:'auto', position:'relative' }} onClick={e => e.stopPropagation()}>
            <div className='list-row' style={{ justifyContent:'space-between', padding:16 }}>
              <strong className='text-lg'>Seller Dashboard</strong>
              <button type='button' className='btn btn-light' onClick={() => setOpen(false)}>Close</button>
            </div>
            <SellerDashboard />
          </div>
        </div>
      )}
      <button
        type='button'
        className='btn'
        style={{
          position: 'fixed',
          bottom: 18,
          right: 18,
          background: '#B37F00',
          color: '#fff',
          borderRadius: 999,
          padding: '12px 20px',
          zIndex: 5300,
          boxShadow: '0 6px 18px rgba(0,0,0,.3)'
        }}
        onClick={() => setOpen(true)}
      >
        Earnings
      </button>
    </>
  )
}

export default EarningsButton
