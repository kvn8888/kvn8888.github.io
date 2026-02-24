'use client';

import { useState, useCallback } from 'react';

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

export default function Home() {
  const [hoveredProject, setHoveredProject] = useState<Project | null>(null);
  const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
  const [clickedProject, setClickedProject] = useState<string | null>(null);

  const handleMouseEnter = useCallback((project: Project, e: React.MouseEvent) => {
    setHoveredProject(project);
    setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (hoveredProject) {
      setPopupPosition({ x: e.clientX + 20, y: e.clientY - 50 });
    }
  }, [hoveredProject]);

  const handleMouseLeave = useCallback(() => {
    setHoveredProject(null);
  }, []);

  const handleClick = useCallback((projectId: string) => {
    setClickedProject(prev => prev === projectId ? null : projectId);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative">
      {/* Aurora Background */}
      <div className="aurora-bg">
        <div className="aurora-blob aurora-blob-1"></div>
        <div className="aurora-blob aurora-blob-2"></div>
        <div className="aurora-blob aurora-blob-3"></div>
      </div>

      {/* Content */}
      <div className="text-center max-w-4xl mx-auto relative z-10">
        {/* Small tagline */}
        <p className="text-sm text-gray-500 mb-4 tracking-wide">
          Software Engineer & Builder
        </p>

        {/* Main headline */}
        <h1 className="text-5xl sm:text-6xl md:text-7xl font-medium tracking-tight mb-8 text-black">
          Welcome to KevinC.dev
        </h1>

        {/* Bio text */}
        <p className="text-lg text-gray-600 max-w-xl mx-auto mb-8 leading-relaxed">
          I&apos;m a software engineering student at the Rochester Institute of Technology.
          Currently on an internship at Ivalua, Inc.
        </p>

        {/* CTA Button */}
        <a
          href="#projects"
          className="inline-flex items-center justify-center px-8 py-4 bg-black text-white rounded-full font-medium hover:bg-gray-900 transition-colors shadow-lg hover:shadow-xl"
        >
          See my projects
        </a>

        {/* Projects Section */}
        <div id="projects" className="mt-20 w-full max-w-xl mx-auto">
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
                      <span className="material-symbols-outlined text-gray-400">
                        folder_open
                      </span>
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
                        <span key={tag} className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed mb-3">
                      {project.fullDesc}
                    </p>
                    <div className="flex items-center gap-4 text-sm">
                      <a href={project.demoUrl} className="text-blue-600 hover:underline">View Demo →</a>
                      <a href={project.githubUrl} className="text-gray-500 hover:text-gray-900">GitHub</a>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Desktop: Floating Popup Card */}
      {hoveredProject && (
        <div
          className="hidden md:block fixed z-50 w-80 p-6 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-gray-200 pointer-events-none"
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

          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            {hoveredProject.fullDesc}
          </p>

          <div className="flex items-center gap-4 text-sm pointer-events-auto">
            <a
              href={hoveredProject.demoUrl}
              className="text-blue-600 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              View Demo →
            </a>
            <a
              href={hoveredProject.githubUrl}
              className="text-gray-500 hover:text-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              GitHub
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
