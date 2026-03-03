# Maia Records — Frontend Web

The official website for **Maia Records**, a world-class musical studio dedicated to nurturing talent, producing exceptional music, and sharing the art form through education and community.

## Features

- **Home** — Hero section, studio vision, mission & values
- **About** — Studio story, mission & vision cards
- **Artists** — Roster showcase across multiple genres
- **Our Work** — Portfolio of albums, EPs, music videos, and live recordings
- **Courses** — Music education catalog (voice, guitar, piano, production, drums, songwriting)

## Tech Stack

- [React 19](https://react.dev/) — UI library
- [Vite](https://vite.dev/) — Build tool & dev server
- [React Router v7](https://reactrouter.com/) — Client-side navigation

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Project Structure

```
src/
├── components/
│   ├── Navbar.jsx    # Sticky navigation with mobile menu
│   └── Footer.jsx    # Site footer with links
├── pages/
│   ├── Home.jsx      # Landing page
│   ├── About.jsx     # Studio story, mission & vision
│   ├── Artists.jsx   # Artist roster
│   ├── Work.jsx      # Production portfolio
│   └── Courses.jsx   # Music course catalog
├── App.jsx           # Router setup & layout
├── App.css           # Global styles & design system
└── main.jsx          # Entry point
```

