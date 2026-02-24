'use client';

import { motion } from 'framer-motion';
import type { Project } from './types';

interface ProjectModalProps {
  project: Project;
  onClose: () => void;
}

export function ProjectModal({ project, onClose }: ProjectModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 pointer-events-none">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className="absolute inset-0 bg-white/60 backdrop-blur-xl pointer-events-auto"
      />

      <motion.div
        layoutId={`card-${project.id}`}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="bg-white rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl relative border border-gray-100 flex flex-col z-10 overflow-hidden pointer-events-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100 transition-colors z-20"
        >
          <span className="material-symbols-outlined text-gray-500">close</span>
        </button>

        <div className="mb-6 pr-12">
          <div className="flex items-center gap-3 mb-2">
            <motion.span
              layoutId={`icon-${project.id}`}
              className="material-symbols-outlined text-gray-400"
            >
              folder_open
            </motion.span>
            <motion.h3
              layoutId={`title-${project.id}`}
              className="text-2xl font-medium text-gray-900 m-0"
            >
              {project.title}
            </motion.h3>
          </div>
          <motion.p
            layoutId={`desc-${project.id}`}
            className="text-gray-500 ml-[36px]"
          >
            {project.shortDesc}
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          exit={{ opacity: 0, filter: 'blur(10px)', y: -10 }}
          transition={{ delay: 0.1, duration: 0.2 }}
          className="flex flex-col flex-grow ml-[36px]"
        >
          <div className="flex flex-wrap gap-2 mb-6">
            {project.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 text-sm bg-gray-100 rounded-full text-gray-600"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="text-gray-600 leading-relaxed mb-8">{project.fullDesc}</p>

          <div className="flex items-center gap-4 mt-auto">
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
        </motion.div>
      </motion.div>
    </div>
  );
}
