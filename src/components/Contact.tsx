import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import './Contact.css';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    message: ''
  });

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Guardar en Firestore
      await addDoc(collection(db, 'contacts'), {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        message: formData.message,
        timestamp: serverTimestamp(),
        status: 'new'
      });

      setSubmitted(true);
      setTimeout(() => {
        setFormData({ name: '', email: '', phone: '', message: '' });
        setSubmitted(false);
      }, 3000);
    } catch (err) {
      console.error('Error al enviar mensaje:', err);
      setError('Hubo un error al enviar tu mensaje. Por favor intenta de nuevo.');
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="contact">
      <div className="container">
        <h2 className="section-title">Contacta Con Nosotros</h2>
        <p className="contact-intro">
          ¿Listo/a para llevar tu proyecto al siguiente nivel? Ponte en contacto con nuestro equipo.
        </p>

        <div className="contact-content">
          <div className="contact-info">
            <div className="info-card">
              <div className="info-icon">📧</div>
              <h3>Email</h3>
              <p><a href="mailto:info@maiarecords.com">info@maiarecords.com</a></p>
            </div>
            <div className="info-card">
              <div className="info-icon">📱</div>
              <h3>Teléfono</h3>
              <p><a href="tel:+5218711369707">+52 1 871 136 9707</a></p>
            </div>
            <div className="info-card">
              <div className="info-icon">📍</div>
              <h3>Ubicación</h3>
              <p><a href="https://share.google/aVXIlhC3KGLX5m8et" target="_blank" rel="noopener noreferrer">Ver en Google Maps</a></p>
            </div>
            <div className="info-card">
              <div className="info-icon">💬</div>
              <h3>WhatsApp</h3>
              <p><a href="https://wa.me/5218711369707" target="_blank" rel="noopener noreferrer">Enviar Mensaje</a></p>
            </div>
            <div className="info-card">
              <div className="info-icon">🌐</div>
              <h3>En Línea</h3>
              <p>Síguenos en redes sociales</p>
            </div>
          </div>

          <form className="contact-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <input
                type="text"
                name="name"
                placeholder="Tu Nombre"
                value={formData.name}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="email"
                name="email"
                placeholder="Tu Email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <input
                type="tel"
                name="phone"
                placeholder="Tu Teléfono"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>
            <div className="form-group">
              <textarea
                name="message"
                placeholder="Cuéntanos sobre tu proyecto..."
                rows={5}
                value={formData.message}
                onChange={handleChange}
                required
              ></textarea>
            </div>
            <button type="submit" className="submit-button" disabled={loading}>
              {loading ? '⏳ Enviando...' : submitted ? '✓ Mensaje Enviado' : 'Enviar Mensaje'}
            </button>
            {error && <p className="error-message" style={{ color: '#ff4444', marginTop: '10px', textAlign: 'center' }}>{error}</p>}
          </form>
        </div>
      </div>
    </section>
  );
}
