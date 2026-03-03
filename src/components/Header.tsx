import React, { useState } from 'react';
import './Header.css';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    element?.scrollIntoView({ behavior: 'smooth' });
    setIsMenuOpen(false);
  };

  return (
    <header className="header">
      <div className="header-container">
        <div className="logo">
          <div className="logo-image">
            <img 
              src="/assets/Logos/logo-maia-01.png" 
              alt="Maia Records Logo"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.style.display = 'none';
              }}
            />
          </div>
          <div className="logo-text-group">
            <span className="logo-text">Maia Records</span>
            <span className="logo-tagline">Estudio de Grabación</span>
          </div>
        </div>

        <button 
          className="menu-toggle"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav className={`nav ${isMenuOpen ? 'open' : ''}`}>
          <button onClick={() => scrollToSection('about')} className="nav-link">Acerca de</button>
          <button onClick={() => scrollToSection('vision')} className="nav-link">Visión & Misión</button>
          <button onClick={() => scrollToSection('services')} className="nav-link">Servicios</button>
          <button onClick={() => scrollToSection('rentals')} className="nav-link">Renta</button>
          <button onClick={() => scrollToSection('contact')} className="nav-link">Contacto</button>
        </nav>
      </div>
    </header>
  );
}

