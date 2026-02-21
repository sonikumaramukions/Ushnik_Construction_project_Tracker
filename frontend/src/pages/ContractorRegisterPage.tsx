import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

export function ContractorRegisterPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)
    try {
      await api.post('/auth/register/contractor/', {
        username,
        email,
        password,
      })
      setSuccess('Registration successful. You can now log in as a contractor.')
      setTimeout(() => navigate('/login/contractor', { replace: true }), 600)
    } catch (err) {
      console.error(err)
      setError('Registration failed. Try a different username/email.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 md:p-8 relative font-sans text-construction-text bg-construction-bg">
      {/* Global background pattern from index.css is on body */}

      <div className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 bg-white rounded-sm shadow-2xl overflow-hidden border-4 border-construction-concrete relative z-10">

        {/* Left Panel - Dark Info */}
        <div className="bg-construction-asphalt p-8 md:p-12 text-white flex flex-col justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-10 pointer-events-none"></div>

          <div className="relative z-10">
            <div className="inline-block px-3 py-1 rounded-sm bg-construction-yellow text-construction-asphalt text-xs font-bold uppercase tracking-widest mb-6">
              Partner Network
            </div>
            <h1 className="text-3xl md:text-4xl font-bold font-header uppercase tracking-wide leading-none mb-2 text-white">
              Contractor Registration
            </h1>
            <p className="text-construction-concrete font-bold text-sm tracking-wide uppercase border-l-4 border-construction-yellow pl-3 mb-8">
              External Access
            </p>

            <p className="text-gray-300 text-sm leading-relaxed mb-6">
              Contractors can self-register to view published requirement sheets and submit bids.
              Your actions are tracked in the audit history.
            </p>

            <ul className="space-y-3 text-sm text-gray-400">
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-construction-yellow rounded-full"></div>
                <span>Secure Bidding Portal</span>
              </li>
              <li className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 bg-construction-yellow rounded-full"></div>
                <span>Document Access</span>
              </li>
            </ul>
          </div>

          <div className="relative z-10 mt-12 bg-white/5 p-4 rounded-sm border border-white/10">
            <div className="text-xs font-bold text-construction-yellow uppercase tracking-wider mb-2">Existing Partner?</div>
            <Link to="/login/contractor" className="text-xs font-bold text-white hover:underline underline-offset-4 decoration-construction-yellow">
              Go to Contractor Login &rarr;
            </Link>
          </div>
        </div>

        {/* Right Panel - Register Form */}
        <div className="bg-white p-8 md:p-12 flex flex-col justify-center">
          <form onSubmit={onSubmit} className="space-y-6 max-w-sm mx-auto w-full">
            <div>
              <label htmlFor="username" className="block text-xs font-bold uppercase text-construction-asphalt tracking-wider mb-2">Username</label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                className="w-full rounded-sm border-2 border-construction-concrete bg-white px-4 py-3 text-sm text-construction-asphalt font-bold focus:border-construction-asphalt focus:outline-none transition-colors placeholder-gray-400"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                required
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-xs font-bold uppercase text-construction-asphalt tracking-wider mb-2">Email Address</label>
              <input
                id="email"
                type="email"
                className="w-full rounded-sm border-2 border-construction-concrete bg-white px-4 py-3 text-sm text-construction-asphalt font-bold focus:border-construction-asphalt focus:outline-none transition-colors placeholder-gray-400"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-bold uppercase text-construction-asphalt tracking-wider mb-2">Password</label>
              <input
                id="password"
                type="password"
                className="w-full rounded-sm border-2 border-construction-concrete bg-white px-4 py-3 text-sm text-construction-asphalt font-bold focus:border-construction-asphalt focus:outline-none transition-colors placeholder-gray-400"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                required
              />
            </div>

            {error && <div className="p-3 bg-red-50 border border-red-200 rounded-sm text-xs font-bold text-red-600">{error}</div>}
            {success && <div className="p-3 bg-green-50 border border-green-200 rounded-sm text-xs font-bold text-green-600">{success}</div>}

            <button
              className="w-full rounded-sm bg-construction-yellow border-2 border-black px-4 py-3 text-sm font-bold text-construction-asphalt uppercase tracking-wider shadow-[4px_4px_0px_#000] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_#000] active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all disabled:opacity-50 mt-2 font-header"
              disabled={loading}
              type="submit"
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
