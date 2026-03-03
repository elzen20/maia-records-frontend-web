import { Link } from 'react-router-dom'

const projects = [
  {
    emoji: '💿',
    category: 'Album Production',
    title: 'Echoes of Silence',
    description:
      'A full-length studio album produced for Luna Vega, featuring 12 original tracks blending R&B, soul, and neo-jazz. Recorded, mixed, and mastered entirely at Maia Records.',
  },
  {
    emoji: '🎬',
    category: 'Music Video',
    title: 'Neon Nights',
    description:
      'Cinematic music video direction and post-production for DJ Storm\'s breakout single, amassing over 10 million views in its first month of release.',
  },
  {
    emoji: '🎙️',
    category: 'Podcast / Audio Series',
    title: 'The Maia Sessions',
    description:
      'A monthly live-studio podcast featuring intimate performances and interviews with artists from our roster — capturing the raw magic of creation.',
  },
  {
    emoji: '🎵',
    category: 'EP Release',
    title: 'Colors of the Mind',
    description:
      'Aria Chen\'s critically acclaimed 6-track EP, bridging classical piano with modern electronic production in a way never heard before.',
  },
  {
    emoji: '🎸',
    category: 'Live Recording',
    title: 'Marco Live at The Venue',
    description:
      'A high-fidelity live album captured during Marco Díaz\'s sold-out tour, showcasing the raw energy of his alternative rock performances.',
  },
  {
    emoji: '🎺',
    category: 'Collaborative Project',
    title: 'Jazz & Beyond',
    description:
      'A cross-genre collaborative album featuring James Rivers alongside six international musicians — a celebration of jazz\'s global reach and evolution.',
  },
]

export default function Work() {
  return (
    <>
      <section className="section">
        <h1 className="section-title">Our Work</h1>
        <p className="section-subtitle">
          From studio albums and music videos to live recordings and podcasts —
          explore the projects that define the Maia Records sound.
        </p>
        <div className="divider" />

        <div className="work-grid">
          {projects.map((project) => (
            <div key={project.title} className="card work-card">
              <div className="work-thumbnail">{project.emoji}</div>
              <p className="work-category">{project.category}</p>
              <h3 className="work-title">{project.title}</h3>
              <p className="work-description">{project.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <h2>Have a Project in Mind?</h2>
        <p>
          Our team of producers, engineers, and creatives are ready to bring
          your vision to life. Let&apos;s make something unforgettable together.
        </p>
        <Link to="/about" className="btn btn-primary">
          Learn More About Us
        </Link>
      </section>
    </>
  )
}
