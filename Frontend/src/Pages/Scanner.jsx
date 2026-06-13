import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/library'
import api from '../API/Axios'

function Scanner() {
  const videoRef = useRef(null)
  const [lastScan, setLastScan] = useState('')
  const [message, setMessage] = useState('')
  const [scanning, setScanning] = useState(true)

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader()

    codeReader.decodeFromVideoDevice(null, videoRef.current, async (result, err) => {
      if (result) {
        const barcode = result.getText()

        if (barcode === lastScan) return
        setLastScan(barcode)

    try {
  const res = await api.get(`/products/${barcode}`)
  setMessage(`✓ Added: ${res.data.name} — MWK ${res.data.price.toLocaleString()}`)
  setTimeout(() => {
    setLastScan('')
    setMessage('')
  }, 2500)
   } catch (err) {
  setMessage(`✗ Product not found: ${barcode}`)
  setTimeout(() => {
    setLastScan('')
    setMessage('')
  }, 2500)
}

        setTimeout(() => {
          setLastScan('')
          setMessage('')
        }, 2500)
      }
    })

    return () => codeReader.reset()
  }, [lastScan])

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center
                    justify-center px-4">

      <div className="w-full max-w-sm">

        <div className="text-center mb-6">
          <h1 className="text-white text-xl font-bold">Barcode Scanner</h1>
          <p className="text-gray-400 text-sm mt-1">Point camera at item barcode</p>
        </div>

        <div className="relative rounded-2xl overflow-hidden bg-black
                        aspect-square mb-4">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
          />

          {/* Scanning overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-48 border-2 border-white border-opacity-60
                            rounded-xl relative">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4
                              border-l-4 border-green-400 rounded-tl-lg"></div>
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4
                              border-r-4 border-green-400 rounded-tr-lg"></div>
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4
                              border-l-4 border-green-400 rounded-bl-lg"></div>
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4
                              border-r-4 border-green-400 rounded-br-lg"></div>
            </div>
          </div>
        </div>

        {message && (
          <div className={`rounded-xl px-4 py-3 text-center text-sm font-medium
                          ${message.startsWith('✓')
                            ? 'bg-green-900 text-green-300'
                            : 'bg-red-900 text-red-300'
                          }`}>
            {message}
          </div>
        )}

        <p className="text-gray-600 text-xs text-center mt-4">
          Items are added to the kiosk cart automatically
        </p>
      </div>
    </div>
  )
}

export default Scanner