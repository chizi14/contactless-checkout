function PaymentStatus({ state, data, onReset }) {
  if (state === 'processing') {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-65px)]">
        <div className="w-20 h-20 border-4 border-accent-lighter border-t-accent 
                        rounded-full animate-spin mb-6">
        </div>
        <p className="text-text-primary font-semibold text-xl">Processing Payment</p>
        <p className="text-text-muted text-sm mt-2">Verifying card...</p>
      </div>
    )
  }

  if (state === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center 
                      h-[calc(100vh-65px)] px-4">
        <div className="bg-secondary rounded-2xl shadow-elevated border 
                        border-border w-full max-w-md p-8 text-center">

          <div className="w-20 h-20 bg-success-light rounded-full flex items-center 
                          justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-accent" fill="none"
                 stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M5 13l4 4L19 7" />
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
          </div>

          <p className="text-text-muted text-xs mb-6">
            Transaction ID: #{data?.transaction_id}
          </p>

          <button
            onClick={onReset}
            className="w-full bg-accent text-white font-semibold py-3 
                       rounded-xl hover:bg-accent-light transition-colors"
          >
            New Transaction
          </button>
        </div>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center 
                      h-[calc(100vh-65px)] px-4">
        <div className="bg-secondary rounded-2xl shadow-elevated border 
                        border-border w-full max-w-md p-8 text-center">

          <div className="w-20 h-20 bg-danger-light rounded-full flex items-center 
                          justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-danger" fill="none"
                 stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h2 className="text-text-primary text-2xl font-bold mb-1">
            Payment Denied
          </h2>
          <p className="text-text-muted text-sm mb-6">
            Card not recognised. Please use a registered card.
          </p>

          <button
            onClick={onReset}
            className="w-full bg-danger text-white font-semibold py-3 
                       rounded-xl hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }
}

export default PaymentStatus