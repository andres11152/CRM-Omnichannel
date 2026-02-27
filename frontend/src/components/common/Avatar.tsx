import React, { useState, useEffect } from "react";

interface AvatarProps {
  src?: string | null;
  name: string;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  className = "",
}) => {
  const [imgError, setImgError] = useState(false);

  // Reset error state if src changes
  useEffect(() => {
    setImgError(false);
  }, [src]);

  const fallbackSrc = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    name || "U",
  )}&background=random&color=fff&size=128`;

  return (
    <img
      src={!imgError && src ? src : fallbackSrc}
      alt={name || "Avatar"}
      className={`rounded-full object-cover shrink-0 ${className}`}
      onError={() => {
        if (!imgError) {
          setImgError(true);
        }
      }}
    />
  );
};
