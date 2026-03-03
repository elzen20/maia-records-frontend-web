import React from 'react';
import './VisionMission.css';

export default function VisionMission() {
  return (
    <section id="vision" className="vision-mission">
      <div className="container">
        <h2 className="section-title">Visión & Misión</h2>
        <div className="vision-mission-grid">
          <div className="vision-card">
            <div className="card-header">
              <div className="card-icon">🎯</div>
              <h3>Visión</h3>
            </div>
            <p>
              Ser un estudio de grabación referente por su calidad profesional y su compromiso con la autenticidad sonora, donde cada artista encuentre un espacio confiable para materializar su esencia y transformar sus ideas en fonogramas orgánicos, reales y emocionalmente poderosos.
            </p>
          </div>

          <div className="mission-card">
            <div className="card-header">
              <div className="card-icon">🚀</div>
              <h3>Misión</h3>
            </div>
            <p>
              Acompañamos a cada artista en su proceso creativo, canalizando sus ideas y su sonoridad con un enfoque cercano, técnico y sensible. Buscamos capturar la pureza de cada proyecto, evitando la sobreproducción y priorizando la naturalidad del sonido.
            </p>
            <p style={{ marginTop: '20px' }}>
              Nuestra meta es ofrecer un entorno accesible, profesional y humano, donde la confianza y la calidad se fusionen para dar vida a grabaciones auténticas que conecten con el oyente.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
