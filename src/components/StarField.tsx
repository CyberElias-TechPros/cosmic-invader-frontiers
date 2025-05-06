
import { useEffect, useState } from 'react';
import { createStars } from '@/utils/gameUtils';

interface StarFieldProps {
  width: number;
  height: number;
}

interface Star {
  id: number;
  x: number;
  y: number;
  size: 'small' | 'medium' | 'large';
  duration: number;
  delay: number;
}

const StarField = ({ width, height }: StarFieldProps) => {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    setStars(createStars(100, width, height));
  }, [width, height]);

  return (
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
      {stars.map((star) => (
        <div
          key={star.id}
          className={`star ${star.size} absolute`}
          style={{
            left: `${star.x}px`,
            top: `${star.y}px`,
            animation: `stars-animation ${star.duration}s linear infinite`,
            animationDelay: `${star.delay}s`
          }}
        />
      ))}
    </div>
  );
};

export default StarField;
