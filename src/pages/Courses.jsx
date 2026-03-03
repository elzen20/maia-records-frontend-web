import { Link } from 'react-router-dom'

const courses = [
  {
    emoji: '🎤',
    level: 'Beginner',
    title: 'Voice & Vocal Technique',
    description:
      'Learn the fundamentals of singing — breath control, pitch, resonance, and performance confidence. Perfect for complete beginners or those looking to refine their voice.',
    duration: '8 weeks',
    price: '$299',
  },
  {
    emoji: '🎸',
    level: 'All Levels',
    title: 'Guitar Fundamentals',
    description:
      'From your first chord to playing full songs, this course covers acoustic and electric guitar fundamentals, music theory basics, and song structure.',
    duration: '10 weeks',
    price: '$349',
  },
  {
    emoji: '🎹',
    level: 'Beginner – Intermediate',
    title: 'Piano & Music Theory',
    description:
      'A comprehensive piano course that also teaches essential music theory — scales, harmony, chord progressions, and how to read sheet music.',
    duration: '12 weeks',
    price: '$399',
  },
  {
    emoji: '🎧',
    level: 'Intermediate',
    title: 'Music Production & Mixing',
    description:
      'Dive deep into DAW production (Logic Pro, Ableton), sound design, recording techniques, mixing, and mastering. Build tracks that are radio-ready.',
    duration: '10 weeks',
    price: '$499',
  },
  {
    emoji: '🥁',
    level: 'All Levels',
    title: 'Drums & Rhythm',
    description:
      'Develop your rhythmic foundation on a full drum kit. This course covers grooves, fills, timing, dynamics, and playing in a live band context.',
    duration: '8 weeks',
    price: '$299',
  },
  {
    emoji: '🎼',
    level: 'Advanced',
    title: 'Songwriting & Composition',
    description:
      'Craft compelling songs with strong melodies, memorable hooks, and authentic lyrics. Explore different genres and develop your unique compositional voice.',
    duration: '6 weeks',
    price: '$249',
  },
]

export default function Courses() {
  return (
    <>
      <section className="section">
        <h1 className="section-title">Music Courses</h1>
        <p className="section-subtitle">
          Whether you are picking up an instrument for the first time or
          sharpening professional skills, Maia Records offers courses taught
          by working musicians and industry professionals.
        </p>
        <div className="divider" />

        <div className="courses-grid">
          {courses.map((course) => (
            <div key={course.title} className="card course-card">
              <span className="course-badge">{course.level}</span>
              <div className="course-icon">{course.emoji}</div>
              <h3 className="course-title">{course.title}</h3>
              <p className="course-description">{course.description}</p>
              <div className="course-meta">
                <span>📅 {course.duration}</span>
                <span className="course-price">{course.price}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <h2>Not Sure Where to Start?</h2>
        <p>
          Our team is here to help you choose the right course for your goals
          and experience level. Great music education starts with one step.
        </p>
        <Link to="/about" className="btn btn-primary">
          Contact Us
        </Link>
      </section>
    </>
  )
}
