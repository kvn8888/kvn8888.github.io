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

// Popup card component with cursor-origin animation
function PopupCard({
  project,
  position,
  cursorOrigin,
  isExiting,
  isEntering,
}: {
  project: Project;
  position: { x: number; y: number };
  cursorOrigin: { x: number; y: number };
  isExiting: boolean;
  isEntering: boolean;
}) {
  const animationClass = isEntering
    ? 'popup-enter'
    : isExiting
    ? 'popup-exit'
    : 'popup-morph';

  // Calculate transform origin relative to the popup card position
  const originX = cursorOrigin.x - position.x;
  const originY = cursorOrigin.y - position.y;

  return (
    <div
      className={`hidden md:block fixed z-50 w-80 p-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200 pointer-events-none ${animationClass}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transformOrigin: `${originX}px ${originY}px`,
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

      <p className="text-sm text-gray-600 leading-relaxed mb-4">{project.fullDesc}</p>

      <div className="flex items-center gap-4 text-sm pointer-events-auto">
        <a
          href={project.demoUrl}
          className="text-blue-600 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          View Demo →
        </a>
        <a
          href={project.githubUrl}
          className="text-gray-500 hover:text-gray-900"
          onClick={(e) => e.stopPropagation()}
        >
          GitHub
        </a>
      </div>
    </div>
  );
}

export default function Home() {
  const [popupState, setPopupState] = useState<{
    project: Project | null;
    position: { x: number; y: number };
    cursorOrigin: { x: number; y: number };
    status: 'hidden' | 'entering' | 'visible' | 'exiting' | 'morphing';
    previousProject: Project | null;
  }>({
    project: null,
    position: { x: 0, y: 0 },
    cursorOrigin: { x: 0, y: 0 },
    status: 'hidden',
    previousProject: null,
  });
  const [clickedProject, setClickedProject] = useState<string | null>(null);

  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const enterTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimeouts = () => {
    if (exitTimeoutRef.current) {
      clearTimeout(exitTimeoutRef.current);
      exitTimeoutRef.current = null;
    }
    if (enterTimeoutRef.current) {
      clearTimeout(enterTimeoutRef.current);
      enterTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = useCallback((project: Project, e: React.MouseEvent) => {
    clearTimeouts();

    const cursorOrigin = { x: e.clientX, y: e.clientY };
    const position = { x: e.clientX + 20, y: e.clientY - 50 };

    setPopupState((prev) => {
      // If we're already showing a different project, morph to the new one
      if (prev.project && prev.project.id !== project.id && prev.status !== 'hidden') {
        return {
          project,
          position,
          cursorOrigin,
          status: 'morphing',
          previousProject: prev.project,
        };
      }

      // Otherwise, enter fresh
      return {
        project,
        position,
        cursorOrigin,
        status: 'entering',
        previousProject: null,
      };
    });

    // After enter animation, set to visible
    enterTimeoutRef.current = setTimeout(() => {
      setPopupState((prev) => ({
        ...prev,
        status: 'visible',
        previousProject: null,
      }));
    }, 300);
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (popupState.status !== 'hidden') {
        setPopupState((prev) => ({
          ...prev,
          position: { x: e.clientX + 20, y: e.clientY - 50 },
        }));
      }
    },
    [popupState.status]
  );

  const handleMouseLeave = useCallback(() => {
    clearTimeouts();

    setPopupState((prev) => ({
      ...prev,
      status: 'exiting',
    }));

    // Remove from DOM after exit animation
    exitTimeoutRef.current = setTimeout(() => {
      setPopupState({
        project: null,
        position: { x: 0, y: 0 },
        cursorOrigin: { x: 0, y: 0 },
        status: 'hidden',
        previousProject: null,
      });
    }, 300);
  }, []);

  const handleClick = useCallback((projectId: string) => {
    setClickedProject((prev) => (prev === projectId ? null : projectId));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeouts();
  }, []);

  const showPopup = popupState.status !== 'hidden' && popupState.project;

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
          <div className="space-y-2">
            {projects.map((project) => (
              <div key={project.id} className="relative">
                {/* Project Trigger - Desktop: hover, Mobile: click */}
                <div
                  onMouseEnter={(e) => handleMouseEnter(project, e)}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={handleMouseLeave}
                  onClick={() => handleClick(project.id)}
                  className={`
                    p-4 rounded-xl border transition-all duration-300 cursor-pointer
                    ${clickedProject === project.id
                      ? 'bg-white/90 border-gray-300'
                      : 'bg-white/50 border-white/20 hover:bg-white/70'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-gray-400">folder_open</span>
                      <span className="font-medium text-gray-900">{project.title}</span>
                    </div>
                    <span className="material-symbols-outlined text-gray-400">
                      {clickedProject === project.id ? 'expand_less' : 'expand_more'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 ml-8">{project.shortDesc}</p>
                </div>

                {/* Mobile: Inline expanded content */}
                {clickedProject === project.id && (
                  <div className="md:hidden mt-2 p-4 bg-white/95 rounded-xl border border-gray-200">
                    <div className="flex flex-wrap gap-2 mb-3">
                      {project.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">
                      {project.fullDesc}
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <a href={project.demoUrl} className="text-blue-600 hover:underline">
                        View Demo →
                      </a>
                      <a href={project.githubUrl} className="text-gray-500 hover:text-gray-900">
                        GitHub
                      </a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: Animated Popup Card */}
      {showPopup && (
        <PopupCard
          project={popupState.project!}
          position={popupState.position}
          cursorOrigin={popupState.cursorOrigin}
          isExiting={popupState.status === 'exiting'}
          isEntering={popupState.status === 'entering'}
        />
      )}
    </div>
  );
}
