import React from 'react';
import './LogoShowcase.css';

const logos = [
  '/assets/Logos/logo-maia-01.png',
  '/assets/Logos/logo-maia-02.png',
  '/assets/Logos/logo-maia-03.png',
  '/assets/Logos/logo-maia-04.png',
  '/assets/Logos/maia-logo-2-01.png',
  '/assets/Logos/maia-logo-2-04.png',
  '/assets/Logos/maia-logo-2-07.png',
  '/assets/Logos/maia-logo-2-10.png',
];

export default function LogoShowcase() {
  return (
    <section className="logo-showcase">
      <div className="container">
        <h2 className="section-title">Identidad Visual Maia Records</h2>
        <p className="showcase-intro">
          Diseños únicos que representan la esencia y creatividad de nuestro estudio
        </p>
        <div className="logos-grid">
          {logos.map((logo, index) => (
            <div key={index} className="logo-item">
              <div className="logo-card">
                <img 
                  src={logo} 
                  alt={`Logo Maia Records ${index + 1}`}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
