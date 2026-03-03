import React from 'react';
import './Hero.css';

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-background">
        <img 
          src="/assets/imagenes-decoracion/space-4984262.jpg" 
          alt="Background"
          className="hero-bg-image"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.style.opacity = '0.3';
          }}
        />
      </div>
      <div className="hero-content">
        <div className="hero-text">
          <h1 className="hero-title">Bienvenido/a a Maia Records</h1>
          <p className="hero-subtitle">
            Un espacio donde los artistas encuentran <span className="highlight">autenticidad</span> y <span className="highlight">verdad</span>
          </p>
          <p className="hero-description">
            Transformamos ideas en fonogramas orgánicos, honestos y profundamente humanos.
          </p>
          <button className="cta-button">Comenzar Tu Proyecto</button>
        </div>
        <div className="hero-visual">
          <div className="equalizer">
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
            <div className="bar"></div>
          </div>
          <p className="tagline">Desde el universo hasta tus oídos ✨</p>
        </div>
      </div>
    </section>
  );
}

