'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedProject(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (selectedProject) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [selectedProject]);

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
          <div className="space-y-3 relative">
            {projects.map((project) => (
              <motion.div
                key={project.id}
                layoutId={`card-${project.id}`}
                onClick={() => setSelectedProject(project)}
                className="p-4 rounded-xl border bg-white/50 border-white/20 hover:bg-white/80 transition-colors cursor-pointer group"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{type: "spring", stiffness: 500, damping: 30}}
                >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <motion.span layoutId={`icon-${project.id}`} className="material-symbols-outlined text-gray-400 group-hover:text-gray-600 transition-colors">folder_open</motion.span>
                    <motion.span layoutId={`title-${project.id}`} className="font-medium text-gray-900">{project.title}</motion.span>
                  </div>
                  <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">arrow_outward</span>
                </div>
                <motion.p layoutId={`desc-${project.id}`} className="text-sm text-gray-500 mt-1 ml-[36px]">{project.shortDesc}</motion.p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Framer Motion Modal */}
      <AnimatePresence>
        {selectedProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSelectedProject(null)}
              className="absolute inset-0 bg-white/60 backdrop-blur-xl pointer-events-auto"
            />
            
            <motion.div
              layoutId={`card-${selectedProject.id}`}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="bg-white rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl relative border border-gray-100 flex flex-col z-10 overflow-hidden pointer-events-auto"
            >
              <button
                onClick={() => setSelectedProject(null)}
                className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors z-20"
              >
                <span className="material-symbols-outlined text-gray-500">close</span>
              </button>

              <div className="mb-6 pr-12">
                <div className="flex items-center gap-3 mb-2">
                  <motion.span layoutId={`icon-${selectedProject.id}`} className="material-symbols-outlined text-gray-400">folder_open</motion.span>
                  <motion.h3 layoutId={`title-${selectedProject.id}`} className="text-2xl font-medium text-gray-900 m-0">{selectedProject.title}</motion.h3>
                </div>
                <motion.p layoutId={`desc-${selectedProject.id}`} className="text-gray-500 ml-[36px]">{selectedProject.shortDesc}</motion.p>
              </div>

              <motion.div 
                initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
                animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                exit={{ opacity: 0, filter: 'blur(10px)', y: -10 }}
                transition={{ delay: 0.1, duration: 0.2 }}
                className="flex flex-col flex-grow ml-[36px]"
              >
                <div className="flex flex-wrap gap-2 mb-6">
                  {selectedProject.tags.map((tag) => (
                    <span key={tag} className="px-3 py-1 text-sm bg-gray-100 rounded-full text-gray-600">
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="text-gray-600 leading-relaxed mb-8">{selectedProject.fullDesc}</p>
                
                <div className="flex items-center gap-4 mt-auto">
                  <a
                    href={selectedProject.demoUrl}
                    className="inline-flex items-center justify-center px-6 py-3 bg-black text-white rounded-full font-medium hover:bg-gray-900 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    View Demo
                    <span className="material-symbols-outlined ml-1 text-sm">arrow_outward</span>
                  </a>
                  <a
                    href={selectedProject.githubUrl}
                    className="px-6 py-3 text-gray-600 hover:text-gray-900 font-medium transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    GitHub
                  </a>
                </div>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
