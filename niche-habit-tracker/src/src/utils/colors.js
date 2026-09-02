// Color palette for habit categories
const CATEGORY_COLORS = {
  Fitness: '#FF5722',   // Vibrant Orange
  Learning: '#2196F3',  // Tech Blue
  Mindfulness: '#9C27B0', // Purple
  Health: '#00BCD4',    // Cyan
  Productivity: '#FFEB3B', // Yellow
  General: '#4CAF50',   // Green
};

export const getCategoryColor = (category) => {
  if (!category) return CATEGORY_COLORS.General;
  
  // Return matched color or fall back to a dynamic color based on string hashing
  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }

  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 50%)`;
};