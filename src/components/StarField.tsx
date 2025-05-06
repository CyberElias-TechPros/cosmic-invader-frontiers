
import { useEffect, useState, memo } from 'react';
import { createStars } from '@/utils/gameUtils';
import { Star } from '@/types/game';

interface StarFieldProps {
  width: number;
  height: number;
}

const StarComponent = memo(({ star }: { star: Star }) => (
  <div
    key={star.id}
    className={`star ${star.size} absolute`}
    style={{
      left: `${star.x}px`,
      top: `${star.y}px`,
      animation: `stars-animation ${star.duration}s linear infinite`,
      animationDelay: `${star.delay}s`
    }}
    aria-hidden="true" // Hide from screen readers as they're decorative
  />
));

StarComponent.displayName = 'StarComponent';

const StarField = ({ width, height }: StarFieldProps) => {
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    // Only regenerate stars when dimensions change significantly
    if (width > 0 && height > 0) {
      // Determine star density based on screen size
      const density = Math.min(100, Math.max(50, Math.floor((width * height) / 5000)));
      setStars(createStars(density, width, height));
    }
  }, [width, height]);

  // Don't render if no dimensions
  if (width === 0 || height === 0) return null;

  return (
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden">
      {stars.map(star => (
        <StarComponent key={star.id} star={star} />
      ))}
    </div>
  );
};

export default memo(StarField);
