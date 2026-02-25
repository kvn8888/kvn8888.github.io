export type ProjectCategory = 'personal' | 'academic' | 'hackathon';

export interface Project {
  id: string;
  title: string;
  shortDesc: string;
  tags: string[];
  fullDesc: string;
  demoUrl: string;
  githubUrl: string;
  category: ProjectCategory;
  /** Optional screenshot URL - width should be consistent, height can vary */
  screenshot?: string;
}
