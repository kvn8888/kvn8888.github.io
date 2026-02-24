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

// Modal component with backdrop blur
function ProjectModal({
  project,
  isOpen,
  onClose,
}: {
  project: Project | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
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
  }, [isOpen, onClose]);

  // Handle click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop"
    >
      {/* Backdrop with blur and white tint */}
      <div className="absolute inset-0 bg-white/60 backdrop-blur-xl modal-fade-in" />

      {/* Modal card */}
      <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 modal-scale-in">
        {/* Close button - circular X */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-gray-600">close</span>
        </button>

        {/* Content */}
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
          >
            View Demo
            <span className="material-symbols-outlined ml-1 text-sm">arrow_outward</span>
          </a>
          <a
            href={project.githubUrl}
            className="px-6 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            GitHub
          </a>
        </div>

        {/* Keyboard hint */}
        <p className="mt-6 text-xs text-gray-400 text-center">Press ESC or click outside to close</p>
      </div>
    </div>
  );
}

export default function Home() {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [hoveredProject, setHoveredProject] = useState<Project | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });

  // Hover popup handlers (for desktop)
  const handleMouseEnter = useCallback((project: Project, e: React.MouseEvent) => {
    if (window.innerWidth >= 768) {
      setHoveredProject(project);
      setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (hoveredProject && window.innerWidth >= 768) {
        setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
      }
    },
    [hoveredProject]
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredProject(null);
  }, []);

  // Click to open modal
  const handleProjectClick = useCallback((project: Project) => {
    setSelectedProject(project);
    setIsModalOpen(true);
    setHoveredProject(null); // Close hover popup
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    // Delay clearing the project to allow exit animation
    setTimeout(() => setSelectedProject(null), 300);
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
                  onMouseEnter={(e) => handleMouseEnter(project, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => handleProjectClick(project)}
                  className="p-4 rounded-xl border transition-all duration-300 cursor-pointer bg-white/50 border-white/20 hover:bg-white/80 hover:scale-[1.02] group"
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
      <ProjectModal project={selectedProject} isOpen={isModalOpen} onClose={handleCloseModal} />
    </div>
  );
}
