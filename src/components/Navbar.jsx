import { useState } from 'react'
import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/artists', label: 'Artists' },
  { to: '/work', label: 'Our Work' },
  { to: '/courses', label: 'Courses' },
]

export default function Navbar() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand" onClick={() => setOpen(false)}>
        🎵 Maia Records
      </NavLink>

      <button
        className="navbar-toggle"
        aria-label="Toggle navigation"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? '✕' : '☰'}
      </button>

      <ul className={`navbar-links${open ? ' open' : ''}`}>
        {links.map(({ to, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
              onClick={() => setOpen(false)}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
