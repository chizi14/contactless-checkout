function PaymentStatus({ state, data, message, onReset, onRetry }) {
  if (state === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-65px)]">
        <div className="w-20 h-20 border-4 border-accent-lighter border-t-accent rounded-full animate-spin mb-6"></div>
        <p className="text-text-primary font-semibold text-xl">Processing Payment</p>
        <p className="text-text-muted text-sm mt-2">Verifying card...</p>
      </div>
    )
  }

  if (state === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-65px)] px-4">
        <div className="bg-secondary rounded-2xl shadow-elevated border border-border w-full max-w-md p-8 text-center">

          <div className="w-20 h-20 bg-success-light rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-text-primary text-2xl font-bold mb-1">
            Payment Approved
          </h2>
          <p className="text-text-muted text-sm mb-6">
            Thank you, {data?.owner}
          </p>

          <div className="bg-surface rounded-xl p-4 mb-6 text-left space-y-2">
            {data?.items?.map((item, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-text-secondary text-sm">
                  {item.name} × {item.quantity}
                </span>
                <span className="text-text-primary text-sm font-medium">
                  MWK {(item.price * item.quantity).toLocaleString()}
                </span>
              </div>
            ))}
            <div className="border-t border-border pt-2 mt-2 flex justify-between">
              <span className="text-text-primary font-semibold">Total</span>
              <span className="text-accent font-bold text-lg">
                MWK {data?.total_amount?.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted text-sm">Remaining balance</span>
              <span className="text-text-secondary text-sm font-medium">
                MWK {Number(data?.balance_after || 0).toLocaleString()}
              </span>
            </div>
          </div>

          <p className="text-text-muted text-xs mb-6">
            Transaction ID: #{data?.transaction_id}
          </p>

          <button
            onClick={() => window.print()}
            className="w-full border border-border text-text-primary font-semibold py-3 rounded-xl hover:opacity-80 transition-opacity mb-3"
          >
            Print Receipt
          </button>

          <div id="receipt" style={{ fontFamily: 'monospace', fontSize: '12px', color: '#000' }}>
            <p style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>
              CONTACTLESS SELF CHECKOUT
            </p>
            <p style={{ textAlign: 'center' }}>Demo Store</p>
            <hr />
            <p>Receipt No: RCP-{String(data?.transaction_id).padStart(6, '0')}</p>
            <p>Date: {new Date(data?.created_at).toLocaleString('en-GB')}</p>
            <p>Customer: {data?.owner}</p>
            <p>Payment: RFID Card</p>
            <hr />
            {data?.items?.map((item, index) => (
              <div key={index} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{item.name} x{item.quantity}</span>
                <span>MWK {(item.price * item.quantity).toLocaleString()}</span>
              </div>
            ))}
            <hr />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
              <span>TOTAL</span>
              <span>MWK {data?.total_amount?.toLocaleString()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Balance left</span>
              <span>MWK {Number(data?.balance_after || 0).toLocaleString()}</span>
            </div>
            <hr />
            <p style={{ textAlign: 'center' }}>Thank you for shopping with us!</p>
          </div>

          <button
            onClick={onReset}
            className="w-full bg-accent text-white font-semibold py-3 rounded-xl hover:bg-accent-light transition-colors"
          >
            New Transaction
          </button>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-65px)] px-4">
        <div className="bg-secondary rounded-2xl shadow-elevated border border-border w-full max-w-md p-8 text-center">

          <div className="w-20 h-20 bg-danger-light rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h2 className="text-text-primary text-2xl font-bold mb-1">
            Payment Denied
          </h2>
          <p className="text-text-muted text-sm mb-6">
            {message || 'Payment could not be completed.'}
          </p>

          <button
            onClick={onRetry}
            className="w-full bg-danger text-white font-semibold py-3 rounded-xl hover:opacity-90 transition-opacity mb-3"
          >
            Try Again
          </button>
          <button
            onClick={onReset}
            className="w-full border border-border text-text-secondary font-medium py-3 rounded-xl hover:opacity-80 transition-opacity"
          >
            Cancel and Clear Cart
          </button>
        </div>
      </div>
    )
  }

  return null
}

export default PaymentStatus