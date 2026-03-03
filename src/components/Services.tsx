import React from 'react';
import './Services.css';

export default function Services() {
  const services = [
    {
      title: 'Grabación Profesional',
      description: 'Captura de audio de alta fidelidad con equipamiento de clase mundial en un ambiente acústicamente tratado.',
      icon: '🎤'
    },
    {
      title: 'Producción Musical',
      description: 'Desarrollo creativo de tus ideas con enfoque en autenticidad, destacando la esencia natural de tu sonido.',
      icon: '🎛️'
    },
    {
      title: 'Mezcla & Mastering',
      description: 'Refinamiento profesional del sonido con nitidez, profundidad y equilibrio para optimizar tu música.',
      icon: '✨'
    },
    {
      title: 'Arreglos Musicales',
      description: 'Composición y arreglos creativos que potencian tu identidad sonora sin perder autenticidad.',
      icon: '🎼'
    },
    {
      title: 'Consultoría Artística',
      description: 'Asesoramiento cercano en todas las fases creativas de tu proyecto para optimizar resultados.',
      icon: '💡'
    },
    {
      title: 'Post-Producción',
      description: 'Tratamiento final del audio, edición y preparación para distribución en todas las plataformas.',
      icon: '🎧'
    }
  ];

  return (
    <section id="services" className="services">
      <div className="container">
        <h2 className="section-title">Nuestros Servicios</h2>
        <p className="services-intro">
          Ofrecemos una suite completa de servicios de grabación y producción diseñados para artistas que buscan calidad profesional con toque humano.
        </p>
        <div className="services-grid">
          {services.map((service, index) => (
            <div key={index} className="service-card">
              <div className="service-icon">{service.icon}</div>
              <h3>{service.title}</h3>
              <p>{service.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
