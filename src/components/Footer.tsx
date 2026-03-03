import React from 'react';
import './Footer.css';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Maia Records</h4>
            <p>Desde el universo hasta tus oídos ✨</p>
          </div>
          <div className="footer-section">
            <h4>Navegación</h4>
            <ul>
              <li><a href="#about">Acerca de</a></li>
              <li><a href="#vision">Visión & Misión</a></li>
              <li><a href="#services">Servicios</a></li>
              <li><a href="#rentals">Renta de Instrumentos</a></li>
              <li><a href="#contact">Contacto</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Síguenos</h4>
            <div className="social-links">
              <a href="https://www.instagram.com/maia.records_/" target="_blank" rel="noopener noreferrer">📱 Instagram</a>
              <a href="https://www.facebook.com/maiarecords1/" target="_blank" rel="noopener noreferrer">👍 Facebook</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; {currentYear} Maia Records. Todos los derechos reservados.</p>
          <p>Hecho con <span className="heart">♥</span> y pasión por la música auténtica</p>
        </div>
      </div>
    </footer>
  );
}
