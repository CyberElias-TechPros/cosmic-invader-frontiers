
import { memo } from 'react';
import { Enemy } from '@/types/game';

interface UfoProps {
  ufo: Enemy;
}

const Ufo = memo(({ ufo }: UfoProps) => (
  <div
    className="absolute animate-float"
    style={{
      left: `${ufo.x}px`,
      top: `${ufo.y}px`,
      width: `${ufo.width}px`,
      height: `${ufo.height}px`,
      position: 'absolute',
      overflow: 'visible'
    }}
    role="img"
    aria-label="UFO bonus target"
  >
    {/* Main UFO body */}
    <div className="absolute w-full h-full bg-space-accent" 
      style={{
        borderRadius: '50% 50% 20% 20% / 60% 60% 40% 40%',
        boxShadow: '0 0 10px #ff00ff'
      }}
    />
    
    {/* UFO lighting effect */}
    <div className="absolute w-[80%] h-[40%] bg-yellow-400 animate-pulse opacity-70"
      style={{
        left: '10%',
        bottom: '-15%',
        borderRadius: '50%',
        filter: 'blur(5px)'
      }}
    />
    
    {/* UFO cockpit */}
    <div className="absolute w-[60%] h-[40%] bg-space-background"
      style={{
        left: '20%',
        top: '30%',
        borderRadius: '50%',
        border: '2px solid #6366f1'
      }}
    />
  </div>
));

Ufo.displayName = 'Ufo';

export default Ufo;
