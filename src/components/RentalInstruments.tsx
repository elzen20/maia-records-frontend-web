import { useState, useRef, useEffect } from 'react';
import './RentalInstruments.css';

interface DrumKit {
  name: string;
  description: string;
  images: string[];
  videos: string[];
  price?: string;
}

export default function RentalInstruments() {
  const [selectedKit, setSelectedKit] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'images' | 'videos'>('images');
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const getSafeMediaUrl = (mediaPath: string) => encodeURI(mediaPath);
  const getFlatMediaUrl = (mediaPath: string) => {
    const fileName = mediaPath.split('/').pop() ?? mediaPath;
    return `/assets/${encodeURIComponent(fileName)}`;
  };

  // Reset video refs cuando cambia kit o viewMode
  useEffect(() => {
    videoRefs.current.forEach((video) => {
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
    });
  }, [selectedKit, viewMode]);

  const handleVideoPlay = (index: number) => {
    // Pausar todos los otros videos
    videoRefs.current.forEach((video, i) => {
      if (i !== index && video) {
        video.pause();
      }
    });
  };

  const drumKits: DrumKit[] = [
    {
      name: 'Pearl Acrílico',
      description: 'Batería profesional de acrílico con sonoridad cálida y resonante',
      images: [
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2318.JPG',
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2319.JPG',
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2320.JPG',
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2321.JPG',
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2322.JPG',
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2323.JPG',
      ],
      videos: [
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2326.mp4',
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2327.mp4',
        '/assets/Renta de instrumentos al capturar/Baterías/pearl acrilico/IMG_2328.mp4',
      ],
      price: 'Consultar tarifa'
    },
    {
      name: 'Pearl Vintage',
      description: 'Batería clásica Pearl con sonido vintage auténtico',
      images: [
        '/assets/Renta de instrumentos al capturar/Baterías/Pearl vintage/IMG_1978.JPG',
        '/assets/Renta de instrumentos al capturar/Baterías/Pearl vintage/IMG_1981.JPG',
      ],
      videos: [],
      price: 'Consultar tarifa'
    },
    {
      name: 'Tarolas Profesionales',
      description: 'Diversas tarolas de calidad studio',
      images: [
        '/assets/Renta de instrumentos al capturar/Baterías/Tarolas/IMG-20250915-WA0010.jpg',
        '/assets/Renta de instrumentos al capturar/Baterías/Tarolas/IMG-20250915-WA0011.jpg',
        '/assets/Renta de instrumentos al capturar/Baterías/Tarolas/IMG-20250915-WA0012.jpg',
        '/assets/Renta de instrumentos al capturar/Baterías/Tarolas/IMG-20250915-WA0013.jpg',
        '/assets/Renta de instrumentos al capturar/Baterías/Tarolas/IMG-20250915-WA0014.jpg',
      ],
      videos: [],
      price: 'Desde $50/día'
    },
    {
      name: 'Mapex',
      description: 'Batería de calidad profesional Mapex',
      images: [
        '/assets/Renta de instrumentos al capturar/Baterías/Mapex.jpeg',
      ],
      videos: [],
      price: 'Consultar tarifa'
    },
    {
      name: 'Gretsch',
      description: 'Batería Gretsch con sonoridad profesional',
      images: [
        '/assets/Renta de instrumentos al capturar/Baterías/Gretch.jpeg',
        '/assets/Renta de instrumentos al capturar/Baterías/Gretch 2.jpeg',
      ],
      videos: [],
      price: 'Consultar tarifa'
    },
  ];

  const activeKit = selectedKit 
    ? drumKits.find(kit => kit.name === selectedKit)
    : null;

  const activeMedia = activeKit 
    ? (viewMode === 'images' ? activeKit.images : activeKit.videos)
    : [];

  return (
    <section id="rentals" className="rental-instruments">
      <div className="container">
        <h2 className="section-title">🥁 Renta de Instrumentos al Capturar</h2>
        <p className="rental-intro">
          Acceso a instrumentos de calidad profesional para tus sesiones de grabación
        </p>

        <div className="rental-content">
          {/* Selector de Kits */}
          <div className="kits-selector">
            <h3>Nuestros Instrumentos</h3>
            <div className="kits-list">
              {drumKits.map((kit) => (
                <button
                  key={kit.name}
                  className={`kit-button ${selectedKit === kit.name ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedKit(kit.name);
                    setViewMode('images');
                  }}
                >
                  <span className="kit-name">{kit.name}</span>
                  <span className="kit-price">{kit.price}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Galería */}
          {activeKit && (
            <div className="gallery-section">
              <div className="gallery-header">
                <div className="gallery-info">
                  <h3>{activeKit.name}</h3>
                  <p>{activeKit.description}</p>
                </div>
                {activeKit.videos.length > 0 && (
                  <div className="view-toggle">
                    <button
                      className={`toggle-btn ${viewMode === 'images' ? 'active' : ''}`}
                      onClick={() => setViewMode('images')}
                    >
                      📷 Fotos
                    </button>
                    <button
                      className={`toggle-btn ${viewMode === 'videos' ? 'active' : ''}`}
                      onClick={() => setViewMode('videos')}
                    >
                      🎥 Videos
                    </button>
                  </div>
                )}
              </div>

              <div className="gallery-grid">
                {activeMedia.length > 0 ? (
                  activeMedia.map((media, index) => (
                    <div key={index} className="gallery-item">
                      {viewMode === 'images' ? (
                        <img 
                          src={getSafeMediaUrl(media)} 
                          data-fallback-src={getFlatMediaUrl(media)}
                          alt={`${activeKit.name} - imagen ${index + 1}`}
                          loading="lazy"
                          decoding="async"
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            const fallback = img.dataset.fallbackSrc;

                            if (fallback && img.src !== new URL(fallback, window.location.origin).toString()) {
                              img.src = fallback;
                              return;
                            }

                            img.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="200"%3E%3Crect fill="%23333" width="300" height="200"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="14"%3EImagen no disponible%3C/text%3E%3C/svg%3E';
                          }}
                        />
                      ) : (
                        <div className="video-wrapper">
                          <video 
                            ref={(el) => {
                              if (el) videoRefs.current[index] = el;
                            }}
                            src={getSafeMediaUrl(media)}
                            data-fallback-src={getFlatMediaUrl(media)}
                            controls 
                            playsInline
                            preload="metadata"
                            className="gallery-video"
                            onPlay={() => handleVideoPlay(index)}
                            onError={(e) => {
                              const video = e.currentTarget;
                              const fallback = video.dataset.fallbackSrc;
                              const activeSrc = video.currentSrc || video.src;

                              if (fallback && activeSrc !== new URL(fallback, window.location.origin).toString()) {
                                video.src = fallback;
                                video.load();
                                return;
                              }

                              console.error('Error loading video:', media);
                            }}
                          >
                            <p>Tu navegador no soporta la reproducción de este video. Descarga los videos en formato MP4.</p>
                          </video>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="no-content">No hay {viewMode === 'images' ? 'imágenes' : 'videos'} disponibles</p>
                )}
              </div>
            </div>
          )}

          {!selectedKit && (
            <div className="gallery-section empty">
              <p>👈 Selecciona un instrumento para ver la galería</p>
            </div>
          )}
        </div>

        <div className="rental-contact">
          <h3>¿Interesado/a en Rentar?</h3>
          <p>Contacta con nosotros para consultar disponibilidad y tarifas especiales</p>
          <a href="#contact" className="rental-cta">Solicitar Información</a>
        </div>
      </div>
    </section>
  );
}
