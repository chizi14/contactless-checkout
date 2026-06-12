function Cart({ cart, total, onRemove, onClear, onPay }) {
  return (
    <div className="flex flex-col h-full">

      {/* Cart header */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-text-primary font-semibold text-base">
            Cart
          </h2>
          <span className="bg-accent-lighter text-accent text-xs font-semibold 
                           px-2.5 py-1 rounded-full">
            {cart.length} {cart.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full 
                          text-center">
            <div className="w-14 h-14 bg-surface rounded-2xl flex items-center 
                            justify-center mb-3">
              <svg className="w-7 h-7 text-text-muted" fill="none"
                   stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
            <p className="text-text-secondary font-medium text-sm">
              Cart is empty
            </p>
            <p className="text-text-muted text-xs mt-1">
              Scan an item to get started
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cart.map(item => (
              <div key={item.barcode}
                   className="flex items-center gap-3 bg-surface rounded-xl p-3">

                <div className="w-9 h-9 bg-accent-lighter rounded-lg 
                                flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-accent" fill="none"
                       stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round"
                          strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 
                          4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-text-primary text-sm font-medium truncate">
                    {item.name}
                  </p>
                  <p className="text-text-muted text-xs">
                    MWK {item.price.toLocaleString()} × {item.quantity}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-text-primary text-sm font-semibold">
                    MWK {(item.price * item.quantity).toLocaleString()}
                  </p>
                  <button
                    onClick={() => onRemove(item.barcode)}
                    className="w-6 h-6 rounded-full bg-danger-light 
                               flex items-center justify-center 
                               hover:opacity-80 transition-opacity"
                  >
                    <svg className="w-3 h-3 text-danger" fill="none"
                         stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round"
                            strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>

      {/* Cart footer */}
      <div className="px-5 py-4 border-t border-border space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-text-secondary text-sm">Subtotal</p>
          <p className="text-text-primary font-bold text-lg">
            MWK {total.toLocaleString()}
          </p>
        </div>

        <button
          onClick={onPay}
          disabled={cart.length === 0}
          className="w-full bg-accent text-white font-semibold py-3.5 
                     rounded-xl hover:bg-accent-light transition-colors 
                     disabled:opacity-40 disabled:cursor-not-allowed
                     flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor"
               viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 
                     11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 
                     10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-
                     2.052-.382-3.016z" />
          </svg>
          Tap Card to Pay
        </button>

        {cart.length > 0 && (
          <button
            onClick={onClear}
            className="w-full text-text-secondary text-sm py-2 hover:text-danger 
                       transition-colors"
          >
            Clear cart
          </button>
        )}
      </div>

    </div>
  )
}

export default Cart