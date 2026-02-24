'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

interface Project {
  id: string;
  title: string;
  shortDesc: string;
  tags: string[];
  fullDesc: string;
  demoUrl: string;
  githubUrl: string;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const projects: Project[] = [
  {
    id: 'password-entropy',
    title: 'Password Entropy Checker',
    shortDesc: 'Security tool for analyzing password strength',
    tags: ['React', 'TypeScript', 'Cryptography'],
    fullDesc: 'A web application that calculates password entropy and provides real-time feedback on password strength using Shannon entropy calculations.',
    demoUrl: '#',
    githubUrl: '#',
  },
  {
    id: 'google-tts',
    title: 'Google TTS UI',
    shortDesc: 'Text-to-speech interface with voice selection',
    tags: ['Next.js', 'API', 'Audio'],
    fullDesc: 'A polished UI for Google Cloud Text-to-Speech API with voice preview, speed control, and batch processing capabilities.',
    demoUrl: '#',
    githubUrl: '#',
  },
  {
    id: 'receipt-automator',
    title: 'Receipt Automator',
    shortDesc: 'Automated receipt processing with OCR',
    tags: ['Python', 'OCR', 'Automation'],
    fullDesc: 'An intelligent system that extracts data from receipt images using OCR and automatically populates expense tracking spreadsheets.',
    demoUrl: '#',
    githubUrl: '#',
  },
];

// Expanding Modal that morphs from the card
function ProjectModal({
  project,
  isOpen,
  isClosing,
  sourceRect,
  onClose,
}: {
  project: Project | null;
  isOpen: boolean;
  isClosing: boolean;
  sourceRect: Rect | null;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const [isAnimating, setIsAnimating] = useState(false);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isClosing) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, isClosing, onClose]);

  // Handle click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !isClosing) {
      onClose();
    }
  };

  // Handle close button click
  const handleCloseClick = () => {
    if (!isClosing) {
      onClose();
    }
  };

  if (!isOpen || !project) return null;

  // Calculate initial position from source rect
  const initialStyle = sourceRect
    ? {
        position: 'fixed' as const,
        left: sourceRect.x,
        top: sourceRect.y,
        width: sourceRect.width,
        height: sourceRect.height,
      }
    : {};

  const modalClasses = isClosing
    ? 'modal-shrink-to-card'
    : sourceRect
    ? 'modal-expand-from-card'
    : 'modal-fade-scale-in';

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center modal-overlay"
    >
      {/* Backdrop with blur and white tint */}
      <div className={`absolute inset-0 bg-white/70 backdrop-blur-xl ${isClosing ? 'modal-backdrop-fade-out' : 'modal-backdrop-fade-in'}`} />

      {/* Modal card that morphs */}
      <div
        ref={modalRef}
        className={`relative z-10 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden ${modalClasses}`}
        style={isClosing ? undefined : initialStyle}
      >
        {/* Close button - circular X */}
        <button
          onClick={handleCloseClick}
          className="absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-gray-600">close</span>
        </button>

        {/* Content - fades in after expansion */}
        <div className={`p-8 ${isClosing ? 'modal-content-fade-out' : 'modal-content-fade-in'}`}>
          <div className="mb-6">
            <h3 className="text-2xl font-medium text-gray-900 mb-2">{project.title}</h3>
            <p className="text-gray-500">{project.shortDesc}</p>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 mb-6">
            {project.tags.map((tag) => (
              <span key={tag} className="px-3 py-1 text-sm bg-gray-100 rounded-full text-gray-600">
                {tag}
              </span>
            ))}
          </div>

          {/* Full description */}
          <p className="text-gray-600 leading-relaxed mb-8">{project.fullDesc}</p>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <a
              href={project.demoUrl}
              className="inline-flex items-center justify-center px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-900 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              View Demo
              <span className="material-symbols-outlined ml-1 text-sm">arrow_outward</span>
            </a>
            <a
              href={project.githubUrl}
              className="px-6 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              GitHub
            </a>
          </div>

          {/* Keyboard hint */}
          <p className="mt-6 text-xs text-gray-400 text-center">Press ESC or click outside to close</p>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isModalClosing, setIsModalClosing] = useState(false);
  const [sourceRect, setSourceRect] = useState<Rect | null>(null);
  const [hoveredProject, setHoveredProject] = useState<Project | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Store refs for cards
  const setCardRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    }
  }, []);

  // Hover popup handlers (for desktop)
  const handleMouseEnter = useCallback((project: Project, e: React.MouseEvent) => {
    if (window.innerWidth >= 768 && !isModalOpen) {
      setHoveredProject(project);
      setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
    }
  }, [isModalOpen]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (hoveredProject && window.innerWidth >= 768 && !isModalOpen) {
        setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
      }
    },
    [hoveredProject, isModalOpen]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredProject(null);
  }, []);

  // Click to open modal with morph animation
  const handleProjectClick = useCallback((project: Project) => {
    const cardEl = cardRefs.current.get(project.id);
    if (cardEl) {
      const rect = cardEl.getBoundingClientRect();
      setSourceRect({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
    }
    setSelectedProject(project);
    setIsModalOpen(true);
    setIsModalClosing(false);
    setHoveredProject(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalClosing(true);
    // Wait for shrink animation to complete
    setTimeout(() => {
      setIsModalOpen(false);
      setIsModalClosing(false);
      setSelectedProject(null);
      setSourceRect(null);
    }, 350);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      {/* Aurora Background */}
      <div className="aurora-bg">
        <div className="aurora-blob aurora-blob-1"></div>
        <div className="aurora-blob aurora-blob-2"></div>
        <div className="aurora-blob aurora-blob-3"></div>
      </div>

      {/* Content with staggered blur reveal animation */}
      <div className="text-center max-w-4xl mx-auto relative z-10">
        {/* Small tagline */}
        <p className="text-sm text-gray-500 mb-4 tracking-wide blur-reveal">Software Engineer & Builder</p>

        {/* Main headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight mb-8 text-black blur-reveal-1">
          Welcome to KevinC.dev
        </h1>

        {/* Bio text */}
        <p className="text-lg text-gray-600 max-w-xl mx-auto mb-8 leading-relaxed blur-reveal-2">
          I&apos;m a software engineering student at the Rochester Institute of Technology.
          Currently on an internship at Ivalua, Inc.
        </p>

        {/* CTA Button */}
        <a
          href="#projects"
          className="inline-flex items-center justify-center px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-900 transition-colors shadow-lg hover:shadow-xl blur-reveal-3"
        >
          See my projects
        </a>

        {/* Projects Section */}
        <div id="projects" className="mt-20 w-full max-w-xl mx-auto blur-reveal-4">
          <h2 className="text-2xl font-medium text-gray-900 mb-8">Projects</h2>

          {/* Project List */}
          <div className="space-y-3">
            {projects.map((project) => (
              <div key={project.id} className="relative">
                {/* Project Trigger */}
                <div
                  ref={setCardRef(project.id)}
                  onMouseEnter={(e) => handleMouseEnter(project, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => handleProjectClick(project)}
                  className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer bg-white/50 border-white/20 hover:bg-white/80 hover:scale-[1.02] group ${
                    isModalOpen && selectedProject?.id === project.id ? 'opacity-0' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-600 transition-colors">folder_open</span>
                      <span className="font-medium text-gray-900">{project.title}</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 ml-8">{project.shortDesc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: Hover Popup */}
      {hoveredProject && !isModalOpen && (
        <div
          className="hidden md:block fixed z-40 w-80 p-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200 pointer-events-none popup-enter"
          style={{
            left: `${popupPosition.x}px`,
            top: `${popupPosition.y}px`,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-medium text-gray-900">{hoveredProject.title}</span>
            <span className="material-symbols-outlined text-gray-400">arrow_outward</span>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {hoveredProject.tags.map((tag) => (
              <span key={tag} className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">
                {tag}
              </span>
            ))}
          </div>

          <p className="text-sm text-gray-600 leading-relaxed">{hoveredProject.fullDesc}</p>

          <p className="mt-3 text-xs text-gray-400">Click to expand</p>
        </div>
      )}

      {/* Modal */}
      <ProjectModal
        project={selectedProject}
        isOpen={isModalOpen}
        isClosing={isModalClosing}
        sourceRect={sourceRect}
        onClose={handleCloseModal}
      />
    </div>
  );
}
