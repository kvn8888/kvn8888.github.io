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

// FLIP Animation Modal
function ProjectModal({
  project,
  isOpen,
  sourceRect,
  onClose,
}: {
  project: Project | null;
  isOpen: boolean;
  sourceRect: Rect | null;
  onClose: () => void;
}) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [animationPhase, setAnimationPhase] = useState<'entering' | 'idle' | 'exiting'>('entering');
  const [showContent, setShowContent] = useState(false);

  // Handle close with FLIP exit animation
  const handleClose = useCallback(() => {
    if (animationPhase !== 'idle') return;
    setAnimationPhase('exiting');
    setShowContent(false);

    const card = cardRef.current;
    if (card && sourceRect) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Recalculate source rect (in case of scroll/resize)
      const targetWidth = Math.min(512, vw * 0.9);
      const targetHeight = card.offsetHeight || 400;
      const targetX = (vw - targetWidth) / 2;
      const targetY = Math.max(40, (vh - targetHeight) / 2);

      const scaleX = sourceRect.width / targetWidth;
      const scaleY = sourceRect.height / targetHeight;
      const translateX = sourceRect.x - targetX + (sourceRect.width - targetWidth) / 2;
      const translateY = sourceRect.y - targetY + (sourceRect.height - targetHeight) / 2;

      // Animate back to source
      card.style.transition = 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease';
      card.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
      card.style.opacity = '0';
    }

    setTimeout(() => {
      onClose();
      setAnimationPhase('entering');
    }, 350);
  }, [animationPhase, sourceRect, onClose]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && animationPhase === 'idle') {
        handleClose();
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
  }, [isOpen, animationPhase, handleClose]);

  // FLIP Animation on open
  useEffect(() => {
    if (isOpen && sourceRect && cardRef.current && animationPhase === 'entering') {
      const card = cardRef.current;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Target: centered modal
      const targetWidth = Math.min(512, vw * 0.9); // max-w-lg = 512px
      const targetHeight = card.scrollHeight || 400;
      const targetX = (vw - targetWidth) / 2;
      const targetY = Math.max(40, (vh - targetHeight) / 2);

      // Calculate transforms (source to target)
      const scaleX = sourceRect.width / targetWidth;
      const scaleY = sourceRect.height / targetHeight;
      const translateX = sourceRect.x - targetX + (sourceRect.width - targetWidth) / 2;
      const translateY = sourceRect.y - targetY + (sourceRect.height - targetHeight) / 2;

      // Set initial position (source)
      card.style.width = `${targetWidth}px`;
      card.style.position = 'fixed';
      card.style.left = `${targetX}px`;
      card.style.top = `${targetY}px`;
      card.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
      card.style.opacity = '1';

      // Force reflow
      void card.offsetHeight;

      // Animate to target (centered modal)
      card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease';
      card.style.transform = 'translate(0, 0) scale(1, 1)';

      // Show content after expansion
      const contentTimer = setTimeout(() => {
        setShowContent(true);
        setAnimationPhase('idle');
      }, 300);

      return () => clearTimeout(contentTimer);
    }
  }, [isOpen, sourceRect, animationPhase]);

  // Handle click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && animationPhase === 'idle') {
      handleClose();
    }
  };

  if (!isOpen || !project) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50"
    >
      {/* Backdrop with blur */}
      <div
        className={`absolute inset-0 bg-white/70 backdrop-blur-xl transition-opacity duration-300 ${
          animationPhase === 'exiting' ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {/* Morphing card */}
      <div
        ref={cardRef}
        className="relative z-10 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden origin-center"
        style={{ opacity: 0 }}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
          className={`absolute top-4 right-4 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-all duration-200 ${
            showContent ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
          }`}
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-gray-600">close</span>
        </button>

        {/* Content */}
        <div
          className={`p-8 transition-all duration-200 ${
            showContent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
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
  const [sourceRect, setSourceRect] = useState<Rect | null>(null);
  const [animatingCardId, setAnimatingCardId] = useState<string | null>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Store refs for cards
  const setCardRef = useCallback((id: string) => (el: HTMLDivElement | null) => {
    if (el) {
      cardRefs.current.set(id, el);
    }
  }, []);

  // Click to open modal with FLIP animation
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
      setAnimatingCardId(project.id);
    }
    setSelectedProject(project);
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setAnimatingCardId(null);
    // Delay clearing selected project for animation
    setTimeout(() => {
      setSelectedProject(null);
      setSourceRect(null);
    }, 400);
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
                {/* Project Card - morphs into modal on click */}
                <div
                  ref={setCardRef(project.id)}
                  onClick={() => handleProjectClick(project)}
                  className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer bg-white/50 border-white/20 hover:bg-white/80 hover:scale-[1.02] group ${
                    animatingCardId === project.id ? 'opacity-0' : ''
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

      {/* Modal - morphs from clicked card */}
      <ProjectModal
        project={selectedProject}
        isOpen={isModalOpen}
        sourceRect={sourceRect}
        onClose={handleCloseModal}
      />
    </div>
  );
}
