import React from 'react';
import './App.css';
import Header from './components/Header';
import Hero from './components/Hero';
import About from './components/About';
import VisionMission from './components/VisionMission';
import Services from './components/Services';
import RentalInstruments from './components/RentalInstruments';
import Contact from './components/Contact';
import Footer from './components/Footer';

function App() {
  return (
    <div className="App">
      <Header />
      <Hero />
      <About />
      <VisionMission />
      <Services />
      <RentalInstruments />
      <Contact />
      <Footer />
    </div>
  );
}

export default App;
