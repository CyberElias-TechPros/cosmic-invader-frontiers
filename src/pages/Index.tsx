
import { Helmet } from 'react-helmet-async';
import GameScreen from "@/components/GameScreen";

const Index = () => {
  return (
    <>
      <Helmet>
        <title>Cosmic Invader Frontiers | Space Shooter Game</title>
        <meta name="description" content="Defend Earth against the invading alien armada in this classic arcade-style space shooter game!" />
        <meta property="og:title" content="Cosmic Invader Frontiers" />
        <meta property="og:description" content="Play the retro-inspired space shooter game and save Earth from alien invaders." />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="min-h-screen w-full bg-space-background">
        <div className="w-full h-screen flex flex-col items-center">
          <GameScreen />
        </div>
      </div>
    </>
  );
};

export default Index;
