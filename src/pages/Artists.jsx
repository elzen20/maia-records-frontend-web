import { Link } from 'react-router-dom'

const artists = [
  {
    emoji: '🎤',
    name: 'Luna Vega',
    genre: 'R&B / Soul',
    bio: 'With a voice that moves mountains, Luna brings raw emotion and storytelling to every performance. Her debut album hit number one across streaming platforms.',
  },
  {
    emoji: '🎸',
    name: 'Marco Díaz',
    genre: 'Rock / Alternative',
    bio: 'Marco blends thunderous guitar riffs with introspective lyrics, creating anthems that resonate with a generation searching for identity and purpose.',
  },
  {
    emoji: '🎹',
    name: 'Aria Chen',
    genre: 'Classical / Neo-Soul',
    bio: 'Classically trained and creatively fearless, Aria weaves piano compositions with modern production to craft music that is both timeless and contemporary.',
  },
  {
    emoji: '🎧',
    name: 'DJ Storm',
    genre: 'Electronic / House',
    bio: 'Storm commands every dancefloor with precision and passion. His mixes are legendary, blending deep bass lines with euphoric melodies that last all night.',
  },
  {
    emoji: '🎺',
    name: 'James Rivers',
    genre: 'Jazz / Fusion',
    bio: 'A trumpet virtuoso, James breathes new life into jazz tradition while fearlessly exploring fusion, Latin, and world music influences.',
  },
  {
    emoji: '🎵',
    name: 'Sofia Morales',
    genre: 'Pop / Latin',
    bio: 'Sofia\'s infectious pop hooks fused with Latin rhythms have earned her a devoted global fanbase and multiple chart-topping singles.',
  },
]

export default function Artists() {
  return (
    <>
      <section className="section">
        <h1 className="section-title">Our Artists</h1>
        <p className="section-subtitle">
          Maia Records is home to an exceptional roster of musicians who push
          creative boundaries and define the sound of today.
        </p>
        <div className="divider" />

        <div className="artists-grid">
          {artists.map((artist) => (
            <div key={artist.name} className="card artist-card">
              <div className="artist-avatar">{artist.emoji}</div>
              <p className="artist-name">{artist.name}</p>
              <p className="artist-genre">{artist.genre}</p>
              <p className="artist-bio">{artist.bio}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <h2>Are You an Artist?</h2>
        <p>
          Maia Records is always scouting for exceptional talent. If you think
          you have what it takes, we would love to hear your music.
        </p>
        <Link to="/work" className="btn btn-primary">
          See Our Productions
        </Link>
      </section>
    </>
  )
}
