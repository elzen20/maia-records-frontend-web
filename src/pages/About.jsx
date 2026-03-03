import { Link } from 'react-router-dom'

export default function About() {
  return (
    <>
      <section className="section">
        <h1 className="section-title">About Maia Records</h1>
        <div className="divider" />

        {/* Intro */}
        <div className="about-intro">
          <div className="about-visual">🎙️</div>
          <div className="about-text">
            <h2>Our Story</h2>
            <p>
              Maia Records was founded with a single, unwavering belief: great
              music changes lives. Born from a passion for authentic artistry,
              our studio has grown into a creative hub that attracts talent from
              across the globe.
            </p>
            <p>
              From our state-of-the-art recording facilities to our intimate
              live sessions, every corner of Maia Records is designed to inspire.
              We work across genres — from jazz and classical to hip-hop,
              electronic, and beyond.
            </p>
            <p>
              Over the years, we have partnered with emerging artists and
              established names alike, always staying true to our core: putting
              the music first.
            </p>
            <Link to="/artists" className="btn btn-primary" style={{ marginTop: '16px' }}>
              Meet Our Artists
            </Link>
          </div>
        </div>

        {/* Mission & Vision */}
        <h2 className="section-title">Mission &amp; Vision</h2>
        <div className="divider" />
        <div className="mission-vision-grid">
          <div className="card mv-card">
            <h3>🎯 Our Mission</h3>
            <p>
              To empower musicians at every level — providing world-class
              recording, production, artist management, and music education
              that turns passion into a sustainable career.
            </p>
          </div>
          <div className="card mv-card">
            <h3>🌠 Our Vision</h3>
            <p>
              To be the most respected and innovative music studio in the
              industry — a place where creativity is celebrated, diversity is
              embraced, and every note matters.
            </p>
          </div>
          <div className="card mv-card">
            <h3>🤝 Community</h3>
            <p>
              Music is universal. We actively invest in local talent,
              mentorship programs, and community events that make music
              accessible to everyone.
            </p>
          </div>
          <div className="card mv-card">
            <h3>⚡ Innovation</h3>
            <p>
              We stay at the forefront of music technology, blending
              traditional craftsmanship with cutting-edge tools to craft
              sounds that push boundaries.
            </p>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <h2>Want to Work With Us?</h2>
        <p>
          Maia Records is always looking for new voices and fresh perspectives.
          Whether you are an artist, producer, or enthusiast — reach out.
        </p>
        <Link to="/courses" className="btn btn-primary">
          Start With a Course
        </Link>
      </section>
    </>
  )
}
