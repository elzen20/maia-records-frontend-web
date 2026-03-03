import { Link } from 'react-router-dom'

const values = [
  {
    icon: '🎯',
    title: 'Our Vision',
    description:
      'To be the premier recording studio that shapes the future of music — a creative home where authentic artistry thrives and extraordinary sounds are born.',
  },
  {
    icon: '🎶',
    title: 'Our Mission',
    description:
      'Empowering musicians and music lovers through world-class production, artist development, and music education that transforms passion into profession.',
  },
  {
    icon: '🌟',
    title: 'Our Values',
    description:
      'We believe in creativity without limits, excellence in craft, inclusive collaboration, and a deep respect for every musical tradition and genre.',
  },
]

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <p className="hero-eyebrow">Welcome to Maia Records</p>
        <h1 className="hero-title">
          Where <span>Music</span> <br /> Comes Alive
        </h1>
        <p className="hero-description">
          A world-class musical studio dedicated to nurturing talent, producing
          exceptional music, and sharing the art form through education and
          community.
        </p>
        <div className="hero-actions">
          <Link to="/artists" className="btn btn-primary">
            Meet Our Artists
          </Link>
          <Link to="/courses" className="btn btn-outline">
            Explore Courses
          </Link>
        </div>
      </section>

      {/* Vision, Mission, Values */}
      <section className="section">
        <h2 className="section-title">What Drives Us</h2>
        <div className="divider" />
        <div className="values-grid">
          {values.map((v) => (
            <div key={v.title} className="card">
              <div className="value-icon">{v.icon}</div>
              <h3 className="value-title">{v.title}</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.95rem' }}>
                {v.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quick links */}
      <section className="cta-section">
        <h2>Ready to Make Music?</h2>
        <p>
          Whether you are an aspiring artist, seasoned professional, or music
          enthusiast — Maia Records has a place for you.
        </p>
        <div className="hero-actions">
          <Link to="/work" className="btn btn-primary">
            See Our Work
          </Link>
          <Link to="/about" className="btn btn-outline">
            Our Story
          </Link>
        </div>
      </section>
    </>
  )
}
