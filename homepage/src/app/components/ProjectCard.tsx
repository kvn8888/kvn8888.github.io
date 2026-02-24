'use client';

import { motion } from 'framer-motion';
import type { Project } from './types';

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
}

export function ProjectCard({ project, onClick }: ProjectCardProps) {
  return (
    <motion.div
      layoutId={`card-${project.id}`}
      onClick={onClick}
      className="p-4 rounded-xl border bg-white/50 border-white/20 hover:bg-white/80 transition-colors cursor-pointer group"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.span
            layoutId={`icon-${project.id}`}
            className="material-symbols-outlined text-gray-400 group-hover:text-gray-600 transition-colors"
          >
            folder_open
          </motion.span>
          <motion.span
            layoutId={`title-${project.id}`}
            className="font-medium text-gray-900"
          >
            {project.title}
          </motion.span>
        </div>
        <span className="material-symbols-outlined text-gray-400 group-hover:text-gray-900 transition-colors">
          arrow_outward
        </span>
      </div>
      <motion.p
        layoutId={`desc-${project.id}`}
        className="text-sm text-gray-500 mt-1 ml-[36px]"
      >
        {project.shortDesc}
      </motion.p>
    </motion.div>
  );
}
