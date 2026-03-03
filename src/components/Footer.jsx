import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="footer">
      <p className="footer-brand">🎵 Maia Records</p>
      <p className="footer-tagline">Where Music Comes Alive</p>
      <ul className="footer-links">
        <li><Link to="/">Home</Link></li>
        <li><Link to="/about">About</Link></li>
        <li><Link to="/artists">Artists</Link></li>
        <li><Link to="/work">Our Work</Link></li>
        <li><Link to="/courses">Courses</Link></li>
      </ul>
      <p className="footer-copy">
        &copy; {new Date().getFullYear()} Maia Records. All rights reserved.
      </p>
    </footer>
  )
}
