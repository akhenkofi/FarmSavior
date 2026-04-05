import React, { useState } from 'react'
import DisputeCenter from './DisputeCenter'

const DisputeButton = ({ role = 'buyer' }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open && (
        <div className='lightbox' style={{ background:'rgba(15,23,42,.55)', zIndex: 5400 }} onClick={() => setOpen(false)}>
          <div className='lightbox-inner' style={{ width:'100%', maxWidth:700, borderRadius:18, margin:'auto', position:'relative' }} onClick={(e) => e.stopPropagation()}>
            <div className='list-row' style={{ justifyContent:'space-between', padding:16 }}>
              <strong className='text-lg'>Disputes</strong>
              <button type='button' className='btn btn-light' onClick={() => setOpen(false)}>Close</button>
            </div>
            <DisputeCenter role={role} />
          </div>
        </div>
      )}
      <button
        type='button'
        className='btn'
        style={{
          position: 'fixed',
          bottom: 72,
          right: 18,
          background: '#c53030',
          color: '#fff',
          borderRadius: 999,
          padding: '12px 20px',
          zIndex: 5400,
          boxShadow: '0 6px 18px rgba(0,0,0,.3)'
        }}
        onClick={() => setOpen(true)}
      >
        Disputes
      </button>
    </>
  )
}

export default DisputeButton
