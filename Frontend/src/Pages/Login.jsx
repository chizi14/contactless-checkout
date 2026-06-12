import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = () => {
    if (password === 'admin123') {
      localStorage.setItem('admin_auth', 'true')
      navigate('/admin')
    } else {
      setError('Incorrect password. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center px-4">
      <div className="bg-secondary rounded-2xl shadow-elevated w-full max-w-sm p-8 border border-border">

        <div className="flex items-center justify-center w-12 h-12 bg-accent-lighter 
                        rounded-xl mb-6 mx-auto">
          <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" 
               viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 
                     2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        <h1 className="text-text-primary text-2xl font-bold text-center">
          Admin Access
        </h1>
        <p className="text-text-secondary text-sm text-center mt-1 mb-6">
          Contactless Checkout System
        </p>

        <div className="space-y-3">
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="w-full bg-surface text-gray-900 placeholder-gray-400
           px-4 py-3 rounded-xl border border-border text-sm
           focus:outline-none focus:ring-2 focus:ring-accent-light 
           focus:border-transparent transition-all cursor-text"
          />

          {error && (
            <div className="bg-danger-light border border-danger border-opacity-20 
                            rounded-lg px-4 py-2">
              <p className="text-danger text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            className="w-full bg-accent text-white font-semibold py-3 rounded-xl 
                       hover:bg-accent-light transition-colors text-sm"
          >
            Sign In
          </button>
        </div>

        <p className="text-text-muted text-xs text-center mt-6">
          MUBAS — BIT/22/SS/013
        </p>
      </div>
    </div>
  )
}

export default Login