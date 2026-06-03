import React from 'react';
import { FaBookOpen, FaHandHoldingHeart, FaMedal, FaGlobeAfrica } from 'react-icons/fa';
import { GiBookshelf, GiScrollUnfurled } from 'react-icons/gi'; // Nouvelles icônes plus "bibliothèque"


const banner =
  "https://res.cloudinary.com/djukqnpbs/image/upload/f_auto,q_auto/banner_rwqp2q";

const About = () => {
  return (
    <div className="library-theme-page">
      {/* --- HERO SECTION: L'Entrée de la Bibliothèque --- */}
      <section className="lib-hero">
        <div className="lib-hero-overlay"></div>
        <div className="lib-container hero-content-flex">
          <div className="hero-text-block">
            <span className="lib-overtitle font-cairo">مكتبة الكهف</span>
            <h1 className="font-cairo">L'Héritage d'<span className="gold-highlight">Al Kahf</span></h1>
            <div className="lib-separator-ornament"><GiScrollUnfurled /></div>
            <p className="font-amiri">
              "Un chemin vers la connaissance." <br/>
              Des ouvrages islamiques authentiques, choisis avec science et sincérité, au service de la foi et de la compréhension.
            </p>
          </div>
        </div>
      </section>

      {/* --- MISSION SECTION: La Salle de Lecture --- */}
      <section className="lib-section lib-mission">
        <div className="lib-container lib-split-layout">
          
          <div className="lib-content-side">
            <div className="lib-heading-group">
              <span className="section-tag font-cairo">Notre Vocation</span>
              <h2 className="font-cairo">Bienvenue dans votre <span className="text-gold">“caverne”</span></h2>
            </div>
            
            <div className="lib-text-body font-amiri">
              <p className="drop-cap">
                <span className="drop-word">Alkahf</span> est un espace conçu pour tous ceux qui aspirent à nourrir leur esprit et approfondir leur compréhension.
              </p>Ici, vous trouverez une sélection précieuse d’ouvrages soigneusement choisis pour enrichir vos connaissances, que ce soit en ‘aqîda (croyance), en étude du qur’ân, à travers des récits prophétiques, ou bien plus encore.
              <p>
                Chaque livre, chaque édition, est sélectionné
                avec une attention particulière, dans le souci
                de vous offrir un contenu fiable, bénéfique et
                authentique. <br />

                Que cette quête du savoir soit pour vous une
                source de patience, de lumière et de
                satisfaction.              
              </p>
            </div>
            <div className="lib-signature font-amiri">Librairie Al kahf</div>
          </div>

          <div className="lib-image-side">
            <div className="antique-frame">
              <img src={banner} alt="Collection de livres anciens" />
              <div className="frame-corner top-left"></div>
              <div className="frame-corner bottom-right"></div>
            </div>
          </div>

        </div>
      </section>

      {/* --- VALUES SECTION: Les Rayonnages --- */}
      <section className="lib-section lib-values-bg">
        <div className="lib-container">
          <div className="lib-centered-header">
             <GiBookshelf className="header-icon-gold" />
            <h2 className="font-cairo">Les Piliers de notre <span className="text-gold">Collection</span></h2>
            <p className="font-amiri section-sub">Les principes immuables qui guident chaque ajout à nos étagères.</p>
          </div>
          
          <div className="lib-shelves-grid">
            {/* Card 1 */}
            <div className="shelf-card">
              <div className="card-ornament-top"></div>
              <div className="shelf-icon"><FaBookOpen /></div>
              <h3 className="font-cairo">Authenticité Vérifiée</h3>
              <p className="font-amiri">Comme un manuscrit ancien, chaque source est rigoureusement examinée pour sa conformité.</p>
            </div>
            
            {/* Card 2 */}
            <div className="shelf-card">
              <div className="card-ornament-top"></div>
              <div className="shelf-icon"><FaHandHoldingHeart /></div>
              <h3 className="font-cairo">Soutien Communautaire</h3>
              <p className="font-amiri">Nous sommes le mécène des auteurs et éditeurs qui préservent notre héritage intellectuel.</p>
            </div>
            
            {/* Card 3 */}
            <div className="shelf-card">
              <div className="card-ornament-top"></div>
              <div className="shelf-icon"><FaMedal /></div>
              <h3 className="font-cairo">Qualité Précieuse</h3>
              <p className="font-amiri">Une sélection premium, où la beauté du fond rencontre la noblesse de la forme.</p>
            </div>
            
            {/* Card 4 */}
            <div className="shelf-card">
              <div className="card-ornament-top"></div>
              <div className="shelf-icon"><FaGlobeAfrica /></div>
              <h3 className="font-cairo">Savoir Sans Frontières</h3>
              <p className="font-amiri">Une logistique pensée pour que la sagesse voyage de nos rayonnages à vos mains.</p>
            </div>
          </div>
        </div>
      </section>

      {/* --- COMMITMENT SECTION: Le Manuscrit Scellé --- */}
      <section className="lib-section lib-commitment-vault">
        <div className="lib-container">
          <div className="illuminated-manuscript-box">
            <h2 className="font-cairo title-gold">NOTRE ENGAGEMENT</h2>
            <div className="manuscript-body font-amiri">
              <p>
                Notre mission est simple : <br />
                vous proposer un savoir bénéfique, fiable
                et accessible à tous.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;