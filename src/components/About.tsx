import React from 'react';
import './About.css';

export default function About() {
  return (
    <section id="about" className="about">
      <div className="container">
        <h2 className="section-title">¿Quiénes Somos?</h2>
        <div className="about-hero-image">
          <img 
            src="/assets/Logos/maia-logo-2-03.png" 
            alt="Maia Records - Identidad Visual"
            onError={(e) => {
              const img = e.target as HTMLImageElement;
              img.style.display = 'none';
            }}
          />
        </div>
        <div className="about-content">
          <div className="about-text">
            <p className="about-paragraph">
              En <strong>Maia Records</strong> creemos en la autenticidad, en la emoción real y en los sonidos que respiran verdad.
            </p>
            <p className="about-paragraph">
              Aquí, cada proyecto es tratado con cuidado, sensibilidad y criterio profesional, respetando tu esencia y potenciando tu identidad sonora.
            </p>
            <p className="about-paragraph">
              Te acompañamos de cerca en cada etapa del proceso creativo, transformando ideas en fonogramas orgánicos, honestos y profundamente humanos.
            </p>
            <p className="about-paragraph">
              Sin artificios innecesarios, sin fórmulas prefabricadas: solo música hecha con intención, técnica y alma.
            </p>
            <div className="about-highlight">
              <p>
                Si estás listo/a para darle forma a tu proyecto en un entorno confiable, accesible y comprometido con la calidad, este es tu lugar.
              </p>
            </div>
          </div>
          <div className="about-features">
            <div className="feature-card">
              <div className="feature-icon">🎵</div>
              <h3>Autenticidad</h3>
              <p>Capturamos la esencia real de tu música sin compromisos.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🤝</div>
              <h3>Cercanía</h3>
              <p>Acompañamiento personalizado en cada fase del proyecto.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">✨</div>
              <h3>Excelencia</h3>
              <p>Calidad profesional con sensibilidad artística.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
