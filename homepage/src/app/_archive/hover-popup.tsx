// ARCHIVED: Hover Popup Card Component
// This component displayed a floating popup card when hovering over projects.
// It followed the cursor and showed project details.
//
// Usage: Place this component in your page and pass hoveredProject + popupPosition state
//
// State needed:
//   const [hoveredProject, setHoveredProject] = useState<Project | null>(null);
//   const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
//
// Handlers:
//   const handleMouseEnter = (project: Project, e: React.MouseEvent) => {
//     if (window.innerWidth >= 768) {
//       setHoveredProject(project);
//       setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
//     }
//   };
//
//   const handleMouseMove = (e: React.MouseEvent) => {
//     if (hoveredProject && window.innerWidth >= 768) {
//       setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
//     }
//   };
//
//   const handleMouseLeave = () => {
//     setHoveredProject(null);
//   };

import { Project } from '../page';

interface HoverPopupProps {
  project: Project | null;
  position: { x: number; y: number };
  isVisible: boolean;
}

export function HoverPopup({ project, position, isVisible }: HoverPopupProps) {
  if (!isVisible || !project) return null;

  return (
    <div
      className="hidden md:block fixed z-40 w-80 p-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200 pointer-events-none popup-enter"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="font-medium text-gray-900">{project.title}</span>
        <span className="material-symbols-outlined text-gray-400">arrow_outward</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {project.tags.map((tag) => (
          <span key={tag} className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">
            {tag}
          </span>
        ))}
      </div>

      <p className="text-sm text-gray-600 leading-relaxed">{project.fullDesc}</p>

      <p className="mt-3 text-xs text-gray-400">Click to expand</p>
    </div>
  );
}

// Required CSS animations (add to globals.css):
//
// @keyframes popupEnter {
//   0% {
//     opacity: 0;
//     transform: scale(0);
//   }
//   60% {
//     opacity: 1;
//     transform: scale(1.05);
//   }
//   100% {
//     opacity: 1;
//     transform: scale(1);
//   }
// }
//
// .popup-enter {
//   animation: popupEnter 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
// }
