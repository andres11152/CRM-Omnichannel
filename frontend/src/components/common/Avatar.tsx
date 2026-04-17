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

  // Extract initials natively
  const renderInitials = () => {
    // If no name, return a user icon or "U"
    if (!name) return "U";
    
    // Attempt to get 2 initials
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // If we have a valid src and it hasn't errored yet, try rendering the img
  if (src && !imgError) {
    // Ensure src points correctly if it's a relative path just in case
    const validSrc = src;
    
    return (
      <img
        src={validSrc}
        alt={name || "Avatar"}
        className={`rounded-full object-cover shrink-0 ${className}`}
        onError={() => setImgError(true)}
      />
    );
  }

  // Fallback: Enterprise Native Initial Div
  return (
    <div
      className={`rounded-full shrink-0 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-bold shadow-sm ${className}`}
      title={name || "Usuario"}
      style={{
        // Simple heuristic to size font relative to the className size if possible
        // Without knowing exact dimensions, we rely on parent forcing dimensions or tailwind
      }}
    >
      <span className="opacity-95">{renderInitials()}</span>
    </div>
  );
};
