'use client';

import { useState, useRef, useCallback } from 'react';

interface ProjectCardProps {
  title: string;
  shortDesc: string;
  tags: string[];
  fullDesc: string;
  demoUrl: string;
  githubUrl: string;
}

function ProjectCard({ title, shortDesc, tags, fullDesc, demoUrl, githubUrl }: ProjectCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [transformOrigin, setTransformOrigin] = useState('center center');

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setTransformOrigin(`${x}% ${y}%`);
  }, []);

  const handleMouseEnter = useCallback(() => {
    setIsActive(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsActive(false);
  }, []);

  const handleClick = useCallback(() => {
    setIsActive(!isActive);
  }, [isActive]);

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className="relative cursor-pointer"
      style={{ transformOrigin }}
    >
      <div
        className={`
          p-6 bg-white/50 backdrop-blur-sm rounded-2xl border border-white/20
          transition-all duration-500 ease-out overflow-hidden
          ${isActive ? 'bg-white/95 scale-105 shadow-2xl z-20' : 'hover:bg-white/70'}
        `}
        style={{
          transformOrigin: transformOrigin,
        }}
      >
        {/* Header - always visible */}
        <div className="flex items-center justify-between mb-2">
          <span className="font-medium text-gray-900">{title}</span>
          <span className={`material-symbols-outlined transition-colors ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
            arrow_outward
          </span>
        </div>
        <p className="text-sm text-gray-500">{shortDesc}</p>

        {/* Expanded content - appears on hover/tap */}
        <div
          className={`grid transition-all duration-500 ease-out ${isActive ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
          <div className="overflow-hidden">
            <div className="pt-4 mt-4 border-t border-gray-200">
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((tag) => (
                  <span key={tag} className="px-2 py-1 text-xs bg-gray-100 rounded-full text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{fullDesc}</p>
              <div className="mt-3 flex items-center gap-4 text-sm">
                <a href={demoUrl} className="text-blue-600 hover:underline">View Demo →</a>
                <a href={githubUrl} className="text-gray-500 hover:text-gray-900">GitHub</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const projects: ProjectCardProps[] = [
    {
      title: 'Password Entropy Checker',
      shortDesc: 'Security tool for analyzing password strength',
      tags: ['React', 'TypeScript', 'Cryptography'],
      fullDesc: 'A web application that calculates password entropy and provides real-time feedback on password strength using Shannon entropy calculations.',
      demoUrl: '#',
      githubUrl: '#',
    },
    {
      title: 'Google TTS UI',
      shortDesc: 'Text-to-speech interface with voice selection',
      tags: ['Next.js', 'API', 'Audio'],
      fullDesc: 'A polished UI for Google Cloud Text-to-Speech API with voice preview, speed control, and batch processing capabilities.',
      demoUrl: '#',
      githubUrl: '#',
    },
    {
      title: 'Receipt Automator',
      shortDesc: 'Automated receipt processing with OCR',
      tags: ['Python', 'OCR', 'Automation'],
      fullDesc: 'An intelligent system that extracts data from receipt images using OCR and automatically populates expense tracking spreadsheets.',
      demoUrl: '#',
      githubUrl: '#',
    },
  ];

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
        <div id="projects" className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl mx-auto items-start">
          {projects.map((project) => (
            <ProjectCard key={project.title} {...project} />
          ))}
        </div>
      </div>
    </div>
  );
}
