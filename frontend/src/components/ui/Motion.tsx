import React from "react";
import { motion, HTMLMotionProps, Variants } from "framer-motion";

// --- SPRING CONFIGS ---
// Used to give animations that "Apple-like" fluid bounce instead of linear easing.
const springTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

// --- VARIANTS ---
export const fadeUpVariant: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: springTransition
  },
};

export const staggerContainerVariant: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1, // Each child animates 100ms after the previous
    },
  },
};

export const popVariant: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: springTransition
  },
};

// --- COMPONENTS ---

/**
 * FadeUp: Elements fade in and slide up. Great for lists and cards.
 */
export const FadeUp = ({ children, delay = 0, className = "", ...props }: HTMLMotionProps<"div"> & { delay?: number }) => (
  <motion.div
    initial="hidden"
    animate="visible"
    exit="hidden"
    variants={{
      ...fadeUpVariant,
      visible: { ...fadeUpVariant.visible, transition: { ...springTransition, delay } }
    }}
    className={className}
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * StaggerContainer: Wrap a list of <motion.div variants={fadeUpVariant}> children
 * to make them appear one after the other automatically.
 */
export const StaggerContainer = ({ children, className = "", ...props }: HTMLMotionProps<"div">) => (
  <motion.div
    initial="hidden"
    animate="visible"
    variants={staggerContainerVariant}
    className={className}
    {...props}
  >
    {children}
  </motion.div>
);

/**
 * AnimatedCard: A card with built-in hover scale and tap press effects.
 */
export const AnimatedCard = ({ children, className = "", ...props }: HTMLMotionProps<"div">) => (
  <motion.div
    whileHover={{ y: -4, scale: 1.01 }}
    whileTap={{ scale: 0.98 }}
    transition={{ type: "spring", stiffness: 400, damping: 25 }}
    className={className}
    {...props}
  >
    {children}
  </motion.div>
);
